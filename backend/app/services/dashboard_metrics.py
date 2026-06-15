"""Dashboard and reporting aggregation queries."""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dimse.stats import get_dimse_runtime
from app.services.dimse_event_store import get_dimse_statistics
from app.models.audit_log import AuditLog
from app.models.migration import MigrationJob, MigrationStudyRecord
from app.models.routing import RoutingTransaction
from app.schemas.dashboard import (
    ActivityFeedResponse,
    ActivityItem,
    ChartDataPoint,
    DashboardMetricsResponse,
    DimseMetrics,
    MigrationMetrics,
    ReportSummaryResponse,
    RoutingMetrics,
    VolumeChartResponse,
)


async def get_dashboard_metrics(db: AsyncSession) -> DashboardMetricsResponse:
    total = await db.scalar(select(func.count()).select_from(RoutingTransaction)) or 0
    success = await db.scalar(
        select(func.count())
        .select_from(RoutingTransaction)
        .where(RoutingTransaction.overall_status == "success")
    ) or 0
    failed = await db.scalar(
        select(func.count())
        .select_from(RoutingTransaction)
        .where(RoutingTransaction.overall_status == "failed")
    ) or 0
    partial = await db.scalar(
        select(func.count())
        .select_from(RoutingTransaction)
        .where(RoutingTransaction.overall_status == "partial")
    ) or 0
    no_match = await db.scalar(
        select(func.count())
        .select_from(RoutingTransaction)
        .where(RoutingTransaction.overall_status == "no_match")
    ) or 0

    total_jobs = await db.scalar(select(func.count()).select_from(MigrationJob)) or 0
    active_jobs = await db.scalar(
        select(func.count()).select_from(MigrationJob).where(MigrationJob.status == "in_progress")
    ) or 0
    completed_jobs = await db.scalar(
        select(func.count())
        .select_from(MigrationJob)
        .where(MigrationJob.status.in_(("completed", "partial")))
    ) or 0
    studies_migrated = await db.scalar(
        select(func.count())
        .select_from(MigrationStudyRecord)
        .where(MigrationStudyRecord.status == "success")
    ) or 0
    studies_failed = await db.scalar(
        select(func.count())
        .select_from(MigrationStudyRecord)
        .where(MigrationStudyRecord.status == "failed")
    ) or 0

    dimse_stats = await get_dimse_statistics(db)
    runtime = get_dimse_runtime()

    return DashboardMetricsResponse(
        routing=RoutingMetrics(
            total=total,
            success=success,
            failed=failed,
            partial=partial,
            no_match=no_match,
            success_rate=round(success / max(total, 1) * 100, 2),
        ),
        migration=MigrationMetrics(
            total_jobs=total_jobs,
            active_jobs=active_jobs,
            completed_jobs=completed_jobs,
            studies_migrated=studies_migrated,
            studies_failed=studies_failed,
        ),
        dimse=DimseMetrics(
            listening=runtime.listening,
            studies_assembled=dimse_stats["studies_assembled"],
            instances_received=dimse_stats["instances_received"],
            associations_accepted=dimse_stats["associations_accepted"],
            associations_rejected=dimse_stats["associations_rejected"],
        ),
    )


def _fill_daily_series(
    rows: list[tuple[date, int]],
    days: int,
    end: datetime,
) -> list[ChartDataPoint]:
    from datetime import date as date_cls

    counts = {row[0]: row[1] for row in rows if row[0]}
    start = (end - timedelta(days=days - 1)).date()
    series: list[ChartDataPoint] = []
    current = start
    end_date = end.date()
    while current <= end_date:
        series.append(ChartDataPoint(label=current.isoformat(), value=counts.get(current, 0)))
        current += timedelta(days=1)
    return series


async def get_volume_chart(db: AsyncSession, days: int = 7) -> VolumeChartResponse:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)

    routing_rows = (
        await db.execute(
            select(cast(RoutingTransaction.received_at, Date), func.count())
            .where(RoutingTransaction.received_at >= cutoff)
            .group_by(cast(RoutingTransaction.received_at, Date))
        )
    ).all()

    migration_rows = (
        await db.execute(
            select(cast(MigrationStudyRecord.completed_at, Date), func.count())
            .where(
                MigrationStudyRecord.completed_at >= cutoff,
                MigrationStudyRecord.status == "success",
            )
            .group_by(cast(MigrationStudyRecord.completed_at, Date))
        )
    ).all()

    return VolumeChartResponse(
        days=days,
        routing=_fill_daily_series(routing_rows, days, now),
        migration=_fill_daily_series(migration_rows, days, now),
    )


