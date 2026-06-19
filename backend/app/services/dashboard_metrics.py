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
from app.services.metrics_rollup import (
    get_daily_volume_series,
    get_migration_study_totals,
    get_routing_today,
    get_routing_totals,
    migration_study_metric_key,
)


async def get_dashboard_metrics(db: AsyncSession) -> DashboardMetricsResponse:
    today = datetime.now(timezone.utc).date()
    routing_totals = await get_routing_totals(db)
    routing_today = await get_routing_today(db, today)
    migration_totals = await get_migration_study_totals(db)

    job_rows = (
        await db.execute(select(MigrationJob.status, func.count()).group_by(MigrationJob.status))
    ).all()
    job_counts = {row[0]: int(row[1]) for row in job_rows}
    total_jobs = sum(job_counts.values())
    active_jobs = job_counts.get("in_progress", 0)
    completed_jobs = job_counts.get("completed", 0) + job_counts.get("partial", 0)

    total = routing_totals["total"]
    success = routing_totals["success"]
    studies_today = routing_today["studies_today"]
    success_today = routing_today["success_today"]

    dimse_stats = await get_dimse_statistics(db)
    runtime = get_dimse_runtime()

    return DashboardMetricsResponse(
        routing=RoutingMetrics(
            total=total,
            success=success,
            failed=routing_totals["failed"],
            partial=routing_totals["partial"],
            no_match=routing_totals["no_match"],
            success_rate=round(success / max(total, 1) * 100, 2),
            studies_today=studies_today,
            success_rate_today=round(success_today / max(studies_today, 1) * 100, 2),
        ),
        migration=MigrationMetrics(
            total_jobs=total_jobs,
            active_jobs=active_jobs,
            completed_jobs=completed_jobs,
            studies_migrated=migration_totals["studies_migrated"],
            studies_failed=migration_totals["studies_failed"],
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
    routing_rows = await get_daily_volume_series(db, "routing.total", days, now)
    migration_rows = await get_daily_volume_series(
        db, migration_study_metric_key("success"), days, now
    )

    return VolumeChartResponse(
        days=days,
        routing=_fill_daily_series(routing_rows, days, now),
        migration=_fill_daily_series(migration_rows, days, now),
    )


async def get_modality_chart(db: AsyncSession, days: int = 30) -> list[ChartDataPoint]:
    query = (
        select(RoutingTransaction.modality, func.count())
        .where(
            RoutingTransaction.modality.isnot(None),
            RoutingTransaction.modality != "",
        )
    )
    if days > 0:
        now = datetime.now(timezone.utc)
        if days == 1:
            cutoff = now.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            cutoff = now - timedelta(days=days)
        query = query.where(RoutingTransaction.received_at >= cutoff)
    rows = (
        await db.execute(
            query.group_by(RoutingTransaction.modality)
            .order_by(func.count().desc())
            .limit(8)
        )
    ).all()
    return [ChartDataPoint(label=row[0] or "Unknown", value=row[1]) for row in rows]


async def get_status_chart(db: AsyncSession) -> list[ChartDataPoint]:
    totals = await get_routing_totals(db)
    return [
        ChartDataPoint(label="success", value=totals["success"]),
        ChartDataPoint(label="failed", value=totals["failed"]),
        ChartDataPoint(label="partial", value=totals["partial"]),
        ChartDataPoint(label="no_match", value=totals["no_match"]),
    ]


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
    cutoff = None if days <= 0 else datetime.now(timezone.utc) - timedelta(days=days)

    if cutoff is None:
        routing_totals = await get_routing_totals(db)
        routing_studies = routing_totals["total"]
        routing_success = routing_totals["success"]
        migration_totals = await get_migration_study_totals(db)
        migration_completed = migration_totals["studies_migrated"]
        migration_failed = migration_totals["studies_failed"]
    else:
        start_date = cutoff.date()
        end_date = datetime.now(timezone.utc).date()
        routing_studies = 0
        routing_success = 0
        migration_completed = 0
        migration_failed = 0
        current = start_date
        while current <= end_date:
            from app.services.metrics_rollup import get_daily_metric, routing_status_metric_key

            routing_studies += await get_daily_metric(db, current, "routing.total")
            routing_success += await get_daily_metric(db, current, routing_status_metric_key("success"))
            migration_completed += await get_daily_metric(
                db, current, migration_study_metric_key("success")
            )
            migration_failed += await get_daily_metric(db, current, migration_study_metric_key("failed"))
            current += timedelta(days=1)

    audit_query = select(func.count()).select_from(AuditLog)
    if cutoff:
        audit_query = audit_query.where(AuditLog.created_at >= cutoff)
    audit_events = await db.scalar(audit_query) or 0

    top_modalities = await get_modality_chart(db, days=days)

    if cutoff is None:
        routing_by_status = await get_status_chart(db)
    else:
        routing_by_status_query = select(RoutingTransaction.overall_status, func.count()).where(
            RoutingTransaction.received_at >= cutoff
        )
        routing_by_status_rows = (
            await db.execute(routing_by_status_query.group_by(RoutingTransaction.overall_status))
        ).all()
        routing_by_status = [
            ChartDataPoint(label=row[0], value=row[1]) for row in routing_by_status_rows
        ]

    return ReportSummaryResponse(
        period_days=days,
        routing_studies=routing_studies,
        routing_success_rate=round(routing_success / max(routing_studies, 1) * 100, 2),
        migration_studies_completed=migration_completed,
        migration_studies_failed=migration_failed,
        audit_events=audit_events,
        top_modalities=top_modalities,
        routing_by_status=routing_by_status,
    )
