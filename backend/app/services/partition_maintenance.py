"""PostgreSQL monthly partition maintenance (Phase 3)."""

from __future__ import annotations

from datetime import date, datetime, timezone

import structlog
from sqlalchemy import text
from sqlalchemy.engine import Connection

logger = structlog.get_logger()

# table -> partition key column
PARTITIONED_TABLES: dict[str, str] = {
    "audit_logs": "created_at",
    "dimse_events": "created_at",
    "routing_transactions": "received_at",
    "migration_study_records": "created_at",
}


def add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def iter_month_starts(start: date, end: date):
    current = date(start.year, start.month, 1)
    end_start = date(end.year, end.month, 1)
    while current <= end_start:
        yield current
        current = add_months(current, 1)


def partition_table_name(table: str, month_start: date) -> str:
    return f"{table}_{month_start.year}_{month_start.month:02d}"


def ensure_table_partitions(
    connection: Connection,
    table: str,
    *,
    from_month: date,
    through_month: date,
) -> list[str]:
    """Create monthly RANGE partitions if missing."""
    created: list[str] = []
    for month_start in iter_month_starts(from_month, through_month):
        part_name = partition_table_name(table, month_start)
        next_month = add_months(month_start, 1)
        connection.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {part_name}
                PARTITION OF {table}
                FOR VALUES FROM ('{month_start.isoformat()}') TO ('{next_month.isoformat()}')
                """
            )
        )
        created.append(part_name)
    return created


def ensure_all_partitions(connection: Connection, *, months_ahead: int = 3) -> dict[str, list[str]]:
    """Ensure partitions from earliest row month through N months ahead."""
    today = datetime.now(timezone.utc).date()
    through = add_months(date(today.year, today.month, 1), months_ahead)
    results: dict[str, list[str]] = {}

    for table, partition_column in PARTITIONED_TABLES.items():
        row = connection.execute(
            text(f"SELECT MIN({partition_column}) AS min_created FROM {table}")
        ).mappings().first()
        min_created = row["min_created"] if row else None
        if min_created is None:
            from_month = date(today.year, today.month, 1)
        else:
            if hasattr(min_created, "date"):
                min_created = min_created.date()
            from_month = date(min_created.year, min_created.month, 1)

        created = ensure_table_partitions(
            connection,
            table,
            from_month=from_month,
            through_month=through,
        )
        results[table] = created
        logger.info(
            "partitions_ensured",
            table=table,
            from_month=str(from_month),
            through_month=str(through),
            partitions=len(created),
        )

    return results
