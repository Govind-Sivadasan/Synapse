"""Database-backed DIMSE listener metrics and activity feed."""

from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dimse_event import DimseEvent, DimseListenerMetrics

METRICS_ROW_ID = 1
MAX_RECENT_EVENTS = 50


async def _ensure_metrics_row(session: AsyncSession) -> DimseListenerMetrics:
    row = await session.get(DimseListenerMetrics, METRICS_ROW_ID)
    if row is None:
        row = DimseListenerMetrics(id=METRICS_ROW_ID)
        session.add(row)
        await session.flush()
    return row


async def record_dimse_activity(
    session: AsyncSession,
    *,
    event_type: str,
    calling_ae: str | None = None,
    study_uid: str | None = None,
    reason: str | None = None,
    instances: int | None = None,
    details: dict | None = None,
    record_feed_event: bool = False,
) -> None:
    """Update singleton counters and optionally append a feed event."""
    now = datetime.now(timezone.utc)
    metrics = await _ensure_metrics_row(session)

    if event_type == "association_accepted":
        metrics.associations_total += 1
        metrics.associations_accepted += 1
        metrics.last_association_at = now
        metrics.last_calling_ae = calling_ae
        record_feed_event = True
    elif event_type == "association_rejected":
        metrics.associations_total += 1
        metrics.associations_rejected += 1
        metrics.last_association_at = now
        metrics.last_calling_ae = calling_ae
        record_feed_event = True
    elif event_type == "c_echo":
        metrics.c_echo_total += 1
        record_feed_event = True
    elif event_type == "instance_received":
        metrics.instances_received += 1
        metrics.last_calling_ae = calling_ae
        metrics.last_study_uid = study_uid
    elif event_type == "study_assembled":
        metrics.studies_assembled += 1
        metrics.last_calling_ae = calling_ae
        metrics.last_study_uid = study_uid
        record_feed_event = True

    if record_feed_event:
        session.add(
            DimseEvent(
                event_type=event_type,
                calling_ae=calling_ae,
                study_uid=study_uid,
                reason=reason,
                instances=instances,
                details=details,
            )
        )
        await _trim_feed_events(session)

    metrics.updated_at = now
    await session.flush()


async def _trim_feed_events(session: AsyncSession) -> None:
    total = await session.scalar(select(func.count()).select_from(DimseEvent)) or 0
    if total <= MAX_RECENT_EVENTS:
        return
    cutoff = (
        await session.execute(
            select(DimseEvent.created_at)
            .order_by(DimseEvent.created_at.desc())
            .offset(MAX_RECENT_EVENTS - 1)
            .limit(1)
        )
    ).scalar_one_or_none()
    if cutoff is not None:
        await session.execute(delete(DimseEvent).where(DimseEvent.created_at < cutoff))


def _event_to_dict(event: DimseEvent) -> dict:
    payload: dict = {
        "type": event.event_type,
        "at": event.created_at.isoformat() if event.created_at else None,
    }
    if event.calling_ae:
        payload["calling_ae"] = event.calling_ae
    if event.study_uid:
        payload["study_uid"] = event.study_uid
    if event.reason:
        payload["reason"] = event.reason
    if event.instances is not None:
        payload["instances"] = event.instances
    return payload


async def get_dimse_statistics(session: AsyncSession) -> dict:
    """Load cumulative counters and recent feed events from the database."""
    metrics = await session.get(DimseListenerMetrics, METRICS_ROW_ID)
    if metrics is None:
        metrics = DimseListenerMetrics(id=METRICS_ROW_ID)

    result = await session.execute(
        select(DimseEvent).order_by(DimseEvent.created_at.desc()).limit(20)
    )
    recent_events = [_event_to_dict(e) for e in result.scalars().all()]

    return {
        "associations_total": metrics.associations_total,
        "associations_accepted": metrics.associations_accepted,
        "associations_rejected": metrics.associations_rejected,
        "c_echo_total": metrics.c_echo_total,
        "instances_received": metrics.instances_received,
        "studies_assembled": metrics.studies_assembled,
        "last_association_at": metrics.last_association_at,
        "last_calling_ae": metrics.last_calling_ae,
        "last_study_uid": metrics.last_study_uid,
        "recent_events": recent_events,
    }
