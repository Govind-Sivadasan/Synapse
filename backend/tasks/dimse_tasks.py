"""Celery tasks for DIMSE association audit logging and persisted metrics."""

import structlog

from app.database import run_async_task
from celery_app import celery_app

logger = structlog.get_logger()


async def _log_association(
    event_type: str,
    calling_ae_title: str,
    details: dict | None = None,
) -> None:
    from app.database import async_session_factory
    from app.services.audit_logger import AuditLogger

    async with async_session_factory() as session:
        await AuditLogger.log(
            session,
            event_type,
            entity_type="DIMSEAssociation",
            details={
                "calling_ae_title": calling_ae_title,
                **(details or {}),
            },
        )
        await session.commit()


async def _persist_dimse_activity(
    event_type: str,
    calling_ae: str | None = None,
    study_uid: str | None = None,
    reason: str | None = None,
    instances: int | None = None,
    details: dict | None = None,
) -> None:
    from app.database import async_session_factory
    from app.services.dimse_event_store import record_dimse_activity as persist

    async with async_session_factory() as session:
        await persist(
            session,
            event_type=event_type,
            calling_ae=calling_ae,
            study_uid=study_uid,
            reason=reason,
            instances=instances,
            details=details,
        )
        await session.commit()


@celery_app.task(name="tasks.dimse_tasks.log_dimse_association")
def log_dimse_association(
    event_type: str,
    calling_ae_title: str,
    details: dict | None = None,
) -> dict:
    run_async_task(_log_association(event_type, calling_ae_title, details))
    return {"logged": True, "event_type": event_type}


@celery_app.task(name="tasks.dimse_tasks.record_dimse_activity")
def record_dimse_activity(
    event_type: str,
    calling_ae: str | None = None,
    study_uid: str | None = None,
    reason: str | None = None,
    instances: int | None = None,
    details: dict | None = None,
) -> dict:
    run_async_task(
        _persist_dimse_activity(
            event_type,
            calling_ae=calling_ae,
            study_uid=study_uid,
            reason=reason,
            instances=instances,
            details=details,
        )
    )
    return {"recorded": True, "event_type": event_type}
