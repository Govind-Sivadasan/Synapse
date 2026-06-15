"""Persist DIMSE listener metrics and events to database.

Revision ID: 003
Revises: 002
Create Date: 2026-06-13
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dimse_listener_metrics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("associations_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("associations_accepted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("associations_rejected", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("c_echo_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("instances_received", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("studies_assembled", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_association_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_calling_ae", sa.String(64), nullable=True),
        sa.Column("last_study_uid", sa.String(64), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.execute("INSERT INTO dimse_listener_metrics (id) VALUES (1) ON CONFLICT (id) DO NOTHING")

    op.create_table(
        "dimse_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("calling_ae", sa.String(64), nullable=True),
        sa.Column("study_uid", sa.String(64), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("instances", sa.Integer(), nullable=True),
        sa.Column("details", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_dimse_events_event_type", "dimse_events", ["event_type"])
    op.create_index("ix_dimse_events_created_at", "dimse_events", ["created_at"])


def downgrade() -> None:
    op.drop_table("dimse_events")
    op.drop_table("dimse_listener_metrics")
