"""Pre-aggregated counters for fast dashboard reads (Phase 1)."""

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MetricTotal(Base):
    """All-time counters keyed by metric name."""

    __tablename__ = "metric_totals"

    metric_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DailyMetricRollup(Base):
    """Per-day counters for charts and today KPIs."""

    __tablename__ = "daily_metric_rollups"

    bucket_date: Mapped[date] = mapped_column(Date, primary_key=True)
    metric_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
