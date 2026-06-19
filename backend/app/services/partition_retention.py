"""Drop expired monthly PostgreSQL partitions (Phase 3.2 — retention policy)."""

from __future__ import annotations

from datetime import date, datetime, timezone

import structlog
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.config import settings
from app.observability.metrics import inc_counter
from app.services.partition_maintenance import PARTITIONED_TABLES, add_months

logger = structlog.get_logger()

TABLE_RETENTION_MONTHS: dict[str, int] = {
    "audit_logs": 12,
    "dimse_events": 6,
    "routing_transactions": 12,
    "migration_study_records": 24,
}


def retention_months_for_table(table: str) -> int:
    return TABLE_RETENTION_MONTHS.get(table, 12)


def first_month_to_retain(retention_months: int, *, today: date | None = None) -> date:
    """Oldest partition month start that is still kept (inclusive)."""
    if retention_months <= 0:
        return date.max
    today = today or datetime.now(timezone.utc).date()
    current = date(today.year, today.month, 1)
    return add_months(current, -(retention_months - 1))


def parse_partition_month(partition_name: str, parent_table: str) -> date | None:
    prefix = f"{parent_table}_"
    if not partition_name.startswith(prefix):
        return None
    suffix = partition_name[len(prefix) :]
    parts = suffix.split("_")
    if len(parts) != 2:
        return None
    try:
        year, month = int(parts[0]), int(parts[1])
        if month < 1 or month > 12:
            return None
        return date(year, month, 1)
    except ValueError:
        return None


def list_child_partitions(connection: Connection, parent_table: str) -> list[str]:
    rows = connection.execute(
        text(
            """
            SELECT child.relname AS partition_name
            FROM pg_inherits
            JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
            JOIN pg_class child ON pg_inherits.inhrelid = child.oid
            WHERE parent.relname = :parent
            ORDER BY child.relname
            """
        ),
        {"parent": parent_table},
    ).all()
    return [row[0] for row in rows]


def expired_partitions(
    connection: Connection,
    table: str,
    *,
    retention_months: int | None = None,
    today: date | None = None,
) -> list[str]:
    months = retention_months if retention_months is not None else retention_months_for_table(table)
    if months <= 0:
        return []
    first_kept = first_month_to_retain(months, today=today)
    expired: list[str] = []
    for name in list_child_partitions(connection, table):
        month = parse_partition_month(name, table)
        if month and month < first_kept:
            expired.append(name)
    return expired


def _delete_routing_destinations_for_partition(connection: Connection, partition_name: str) -> int:
    result = connection.execute(
        text(
            f"""
            DELETE FROM routing_destinations d
            USING {partition_name} t
            WHERE d.transaction_id = t.id
            """
        )
    )
    return int(result.rowcount or 0)


def drop_partition(connection: Connection, table: str, partition_name: str) -> None:
    if table == "routing_transactions":
        deleted = _delete_routing_destinations_for_partition(connection, partition_name)
        if deleted:
            logger.info(
                "routing_destinations_deleted_for_partition",
                partition=partition_name,
                deleted=deleted,
            )
    connection.execute(text(f"DROP TABLE IF EXISTS {partition_name}"))
    inc_counter("synapse_partition_retention_drops_total", {"table": table})


def apply_partition_retention(
    connection: Connection,
    *,
    dry_run: bool = False,
    today: date | None = None,
) -> dict[str, list[str]]:
    """Drop partitions older than each table's retention window."""
    results: dict[str, list[str]] = {}

    for table in PARTITIONED_TABLES:
        to_drop = expired_partitions(connection, table, today=today)
        results[table] = to_drop
        if not to_drop:
            continue

        if dry_run:
            logger.info(
                "partition_retention_dry_run",
                table=table,
                partitions=to_drop,
                retention_months=retention_months_for_table(table),
            )
            continue

        for partition_name in to_drop:
            drop_partition(connection, table, partition_name)
            logger.info("partition_dropped", table=table, partition=partition_name)

    return results


def retention_summary(
    connection: Connection,
    *,
    today: date | None = None,
) -> dict[str, dict[str, object]]:
    """Report retention window and expired partitions per table."""
    summary: dict[str, dict[str, object]] = {}
    for table in PARTITIONED_TABLES:
        months = retention_months_for_table(table)
        first_kept = first_month_to_retain(months, today=today)
        expired = expired_partitions(connection, table, today=today)
        summary[table] = {
            "retention_months": months,
            "first_kept_month": first_kept.isoformat() if first_kept != date.max else None,
            "expired_partitions": expired,
        }
    return summary
