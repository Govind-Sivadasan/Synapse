"""Thread-safe DIMSE listener runtime state (process-local only)."""

import threading
from dataclasses import dataclass


@dataclass
class DimseRuntimeState:
    listening: bool = False
    ae_title: str = ""
    port: int = 0
    promiscuous_mode: bool = False


_lock = threading.Lock()
_runtime = DimseRuntimeState()


def get_dimse_runtime() -> DimseRuntimeState:
    with _lock:
        return DimseRuntimeState(
            listening=_runtime.listening,
            ae_title=_runtime.ae_title,
            port=_runtime.port,
            promiscuous_mode=_runtime.promiscuous_mode,
        )


def mark_listening(ae_title: str, port: int, promiscuous_mode: bool) -> None:
    with _lock:
        _runtime.listening = True
        _runtime.ae_title = ae_title
        _runtime.port = port
        _runtime.promiscuous_mode = promiscuous_mode


def set_promiscuous_mode(promiscuous_mode: bool) -> None:
    with _lock:
        _runtime.promiscuous_mode = promiscuous_mode


def mark_stopped() -> None:
    with _lock:
        _runtime.listening = False


def _enqueue_activity(**kwargs) -> None:
    from tasks.dimse_tasks import record_dimse_activity

    record_dimse_activity.delay(**kwargs)


def record_association_rejected(calling_ae: str, reason: str) -> None:
    _enqueue_activity(
        event_type="association_rejected",
        calling_ae=calling_ae,
        reason=reason,
    )


def record_association_accepted(calling_ae: str) -> None:
    _enqueue_activity(
        event_type="association_accepted",
        calling_ae=calling_ae,
    )


def record_c_echo(calling_ae: str) -> None:
    _enqueue_activity(
        event_type="c_echo",
        calling_ae=calling_ae,
    )


def record_instance_received(calling_ae: str, study_uid: str) -> None:
    _enqueue_activity(
        event_type="instance_received",
        calling_ae=calling_ae,
        study_uid=study_uid,
    )


def record_studies_assembled(calling_ae: str, study_uid: str, instance_count: int) -> None:
    _enqueue_activity(
        event_type="study_assembled",
        calling_ae=calling_ae,
        study_uid=study_uid,
        instances=instance_count,
    )
