"""Phase 3: trace columns and monthly partitions for audit_logs and dimse_events.

Revision ID: 006
Revises: 005
Create Date: 2026-06-19
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

from app.services.partition_maintenance import add_months, ensure_table_partitions

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _partition_window(connection) -> tuple[date, date]:
    today = datetime.now(timezone.utc).date()
    start = add_months(date(today.year, today.month, 1), -1)
    end = add_months(date(today.year, today.month, 1), 3)
    return start, end


def _rebuild_audit_logs(connection) -> None:
    connection.execute(text("ALTER TABLE audit_logs RENAME TO audit_logs_legacy"))
    connection.execute(
        text(
            """
            CREATE TABLE audit_logs (
                id UUID NOT NULL,
                event_type VARCHAR(100) NOT NULL,
                user_id VARCHAR(200),
                user_role VARCHAR(50),
                entity_type VARCHAR(50),
                entity_id UUID,
                details JSONB,
                ip_address VARCHAR(45),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (created_at, id)
            ) PARTITION BY RANGE (created_at)
            """
        )
    )
    from_month, through_month = _partition_window(connection)
    row = connection.execute(text("SELECT MIN(created_at) AS min_created FROM audit_logs_legacy")).mappings().first()
    if row and row["min_created"]:
        min_created = row["min_created"]
        if hasattr(min_created, "date"):
            min_created = min_created.date()
        from_month = date(min_created.year, min_created.month, 1)
    ensure_table_partitions(
        connection,
        "audit_logs",
        from_month=from_month,
        through_month=through_month,
    )
    connection.execute(text("INSERT INTO audit_logs SELECT * FROM audit_logs_legacy"))
    connection.execute(text("DROP TABLE audit_logs_legacy"))
    connection.execute(text("CREATE INDEX ix_audit_logs_event_type ON audit_logs (event_type)"))
    connection.execute(text("CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at)"))


def _rebuild_dimse_events(connection) -> None:
    connection.execute(text("ALTER TABLE dimse_events RENAME TO dimse_events_legacy"))
    connection.execute(
        text(
            """
            CREATE TABLE dimse_events (
                id UUID NOT NULL,
                event_type VARCHAR(40) NOT NULL,
                calling_ae VARCHAR(64),
                study_uid VARCHAR(64),
                reason TEXT,
                instances INTEGER,
                details JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (created_at, id)
            ) PARTITION BY RANGE (created_at)
            """
        )
    )
    from_month, through_month = _partition_window(connection)
    row = connection.execute(text("SELECT MIN(created_at) AS min_created FROM dimse_events_legacy")).mappings().first()
    if row and row["min_created"]:
        min_created = row["min_created"]
        if hasattr(min_created, "date"):
            min_created = min_created.date()
        from_month = date(min_created.year, min_created.month, 1)
    ensure_table_partitions(
        connection,
        "dimse_events",
        from_month=from_month,
        through_month=through_month,
    )
    connection.execute(text("INSERT INTO dimse_events SELECT * FROM dimse_events_legacy"))
    connection.execute(text("DROP TABLE dimse_events_legacy"))
    connection.execute(text("CREATE INDEX ix_dimse_events_event_type ON dimse_events (event_type)"))
    connection.execute(text("CREATE INDEX ix_dimse_events_created_at ON dimse_events (created_at)"))


def upgrade() -> None:
    op.add_column("migration_study_records", sa.Column("trace_id", sa.String(length=32), nullable=True))
    op.add_column("routing_transactions", sa.Column("trace_id", sa.String(length=32), nullable=True))
    op.create_index("ix_migration_study_records_trace_id", "migration_study_records", ["trace_id"])
    op.create_index("ix_routing_transactions_trace_id", "routing_transactions", ["trace_id"])

    connection = op.get_bind()
    _rebuild_audit_logs(connection)
    _rebuild_dimse_events(connection)


def downgrade() -> None:
    connection = op.get_bind()

    connection.execute(text("ALTER TABLE audit_logs RENAME TO audit_logs_partitioned"))
    connection.execute(
        text(
            """
            CREATE TABLE audit_logs (
                id UUID PRIMARY KEY,
                event_type VARCHAR(100) NOT NULL,
                user_id VARCHAR(200),
                user_role VARCHAR(50),
                entity_type VARCHAR(50),
                entity_id UUID,
                details JSONB,
                ip_address VARCHAR(45),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )
    connection.execute(text("INSERT INTO audit_logs SELECT * FROM audit_logs_partitioned"))
    connection.execute(text("DROP TABLE audit_logs_partitioned CASCADE"))
    connection.execute(text("CREATE INDEX ix_audit_logs_event_type ON audit_logs (event_type)"))
    connection.execute(text("CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at)"))

    connection.execute(text("ALTER TABLE dimse_events RENAME TO dimse_events_partitioned"))
    connection.execute(
        text(
            """
            CREATE TABLE dimse_events (
                id UUID PRIMARY KEY,
                event_type VARCHAR(40) NOT NULL,
                calling_ae VARCHAR(64),
                study_uid VARCHAR(64),
                reason TEXT,
                instances INTEGER,
                details JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )
    connection.execute(text("INSERT INTO dimse_events SELECT * FROM dimse_events_partitioned"))
    connection.execute(text("DROP TABLE dimse_events_partitioned CASCADE"))
    connection.execute(text("CREATE INDEX ix_dimse_events_event_type ON dimse_events (event_type)"))
    connection.execute(text("CREATE INDEX ix_dimse_events_created_at ON dimse_events (created_at)"))

    op.drop_index("ix_routing_transactions_trace_id", table_name="routing_transactions")
    op.drop_index("ix_migration_study_records_trace_id", table_name="migration_study_records")
    op.drop_column("routing_transactions", "trace_id")
    op.drop_column("migration_study_records", "trace_id")
