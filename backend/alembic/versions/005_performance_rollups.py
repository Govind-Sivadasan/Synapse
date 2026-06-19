"""Phase 1 performance: indexes and metric rollup tables.

Revision ID: 005
Revises: 004
Create Date: 2026-06-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "metric_totals",
        sa.Column("metric_key", sa.String(length=64), nullable=False),
        sa.Column("count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("metric_key"),
    )
    op.create_table(
        "daily_metric_rollups",
        sa.Column("bucket_date", sa.Date(), nullable=False),
        sa.Column("metric_key", sa.String(length=64), nullable=False),
        sa.Column("count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("bucket_date", "metric_key"),
    )

    op.create_index(
        "ix_routing_transactions_received_at",
        "routing_transactions",
        ["received_at"],
    )
    op.create_index(
        "ix_routing_transactions_status_received_at",
        "routing_transactions",
        ["overall_status", "received_at"],
    )
    op.create_index(
        "ix_routing_transactions_modality_received_at",
        "routing_transactions",
        ["modality", "received_at"],
    )
    op.create_index(
        "ix_migration_study_records_status_completed_at",
        "migration_study_records",
        ["status", "completed_at"],
    )
    op.create_index(
        "ix_migration_study_records_job_status",
        "migration_study_records",
        ["job_id", "status"],
    )
    op.create_index("ix_migration_jobs_status", "migration_jobs", ["status"])

    # Backfill rollups from existing data
    op.execute(
        """
        INSERT INTO daily_metric_rollups (bucket_date, metric_key, count)
        SELECT (received_at AT TIME ZONE 'UTC')::date, 'routing.total', COUNT(*)
        FROM routing_transactions
        GROUP BY 1
        ON CONFLICT (bucket_date, metric_key) DO UPDATE
        SET count = EXCLUDED.count, updated_at = now()
        """
    )
    op.execute(
        """
        INSERT INTO daily_metric_rollups (bucket_date, metric_key, count)
        SELECT (received_at AT TIME ZONE 'UTC')::date, 'routing.' || overall_status, COUNT(*)
        FROM routing_transactions
        GROUP BY 1, overall_status
        ON CONFLICT (bucket_date, metric_key) DO UPDATE
        SET count = EXCLUDED.count, updated_at = now()
        """
    )
    op.execute(
        """
        INSERT INTO metric_totals (metric_key, count)
        SELECT 'routing.total', COUNT(*) FROM routing_transactions
        ON CONFLICT (metric_key) DO UPDATE SET count = EXCLUDED.count, updated_at = now()
        """
    )
    op.execute(
        """
        INSERT INTO metric_totals (metric_key, count)
        SELECT 'routing.' || overall_status, COUNT(*)
        FROM routing_transactions
        GROUP BY overall_status
        ON CONFLICT (metric_key) DO UPDATE SET count = EXCLUDED.count, updated_at = now()
        """
    )
    op.execute(
        """
        INSERT INTO daily_metric_rollups (bucket_date, metric_key, count)
        SELECT (completed_at AT TIME ZONE 'UTC')::date, 'migration.study.' || status, COUNT(*)
        FROM migration_study_records
        WHERE completed_at IS NOT NULL AND status IN ('success', 'failed')
        GROUP BY 1, status
        ON CONFLICT (bucket_date, metric_key) DO UPDATE
        SET count = EXCLUDED.count, updated_at = now()
        """
    )
    op.execute(
        """
        INSERT INTO metric_totals (metric_key, count)
        SELECT 'migration.study.' || status, COUNT(*)
        FROM migration_study_records
        WHERE status IN ('success', 'failed')
        GROUP BY status
        ON CONFLICT (metric_key) DO UPDATE SET count = EXCLUDED.count, updated_at = now()
        """
    )


def downgrade() -> None:
    op.drop_index("ix_migration_jobs_status", table_name="migration_jobs")
    op.drop_index("ix_migration_study_records_job_status", table_name="migration_study_records")
    op.drop_index("ix_migration_study_records_status_completed_at", table_name="migration_study_records")
    op.drop_index("ix_routing_transactions_modality_received_at", table_name="routing_transactions")
    op.drop_index("ix_routing_transactions_status_received_at", table_name="routing_transactions")
    op.drop_index("ix_routing_transactions_received_at", table_name="routing_transactions")
    op.drop_table("daily_metric_rollups")
    op.drop_table("metric_totals")
