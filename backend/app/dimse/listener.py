"""DIMSE C-STORE / C-ECHO SCP listener using pynetdicom."""

import asyncio
import threading
import time
from pathlib import Path

import structlog
from pynetdicom import AE, evt, AllStoragePresentationContexts
from pynetdicom.sop_class import Verification
from pynetdicom.status import Status

from app.config import settings
from app.dimse.stats import (
    get_dimse_runtime,
    mark_listening,
    mark_stopped,
    record_association_accepted,
    record_association_rejected,
    record_c_echo,
    record_instance_received,
    record_studies_assembled,
    set_promiscuous_mode,
)
from app.dimse.study_assembler import StudyAssembler
from app.services.allowed_aets import get_required_calling_aets, is_calling_aet_allowed
from app.services.routing_backpressure import (
    OUT_OF_RESOURCES,
    is_routing_queue_overloaded,
    routing_queue_depth,
    wait_for_routing_queue_slot,
)
from app.services.runtime_config import get_runtime_config

logger = structlog.get_logger()

ROUTE_DEBOUNCE_SECONDS = 5.0

_active_listener: "DIMSEListener | None" = None
_bound_listener: "DIMSEListener | None" = None
_reload_lock = asyncio.Lock()


def bind_dimse_listener(listener: "DIMSEListener") -> None:
    """Register the process DIMSE listener for hot-reload from settings updates."""
    global _bound_listener
    _bound_listener = listener


async def reload_dimse_listener() -> dict:
    """Stop and restart the DIMSE listener to apply AE title / port changes."""
    if _bound_listener is None:
        raise RuntimeError("DIMSE listener is not registered")

    async with _reload_lock:
        try:
            await _bound_listener.reload()
        except TimeoutError as exc:
            raise RuntimeError(str(exc)) from exc

    runtime_state = get_dimse_runtime()
    configured = get_runtime_config()
    if not runtime_state.listening:
        raise RuntimeError("DIMSE listener failed to start after reload")

    if (
        runtime_state.ae_title != configured["dimse_ae_title"]
        or runtime_state.port != configured["dimse_port"]
    ):
        raise RuntimeError(
            "DIMSE listener is running but active AE title/port do not match configured values"
        )

    logger.info(
        "dimse_listener_reloaded",
        ae_title=runtime_state.ae_title,
        port=runtime_state.port,
    )
    return {
        "listening": runtime_state.listening,
        "active_ae_title": runtime_state.ae_title,
        "active_port": runtime_state.port,
    }


def calling_ae_from_assoc(assoc) -> str:
    """Resolve calling AE title from an association (primitive or requestor)."""
    ae = assoc.requestor.ae_title.strip()
    if ae:
        return ae
    primitive = getattr(assoc.requestor, "primitive", None)
    if primitive is None:
        return ""
    raw = primitive.calling_ae_title
    if isinstance(raw, bytes):
        return raw.decode("ascii", errors="ignore").strip()
    if isinstance(raw, str):
        return raw.strip()
    return ""


def refresh_calling_aet_policy() -> None:
    """Apply current promiscuous / allowed-AET policy to the running DIMSE listener."""
    if _active_listener is not None:
        _active_listener.apply_calling_aet_policy()


