"""Phase 3.1: monthly partitions for routing_transactions and migration_study_records.

Revision ID: 008
Revises: 007
Create Date: 2026-06-15
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

from app.services.partition_maintenance import add_months, ensure_table_partitions

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _partition_window(connection) -> tuple[date, date]:
    today = datetime.now(timezone.utc).date()
    start = add_months(date(today.year, today.month, 1), -1)
    end = add_months(date(today.year, today.month, 1), 3)
    return start, end


def _min_month(connection, table: str, column: str, default_from: date) -> date:
    row = connection.execute(
        text(f"SELECT MIN({column}) AS min_ts FROM {table}")
    ).mappings().first()
    if not row or not row["min_ts"]:
        return default_from
    min_ts = row["min_ts"]
    if hasattr(min_ts, "date"):
        min_ts = min_ts.date()
    return date(min_ts.year, min_ts.month, 1)


def _rebuild_routing_transactions(connection) -> None:
    connection.execute(
        text(
            "ALTER TABLE routing_destinations "
            "DROP CONSTRAINT IF EXISTS routing_destinations_transaction_id_fkey"
        )
    )
    connection.execute(text("ALTER TABLE routing_transactions RENAME TO routing_transactions_legacy"))
    connection.execute(
        text(
            """
            CREATE TABLE routing_transactions (
                id UUID NOT NULL,
                source_node_id UUID REFERENCES nodes(id),
                study_uid VARCHAR(64) NOT NULL,
                patient_id VARCHAR(64),
                modality VARCHAR(16),
                accession_number VARCHAR(64),
                instances_count INTEGER,
                routing_rule_id UUID REFERENCES routing_rules(id),
                overall_status VARCHAR(20) NOT NULL DEFAULT 'pending',
                trace_id VARCHAR(32),
                received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                completed_at TIMESTAMPTZ,
                PRIMARY KEY (received_at, id)
            ) PARTITION BY RANGE (received_at)
            """
        )
    )
    from_month, through_month = _partition_window(connection)
    from_month = _min_month(connection, "routing_transactions_legacy", "received_at", from_month)
    ensure_table_partitions(
        connection,
        "routing_transactions",
        from_month=from_month,
        through_month=through_month,
    )
    connection.execute(
        text(
            """
            INSERT INTO routing_transactions (
                id, source_node_id, study_uid, patient_id, modality, accession_number,
                instances_count, routing_rule_id, overall_status, trace_id, received_at, completed_at
            )
            SELECT
                id, source_node_id, study_uid, patient_id, modality, accession_number,
                instances_count, routing_rule_id, overall_status, trace_id, received_at, completed_at
            FROM routing_transactions_legacy
            """
        )
    )
    connection.execute(text("DROP TABLE routing_transactions_legacy"))
    connection.execute(text("CREATE INDEX ix_routing_transactions_study_uid ON routing_transactions (study_uid)"))
    connection.execute(text("CREATE INDEX ix_routing_transactions_received_at ON routing_transactions (received_at)"))
    connection.execute(
        text(
            "CREATE INDEX ix_routing_transactions_status_received_at "
            "ON routing_transactions (overall_status, received_at)"
        )
    )
    connection.execute(
        text(
            "CREATE INDEX ix_routing_transactions_modality_received_at "
            "ON routing_transactions (modality, received_at)"
        )
    )
    connection.execute(text("CREATE INDEX ix_routing_transactions_trace_id ON routing_transactions (trace_id)"))
    connection.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_routing_destinations_transaction_id "
            "ON routing_destinations (transaction_id)"
        )
    )


def _rebuild_migration_study_records(connection) -> None:
    connection.execute(text("ALTER TABLE migration_study_records RENAME TO migration_study_records_legacy"))
    connection.execute(
        text(
            """
            CREATE TABLE migration_study_records (
                id UUID NOT NULL,
                job_id UUID NOT NULL REFERENCES migration_jobs(id),
                study_uid VARCHAR(64) NOT NULL,
                patient_id VARCHAR(64),
                modality VARCHAR(16),
                study_date DATE,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                retry_count INTEGER NOT NULL DEFAULT 0,
                failure_reason TEXT,
                trace_id VARCHAR(32),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                completed_at TIMESTAMPTZ,
                PRIMARY KEY (created_at, id)
            ) PARTITION BY RANGE (created_at)
            """
        )
    )
    from_month, through_month = _partition_window(connection)
    from_month = _min_month(connection, "migration_study_records_legacy", "created_at", from_month)
    ensure_table_partitions(
        connection,
        "migration_study_records",
        from_month=from_month,
        through_month=through_month,
    )
    connection.execute(
        text(
            """
            INSERT INTO migration_study_records (
                id, job_id, study_uid, patient_id, modality, study_date, status,
                retry_count, failure_reason, trace_id, created_at, completed_at
            )
            SELECT
                id, job_id, study_uid, patient_id, modality, study_date, status,
                retry_count, failure_reason, trace_id, created_at, completed_at
            FROM migration_study_records_legacy
            """
        )
    )
    connection.execute(text("DROP TABLE migration_study_records_legacy"))
    connection.execute(text("CREATE INDEX ix_migration_study_records_study_uid ON migration_study_records (study_uid)"))
    connection.execute(
        text(
            "CREATE INDEX ix_migration_study_records_status_completed_at "
            "ON migration_study_records (status, completed_at)"
        )
    )
    connection.execute(
        text("CREATE INDEX ix_migration_study_records_job_status ON migration_study_records (job_id, status)")
    )
    connection.execute(text("CREATE INDEX ix_migration_study_records_trace_id ON migration_study_records (trace_id)"))


def upgrade() -> None:
    connection = op.get_bind()
    _rebuild_routing_transactions(connection)
    _rebuild_migration_study_records(connection)


def _downgrade_routing_transactions(connection) -> None:
    connection.execute(text("ALTER TABLE routing_transactions RENAME TO routing_transactions_partitioned"))
    connection.execute(
        text(
            """
            CREATE TABLE routing_transactions (
                id UUID PRIMARY KEY,
                source_node_id UUID REFERENCES nodes(id),
                study_uid VARCHAR(64) NOT NULL,
                patient_id VARCHAR(64),
                modality VARCHAR(16),
                accession_number VARCHAR(64),
                instances_count INTEGER,
                routing_rule_id UUID REFERENCES routing_rules(id),
                overall_status VARCHAR(20) NOT NULL DEFAULT 'pending',
                trace_id VARCHAR(32),
                received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                completed_at TIMESTAMPTZ
            )
            """
        )
    )
    connection.execute(
        text(
            """
            INSERT INTO routing_transactions (
                id, source_node_id, study_uid, patient_id, modality, accession_number,
                instances_count, routing_rule_id, overall_status, trace_id, received_at, completed_at
            )
            SELECT
                id, source_node_id, study_uid, patient_id, modality, accession_number,
                instances_count, routing_rule_id, overall_status, trace_id, received_at, completed_at
            FROM routing_transactions_partitioned
            """
        )
    )
    connection.execute(text("DROP TABLE routing_transactions_partitioned CASCADE"))
    connection.execute(text("CREATE INDEX ix_routing_transactions_study_uid ON routing_transactions (study_uid)"))
    connection.execute(text("CREATE INDEX ix_routing_transactions_received_at ON routing_transactions (received_at)"))
    connection.execute(
        text(
            "CREATE INDEX ix_routing_transactions_status_received_at "
            "ON routing_transactions (overall_status, received_at)"
        )
    )
    connection.execute(
        text(
            "CREATE INDEX ix_routing_transactions_modality_received_at "
            "ON routing_transactions (modality, received_at)"
        )
    )
    connection.execute(text("CREATE INDEX ix_routing_transactions_trace_id ON routing_transactions (trace_id)"))
    connection.execute(
        text(
            "ALTER TABLE routing_destinations "
            "ADD CONSTRAINT routing_destinations_transaction_id_fkey "
            "FOREIGN KEY (transaction_id) REFERENCES routing_transactions (id)"
        )
    )


def _downgrade_migration_study_records(connection) -> None:
    connection.execute(text("ALTER TABLE migration_study_records RENAME TO migration_study_records_partitioned"))
    connection.execute(
        text(
            """
            CREATE TABLE migration_study_records (
                id UUID PRIMARY KEY,
                job_id UUID NOT NULL REFERENCES migration_jobs(id),
                study_uid VARCHAR(64) NOT NULL,
                patient_id VARCHAR(64),
                modality VARCHAR(16),
                study_date DATE,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                retry_count INTEGER NOT NULL DEFAULT 0,
                failure_reason TEXT,
                trace_id VARCHAR(32),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                completed_at TIMESTAMPTZ
            )
            """
        )
    )
    connection.execute(
        text(
            """
            INSERT INTO migration_study_records (
                id, job_id, study_uid, patient_id, modality, study_date, status,
                retry_count, failure_reason, trace_id, created_at, completed_at
            )
            SELECT
                id, job_id, study_uid, patient_id, modality, study_date, status,
                retry_count, failure_reason, trace_id, created_at, completed_at
            FROM migration_study_records_partitioned
            """
        )
    )
    connection.execute(text("DROP TABLE migration_study_records_partitioned CASCADE"))
    connection.execute(text("CREATE INDEX ix_migration_study_records_study_uid ON migration_study_records (study_uid)"))
    connection.execute(
        text(
            "CREATE INDEX ix_migration_study_records_status_completed_at "
            "ON migration_study_records (status, completed_at)"
        )
    )
    connection.execute(
        text("CREATE INDEX ix_migration_study_records_job_status ON migration_study_records (job_id, status)")
    )
    connection.execute(text("CREATE INDEX ix_migration_study_records_trace_id ON migration_study_records (trace_id)"))


def downgrade() -> None:
    connection = op.get_bind()
    _downgrade_migration_study_records(connection)
    _downgrade_routing_transactions(connection)
