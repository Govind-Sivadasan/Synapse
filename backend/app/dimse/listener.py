"""DIMSE C-STORE / C-ECHO SCP listener using pynetdicom."""

import asyncio
from pathlib import Path

import structlog
from pynetdicom import AE, evt, AllStoragePresentationContexts
from pynetdicom.sop_class import Verification
from pynetdicom.status import Status

from app.config import settings
from app.dimse.stats import (
    mark_listening,
    mark_stopped,
    record_association_accepted,
    record_association_rejected,
    record_c_echo,
    record_instance_received,
    record_studies_assembled,
)
from app.dimse.study_assembler import StudyAssembler
from app.services.allowed_aets import get_allowed_calling_aets
from app.services.runtime_config import get_runtime_config

logger = structlog.get_logger()

# DICOM status: Calling AE Title not recognized (see PS 3.8 Table 9-7)
CALLING_AE_NOT_RECOGNIZED = 0x0117


class DIMSEListener:
    def __init__(self) -> None:
        self.temp_path = Path(settings.temp_storage_path)
        self.temp_path.mkdir(parents=True, exist_ok=True)
        self.assembler = StudyAssembler(self.temp_path)
        self._ae: AE | None = None
        self._server = None
        self._executor_future = None

    def _calling_ae(self, assoc) -> str:
        return assoc.requestor.ae_title.strip()

    def _is_calling_ae_allowed(self, calling_ae: str) -> bool:
        if get_runtime_config()["dimse_promiscuous_mode"]:
            return True
        return calling_ae in get_allowed_calling_aets()

    def _handle_requested(self, event):
        calling_ae = self._calling_ae(event.assoc)
        if not self._is_calling_ae_allowed(calling_ae):
            logger.warning("association_rejected_unknown_ae", calling_ae=calling_ae)
            record_association_rejected(calling_ae, "calling_ae_not_registered")
            from tasks.dimse_tasks import log_dimse_association

            log_dimse_association.delay(
                event_type="DIMSE_ASSOCIATION_REJECTED",
                calling_ae_title=calling_ae,
                details={"reason": "calling_ae_not_registered"},
            )
            return CALLING_AE_NOT_RECOGNIZED
        return None

    def _handle_accepted(self, event):
        calling_ae = self._calling_ae(event.assoc)
        record_association_accepted(calling_ae)
        logger.info("association_accepted", calling_ae=calling_ae)
        from tasks.dimse_tasks import log_dimse_association

        log_dimse_association.delay(
            event_type="DIMSE_ASSOCIATION",
            calling_ae_title=calling_ae,
            details={"action": "accepted"},
        )

    def _handle_aborted(self, event):
        calling_ae = self._calling_ae(event.assoc)
        self.assembler.discard_association(event.assoc)
        logger.info("association_aborted", calling_ae=calling_ae)

    def _handle_echo(self, event):
        calling_ae = self._calling_ae(event.assoc)
        record_c_echo(calling_ae)
        return Status.SUCCESS

    def _handle_store(self, event):
        try:
            dataset = event.dataset
            dataset.file_meta = event.file_meta
            calling_ae = self._calling_ae(event.assoc)
            study_uid = str(dataset.StudyInstanceUID)
            record_instance_received(calling_ae, study_uid)
            self.assembler.register_instance(dataset, event.assoc)
            return Status.SUCCESS
        except Exception as exc:
            logger.error("c_store_failed", error=str(exc))
            return Status.PROCESSING_FAILURE

    def _handle_released(self, event):
        try:
            calling_ae = self._calling_ae(event.assoc)
            completed_studies = self.assembler.on_association_released(event.assoc)

            for study in completed_studies:
                record_studies_assembled(calling_ae, study.study_uid, len(study.instance_paths))
                from tasks.routing_tasks import route_study
                from app.observability.metrics import inc_counter

                inc_counter("synapse_dimse_studies_enqueued_total")
                route_study.delay(
                    study_uid=study.study_uid,
                    dicom_files=[str(p) for p in study.instance_paths],
                    metadata=study.metadata,
                    calling_ae_title=calling_ae,
                )
                logger.info(
                    "routing_task_enqueued",
                    study_uid=study.study_uid,
                    instances=len(study.instance_paths),
                    calling_ae=calling_ae,
                )
        except Exception as exc:
            logger.error("association_release_failed", error=str(exc))

    def _run_server(self):
        runtime = get_runtime_config()
        ae_title = runtime["dimse_ae_title"]
        port = runtime["dimse_port"]
        promiscuous = runtime["dimse_promiscuous_mode"]

        self._ae = AE(ae_title=ae_title)
        self._ae.supported_contexts = AllStoragePresentationContexts
        self._ae.add_supported_context(Verification)

        handlers = [
            (evt.EVT_REQUESTED, self._handle_requested),
            (evt.EVT_ACCEPTED, self._handle_accepted),
            (evt.EVT_ABORTED, self._handle_aborted),
            (evt.EVT_C_STORE, self._handle_store),
            (evt.EVT_C_ECHO, self._handle_echo),
            (evt.EVT_RELEASED, self._handle_released),
        ]
        mark_listening(ae_title, port, promiscuous)
        logger.info("dimse_listener_started", ae_title=ae_title, port=port, promiscuous=promiscuous)
        self._server = self._ae.start_server(("0.0.0.0", port), block=True, evt_handlers=handlers)

    async def start(self) -> None:
        loop = asyncio.get_running_loop()
        self._executor_future = await loop.run_in_executor(None, self._run_server)

    async def stop(self) -> None:
        if self._server:
            self._server.shutdown()
        mark_stopped()
        logger.info("dimse_listener_stopped")