class DIMSEListener:
    def __init__(self) -> None:
        self.temp_path = Path(settings.temp_storage_path)
        self.temp_path.mkdir(parents=True, exist_ok=True)
        self.assembler = StudyAssembler(self.temp_path)
        self._ae: AE | None = None
        self._server = None
        self._executor_future = None
        self._stop_event = threading.Event()
        self._server_ready = threading.Event()
        self._route_timers: dict[str, threading.Timer] = {}
        self._route_lock = threading.Lock()
        self._pending_calling_ae: dict[str, str] = {}

    def apply_calling_aet_policy(self) -> None:
        if self._ae is None:
            return
        promiscuous = get_runtime_config()["dimse_promiscuous_mode"]
        required = get_required_calling_aets()
        self._ae.require_calling_aet = required
        set_promiscuous_mode(promiscuous)
        logger.info(
            "dimse_calling_aet_policy_applied",
            promiscuous=promiscuous,
            require_calling_aet=required,
        )

    def _schedule_routing(self, study_uid: str, calling_ae: str) -> None:
        self._pending_calling_ae[study_uid] = calling_ae

        def enqueue() -> None:
            with self._route_lock:
                self._route_timers.pop(study_uid, None)
            calling = self._pending_calling_ae.pop(study_uid, calling_ae)
            study = self.assembler.finalize_study(study_uid)
            if not study.instance_paths:
                return

            from tasks.routing_tasks import route_study
            from app.observability.metrics import inc_counter
            from app.observability.tracing import trace_kwargs

            wait_for_routing_queue_slot()
            inc_counter("synapse_dimse_studies_enqueued_total")
            route_study.delay(
                study_uid=study.study_uid,
                dicom_files=[str(p) for p in study.instance_paths],
                metadata=study.metadata,
                calling_ae_title=calling,
                **trace_kwargs(study_uid=study.study_uid),
            )
            logger.info(
                "routing_task_enqueued",
                study_uid=study.study_uid,
                instances=len(study.instance_paths),
                calling_ae=calling,
                modality=study.metadata.get("Modality"),
            )

        def start_timer() -> None:
            timer = threading.Timer(ROUTE_DEBOUNCE_SECONDS, enqueue)
            with self._route_lock:
                existing = self._route_timers.pop(study_uid, None)
                if existing:
                    existing.cancel()
                self._route_timers[study_uid] = timer
            timer.start()

        start_timer()

    def _cancel_route_timers(self) -> None:
        with self._route_lock:
            timers = list(self._route_timers.values())
            self._route_timers.clear()
        for timer in timers:
            timer.cancel()
        self._pending_calling_ae.clear()

    def _handle_rejected(self, event):
        calling_ae = calling_ae_from_assoc(event.assoc)
        if not calling_ae:
            return
        logger.warning("association_rejected_unknown_ae", calling_ae=calling_ae)
        record_association_rejected(calling_ae, "calling_ae_not_registered")
        from tasks.dimse_tasks import log_dimse_association

        log_dimse_association.delay(
            event_type="DIMSE_ASSOCIATION_REJECTED",
            calling_ae_title=calling_ae,
            details={"reason": "calling_ae_not_registered"},
        )

    def _handle_accepted(self, event):
        calling_ae = calling_ae_from_assoc(event.assoc)
        record_association_accepted(calling_ae)
        logger.info("association_accepted", calling_ae=calling_ae)
        from tasks.dimse_tasks import log_dimse_association

        log_dimse_association.delay(
            event_type="DIMSE_ASSOCIATION",
            calling_ae_title=calling_ae,
            details={"action": "accepted"},
        )

    def _handle_aborted(self, event):
        calling_ae = calling_ae_from_assoc(event.assoc)
        self.assembler.discard_association(event.assoc)
        logger.info("association_aborted", calling_ae=calling_ae)

    def _handle_echo(self, event):
        calling_ae = calling_ae_from_assoc(event.assoc)
        if not is_calling_aet_allowed(calling_ae):
            logger.warning("c_echo_refused_unknown_ae", calling_ae=calling_ae)
            return Status.PROCESSING_FAILURE
        record_c_echo(calling_ae)
        return Status.SUCCESS

    def _handle_store(self, event):
        try:
            calling_ae = calling_ae_from_assoc(event.assoc)
            if not is_calling_aet_allowed(calling_ae):
                logger.warning("c_store_refused_unknown_ae", calling_ae=calling_ae)
                return Status.PROCESSING_FAILURE

            if settings.routing_backpressure_dimse_refuse and is_routing_queue_overloaded():
                from app.observability.metrics import inc_counter

                inc_counter("synapse_routing_backpressure_dimse_refusals_total")
                logger.warning(
                    "c_store_refused_backpressure",
                    calling_ae=calling_ae,
                    queue_depth=routing_queue_depth(),
                    limit=settings.routing_queue_backpressure_max,
                )
                return OUT_OF_RESOURCES

            dataset = event.dataset
            dataset.file_meta = event.file_meta
            study_uid = str(dataset.StudyInstanceUID)
            record_instance_received(calling_ae, study_uid)
            self.assembler.register_instance(dataset, event.assoc)
            return Status.SUCCESS
        except Exception as exc:
            logger.error("c_store_failed", error=str(exc))
            return Status.PROCESSING_FAILURE

    def _handle_released(self, event):
        try:
            calling_ae = calling_ae_from_assoc(event.assoc)
            completed_studies = self.assembler.on_association_released(event.assoc)

            for study in completed_studies:
                record_studies_assembled(calling_ae, study.study_uid, len(study.instance_paths))
                self._schedule_routing(study.study_uid, calling_ae)
        except Exception as exc:
            logger.error("association_release_failed", error=str(exc))

    def _shutdown_server(self) -> None:
        server = self._server
        ae = self._ae
        if server is not None:
            try:
                server.shutdown()
            except Exception:
                logger.exception("dimse_server_shutdown_error")
        if ae is not None:
            try:
                ae.shutdown()
            except Exception:
                logger.exception("dimse_ae_shutdown_error")

    def _run_server(self):
        global _active_listener
        runtime = get_runtime_config()
        ae_title = runtime["dimse_ae_title"]
        port = runtime["dimse_port"]
        promiscuous = runtime["dimse_promiscuous_mode"]

        self._stop_event.clear()
        self._server_ready.clear()

        try:
            self._ae = AE(ae_title=ae_title)
            self._ae.supported_contexts = AllStoragePresentationContexts
            self._ae.add_supported_context(Verification)
            _active_listener = self
            self.apply_calling_aet_policy()

            handlers = [
                (evt.EVT_REJECTED, self._handle_rejected),
                (evt.EVT_ACCEPTED, self._handle_accepted),
                (evt.EVT_ABORTED, self._handle_aborted),
                (evt.EVT_C_STORE, self._handle_store),
                (evt.EVT_C_ECHO, self._handle_echo),
                (evt.EVT_RELEASED, self._handle_released),
            ]
            self._server = self._ae.start_server(
                ("0.0.0.0", port),
                block=False,
                evt_handlers=handlers,
            )
            mark_listening(ae_title, port, promiscuous)
            logger.info("dimse_listener_started", ae_title=ae_title, port=port, promiscuous=promiscuous)
            self._server_ready.set()
            self._stop_event.wait()
        except Exception:
            mark_stopped()
            _active_listener = None
            self._server = None
            self._server_ready.set()
            raise
        finally:
            self._shutdown_server()
            self._server = None
            self._ae = None
            _active_listener = None
            mark_stopped()
            logger.info("dimse_listener_thread_exited")

    async def start(self, *, force: bool = False) -> None:
        if (
            not force
            and self._executor_future is not None
            and not self._executor_future.done()
        ):
            return
        loop = asyncio.get_running_loop()
        self._executor_future = loop.run_in_executor(None, self._run_server)

    async def _wait_for_server_ready(self, timeout: float) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self._server_ready.is_set() and self._server is not None:
                return
            future = self._executor_future
            if future is not None and future.done():
                exc = future.exception()
                if exc is not None:
                    raise RuntimeError(f"DIMSE listener failed to start: {exc}") from exc
                if not self._server_ready.is_set():
                    raise RuntimeError("DIMSE listener thread exited before becoming ready")
                return
            await asyncio.sleep(0.05)
        raise TimeoutError("DIMSE listener did not become ready")

    async def stop(self, timeout: float = 30.0) -> None:
        self._cancel_route_timers()

        if not self._stop_event.is_set():
            self._stop_event.set()

        future = self._executor_future
        loop = asyncio.get_running_loop()

        if self._server is None and future is not None and not future.done():
            try:
                await self._wait_for_server_ready(min(timeout, 5.0))
            except TimeoutError:
                pass

        if self._server is not None or self._ae is not None:
            try:
                await asyncio.wait_for(
                    loop.run_in_executor(None, self._shutdown_server),
                    timeout=timeout * 0.75,
                )
            except asyncio.TimeoutError:
                logger.error("dimse_listener_shutdown_timeout")
                raise TimeoutError(
                    "DIMSE listener did not stop in time. Active associations may be blocking shutdown."
                ) from None
            except Exception:
                logger.exception("dimse_listener_shutdown_error")

        if future is not None:
            try:
                await asyncio.wait_for(future, timeout=timeout * 0.25)
            except asyncio.TimeoutError:
                logger.error("dimse_listener_thread_join_timeout")
                raise TimeoutError(
                    "DIMSE listener did not stop in time. Active associations may be blocking shutdown."
                ) from None
            except Exception:
                logger.exception("dimse_listener_thread_exit_error")

        self._executor_future = None
        self._server = None
        self._ae = None
        self._stop_event.clear()
        self._server_ready.clear()
        logger.info("dimse_listener_stopped")

    async def reload(self) -> None:
        await self.stop()
        await self.start(force=True)
        await self._wait_until_listening()

    async def _wait_until_listening(self, timeout: float = 15.0) -> None:
        await self._wait_for_server_ready(timeout)
        if not get_dimse_runtime().listening:
            raise RuntimeError("DIMSE listener failed to start after reload")
