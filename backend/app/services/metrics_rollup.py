"""Increment and read pre-aggregated metric counters."""

from __future__ import annotations

from datetime import date, datetime, timezone

import structlog
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.metrics_rollup import DailyMetricRollup, MetricTotal
from app.models.migration import MigrationJob, MigrationStudyRecord
from app.models.routing import RoutingTransaction

logger = structlog.get_logger()

ROUTING_STATUS_KEYS = ("success", "failed", "partial", "no_match")


def routing_status_metric_key(status: str) -> str:
    return f"routing.{status}"


def migration_study_metric_key(status: str) -> str:
    return f"migration.study.{status}"


async def increment_metric(
    session: AsyncSession,
    metric_key: str,
    *,
    amount: int = 1,
    bucket_date: date | None = None,
) -> None:
    if amount <= 0:
        return

    total_stmt = (
        insert(MetricTotal)
        .values(metric_key=metric_key, count=amount)
        .on_conflict_do_update(
            index_elements=[MetricTotal.metric_key],
            set_={"count": MetricTotal.count + amount, "updated_at": func.now()},
        )
    )
    await session.execute(total_stmt)

    if bucket_date is not None:
        daily_stmt = (
            insert(DailyMetricRollup)
            .values(bucket_date=bucket_date, metric_key=metric_key, count=amount)
            .on_conflict_do_update(
                index_elements=[DailyMetricRollup.bucket_date, DailyMetricRollup.metric_key],
                set_={"count": DailyMetricRollup.count + amount, "updated_at": func.now()},
            )
        )
        await session.execute(daily_stmt)


async def record_routing_completion(
    session: AsyncSession,
    status: str,
    received_at: datetime,
) -> None:
    bucket = received_at.astimezone(timezone.utc).date()
    await increment_metric(session, "routing.total", bucket_date=bucket)
    await increment_metric(session, routing_status_metric_key(status), bucket_date=bucket)


async def record_migration_study_completion(
    session: AsyncSession,
    status: str,
    completed_at: datetime | None,
) -> None:
    when = completed_at or datetime.now(timezone.utc)
    bucket = when.astimezone(timezone.utc).date()
    await increment_metric(session, migration_study_metric_key(status), bucket_date=bucket)


async def get_metric_total(session: AsyncSession, metric_key: str) -> int:
    value = await session.scalar(
        select(MetricTotal.count).where(MetricTotal.metric_key == metric_key)
    )
    return int(value or 0)


async def get_daily_metric(session: AsyncSession, bucket_date: date, metric_key: str) -> int:
    value = await session.scalar(
        select(DailyMetricRollup.count).where(
            DailyMetricRollup.bucket_date == bucket_date,
            DailyMetricRollup.metric_key == metric_key,
        )
    )
    return int(value or 0)


async def get_routing_totals(session: AsyncSession) -> dict[str, int]:
    keys = ["routing.total", *[routing_status_metric_key(s) for s in ROUTING_STATUS_KEYS]]
    rows = (
        await session.execute(select(MetricTotal.metric_key, MetricTotal.count).where(MetricTotal.metric_key.in_(keys)))
    ).all()
    counts = {row[0]: int(row[1]) for row in rows}
    return {
        "total": counts.get("routing.total", 0),
        "success": counts.get(routing_status_metric_key("success"), 0),
        "failed": counts.get(routing_status_metric_key("failed"), 0),
        "partial": counts.get(routing_status_metric_key("partial"), 0),
        "no_match": counts.get(routing_status_metric_key("no_match"), 0),
    }


async def get_routing_today(session: AsyncSession, today: date) -> dict[str, int]:
    keys = ["routing.total", routing_status_metric_key("success")]
    rows = (
        await session.execute(
            select(DailyMetricRollup.metric_key, DailyMetricRollup.count).where(
                DailyMetricRollup.bucket_date == today,
                DailyMetricRollup.metric_key.in_(keys),
            )
        )
    ).all()
    counts = {row[0]: int(row[1]) for row in rows}
    return {
        "studies_today": counts.get("routing.total", 0),
        "success_today": counts.get(routing_status_metric_key("success"), 0),
    }


async def get_migration_study_totals(session: AsyncSession) -> dict[str, int]:
    keys = [migration_study_metric_key("success"), migration_study_metric_key("failed")]
    rows = (
        await session.execute(select(MetricTotal.metric_key, MetricTotal.count).where(MetricTotal.metric_key.in_(keys)))
    ).all()
    counts = {row[0]: int(row[1]) for row in rows}
    return {
        "studies_migrated": counts.get(migration_study_metric_key("success"), 0),
        "studies_failed": counts.get(migration_study_metric_key("failed"), 0),
    }


async def get_daily_volume_series(
    session: AsyncSession,
    metric_key: str,
    days: int,
    end: datetime,
) -> list[tuple[date, int]]:
    from datetime import timedelta

    start = (end - timedelta(days=days - 1)).date()
    rows = (
        await session.execute(
            select(DailyMetricRollup.bucket_date, DailyMetricRollup.count)
            .where(
                DailyMetricRollup.metric_key == metric_key,
                DailyMetricRollup.bucket_date >= start,
                DailyMetricRollup.bucket_date <= end.date(),
            )
            .order_by(DailyMetricRollup.bucket_date)
        )
    ).all()
    return [(row[0], int(row[1])) for row in rows]


async def rebuild_metric_rollups(session: AsyncSession) -> None:
    """Rebuild rollup tables from source tables (migration backfill / repair)."""
    await session.execute(MetricTotal.__table__.delete())
    await session.execute(DailyMetricRollup.__table__.delete())

    routing_rows = (
        await session.execute(
            select(
                RoutingTransaction.overall_status,
                func.date(func.timezone("UTC", RoutingTransaction.received_at)),
                func.count(),
            ).group_by(
                RoutingTransaction.overall_status,
                func.date(func.timezone("UTC", RoutingTransaction.received_at)),
            )
        )
    ).all()

    for status, bucket, count in routing_rows:
        if bucket is None:
            continue
        bucket_date = bucket if isinstance(bucket, date) else bucket
        await increment_metric(session, "routing.total", amount=int(count), bucket_date=bucket_date)
        await increment_metric(
            session,
            routing_status_metric_key(str(status)),
            amount=int(count),
            bucket_date=bucket_date,
        )

    migration_rows = (
        await session.execute(
            select(
                MigrationStudyRecord.status,
                func.date(func.timezone("UTC", MigrationStudyRecord.completed_at)),
                func.count(),
            )
            .where(MigrationStudyRecord.completed_at.isnot(None))
            .where(MigrationStudyRecord.status.in_(("success", "failed")))
            .group_by(
                MigrationStudyRecord.status,
                func.date(func.timezone("UTC", MigrationStudyRecord.completed_at)),
            )
        )
    ).all()

    for status, bucket, count in migration_rows:
        if bucket is None:
            continue
        bucket_date = bucket if isinstance(bucket, date) else bucket
        await increment_metric(
            session,
            migration_study_metric_key(str(status)),
            amount=int(count),
            bucket_date=bucket_date,
        )

    logger.info("metric_rollups_rebuilt")
