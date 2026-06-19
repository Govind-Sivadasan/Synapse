"""Phase 2.1: streaming migration discovery coordinator fields.

Revision ID: 007
Revises: 006
Create Date: 2026-06-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "migration_jobs",
        sa.Column("discovery_offset", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "migration_jobs",
        sa.Column("discovery_complete", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "migration_jobs",
        sa.Column("discovered_studies", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute(
        "UPDATE migration_jobs SET discovery_complete = true "
        "WHERE status NOT IN ('not_started')"
    )


def downgrade() -> None:
    op.drop_column("migration_jobs", "discovered_studies")
    op.drop_column("migration_jobs", "discovery_complete")
    op.drop_column("migration_jobs", "discovery_offset")
