"""Thread-safe DIMSE listener operational statistics."""

import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class DimseStats:
    listening: bool = False
    ae_title: str = ""
    port: int = 0
    promiscuous_mode: bool = False
    associations_total: int = 0
    associations_rejected: int = 0
    associations_accepted: int = 0
    c_echo_total: int = 0
    instances_received: int = 0
    studies_assembled: int = 0
    last_association_at: datetime | None = None
    last_calling_ae: str | None = None
    last_study_uid: str | None = None
    recent_events: list[dict] = field(default_factory=list)


_lock = threading.Lock()
_stats = DimseStats()


def get_dimse_stats() -> DimseStats:
    with _lock:
        return DimseStats(
            listening=_stats.listening,
            ae_title=_stats.ae_title,
            port=_stats.port,
            promiscuous_mode=_stats.promiscuous_mode,
            associations_total=_stats.associations_total,
            associations_rejected=_stats.associations_rejected,
            associations_accepted=_stats.associations_accepted,
            c_echo_total=_stats.c_echo_total,
            instances_received=_stats.instances_received,
            studies_assembled=_stats.studies_assembled,
            last_association_at=_stats.last_association_at,
            last_calling_ae=_stats.last_calling_ae,
            last_study_uid=_stats.last_study_uid,
            recent_events=list(_stats.recent_events),
        )


def _append_event(event: dict) -> None:
    _stats.recent_events.insert(0, event)
    _stats.recent_events = _stats.recent_events[:50]


def mark_listening(ae_title: str, port: int, promiscuous_mode: bool) -> None:
    with _lock:
        _stats.listening = True
        _stats.ae_title = ae_title
        _stats.port = port
        _stats.promiscuous_mode = promiscuous_mode


def mark_stopped() -> None:
    with _lock:
        _stats.listening = False


def record_association_rejected(calling_ae: str, reason: str) -> None:
    with _lock:
        _stats.associations_total += 1
        _stats.associations_rejected += 1
        _stats.last_association_at = datetime.now(timezone.utc)
        _stats.last_calling_ae = calling_ae
        _append_event(
            {
                "type": "association_rejected",
                "calling_ae": calling_ae,
                "reason": reason,
                "at": _stats.last_association_at.isoformat(),
            }
        )


def record_association_accepted(calling_ae: str) -> None:
    with _lock:
        _stats.associations_total += 1
        _stats.associations_accepted += 1
        _stats.last_association_at = datetime.now(timezone.utc)
        _stats.last_calling_ae = calling_ae
        _append_event(
            {
                "type": "association_accepted",
                "calling_ae": calling_ae,
                "at": _stats.last_association_at.isoformat(),
            }
        )


def record_c_echo(calling_ae: str) -> None:
    with _lock:
        _stats.c_echo_total += 1
        _append_event(
            {
                "type": "c_echo",
                "calling_ae": calling_ae,
                "at": datetime.now(timezone.utc).isoformat(),
            }
        )


def record_instance_received(calling_ae: str, study_uid: str) -> None:
    with _lock:
        _stats.instances_received += 1
        _stats.last_study_uid = study_uid
        _stats.last_calling_ae = calling_ae


def record_studies_assembled(calling_ae: str, study_uid: str, instance_count: int) -> None:
    with _lock:
        _stats.studies_assembled += 1
        _stats.last_study_uid = study_uid
        _stats.last_calling_ae = calling_ae
        _append_event(
            {
                "type": "study_assembled",
                "calling_ae": calling_ae,
                "study_uid": study_uid,
                "instances": instance_count,
                "at": datetime.now(timezone.utc).isoformat(),
            }
        )