async def get_modality_chart(db: AsyncSession, days: int = 30) -> list[ChartDataPoint]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        await db.execute(
            select(RoutingTransaction.modality, func.count())
            .where(
                RoutingTransaction.received_at >= cutoff,
                RoutingTransaction.modality.isnot(None),
                RoutingTransaction.modality != "",
            )
            .group_by(RoutingTransaction.modality)
            .order_by(func.count().desc())
            .limit(8)
        )
    ).all()
    return [ChartDataPoint(label=row[0] or "Unknown", value=row[1]) for row in rows]


async def get_status_chart(db: AsyncSession) -> list[ChartDataPoint]:
    rows = (
        await db.execute(
            select(RoutingTransaction.overall_status, func.count())
            .group_by(RoutingTransaction.overall_status)
            .order_by(func.count().desc())
        )
    ).all()
    return [ChartDataPoint(label=row[0], value=row[1]) for row in rows]


def _mask_study_uid(study_uid: str) -> str:
    if len(study_uid) <= 12:
        return study_uid
    return f"{study_uid[:8]}…{study_uid[-4:]}"


async def get_activity_feed(db: AsyncSession, limit: int = 15, mask_phi: bool = False) -> ActivityFeedResponse:
    routing = (
        await db.execute(
            select(RoutingTransaction)
            .order_by(RoutingTransaction.received_at.desc())
            .limit(limit)
        )
    ).scalars().all()

    migration = (
        await db.execute(
            select(MigrationStudyRecord)
            .where(MigrationStudyRecord.completed_at.isnot(None))
            .order_by(MigrationStudyRecord.completed_at.desc())
            .limit(max(5, limit // 3))
        )
    ).scalars().all()

    items: list[ActivityItem] = []
    for txn in routing:
        uid = _mask_study_uid(txn.study_uid) if mask_phi else txn.study_uid
        items.append(
            ActivityItem(
                id=str(txn.id),
                type="routing",
                title=f"Study routed — {txn.modality or 'Unknown'}",
                subtitle=uid,
                status=txn.overall_status,
                timestamp=txn.received_at,
            )
        )

    for rec in migration:
        uid = _mask_study_uid(rec.study_uid) if mask_phi else rec.study_uid
        items.append(
            ActivityItem(
                id=str(rec.id),
                type="migration",
                title="Migration study",
                subtitle=uid,
                status=rec.status,
                timestamp=rec.completed_at or rec.created_at,
            )
        )

    items.sort(key=lambda i: i.timestamp, reverse=True)
    return ActivityFeedResponse(items=items[:limit])


async def get_report_summary(db: AsyncSession, days: int = 7) -> ReportSummaryResponse:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    routing_studies = await db.scalar(
        select(func.count())
        .select_from(RoutingTransaction)
        .where(RoutingTransaction.received_at >= cutoff)
    ) or 0
    routing_success = await db.scalar(
        select(func.count())
        .select_from(RoutingTransaction)
        .where(
            RoutingTransaction.received_at >= cutoff,
            RoutingTransaction.overall_status == "success",
        )
    ) or 0
    migration_completed = await db.scalar(
        select(func.count())
        .select_from(MigrationStudyRecord)
        .where(
            MigrationStudyRecord.completed_at >= cutoff,
            MigrationStudyRecord.status == "success",
        )
    ) or 0
    migration_failed = await db.scalar(
        select(func.count())
        .select_from(MigrationStudyRecord)
        .where(
            MigrationStudyRecord.completed_at >= cutoff,
            MigrationStudyRecord.status == "failed",
        )
    ) or 0
    audit_events = await db.scalar(
        select(func.count()).select_from(AuditLog).where(AuditLog.created_at >= cutoff)
    ) or 0

    top_modalities = await get_modality_chart(db, days=days)
    routing_by_status = (
        await db.execute(
            select(RoutingTransaction.overall_status, func.count())
            .where(RoutingTransaction.received_at >= cutoff)
            .group_by(RoutingTransaction.overall_status)
        )
    ).all()

    return ReportSummaryResponse(
        period_days=days,
        routing_studies=routing_studies,
        routing_success_rate=round(routing_success / max(routing_studies, 1) * 100, 2),
        migration_studies_completed=migration_completed,
        migration_studies_failed=migration_failed,
        audit_events=audit_events,
        top_modalities=top_modalities,
        routing_by_status=[
            ChartDataPoint(label=row[0], value=row[1]) for row in routing_by_status
        ],
    )
