import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DimseListenerMetrics(Base):
    """Singleton row (id=1) holding cumulative DIMSE listener counters."""

    __tablename__ = "dimse_listener_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    associations_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    associations_accepted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    associations_rejected: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    c_echo_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    instances_received: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    studies_assembled: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_association_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_calling_ae: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_study_uid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DimseEvent(Base):
    """Recent DIMSE activity feed persisted for Routing Monitor."""

    __tablename__ = "dimse_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    calling_ae: Mapped[str | None] = mapped_column(String(64), nullable=True)
    study_uid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    instances: Mapped[int | None] = mapped_column(Integer, nullable=True)
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
