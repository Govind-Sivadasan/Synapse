"""Performance baseline API schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class HistogramSnapshot(BaseModel):
    count: int
    sum_seconds: float
    avg_seconds: float


class PerformanceBaselineResponse(BaseModel):
    timestamp: datetime
    queues: dict[str, int] = Field(default_factory=dict)
    counters: dict[str, int] = Field(default_factory=dict)
    histograms: dict[str, HistogramSnapshot] = Field(default_factory=dict)
    queues_error: str | None = None
    since_marker_id: str | None = None
    since_marker_created_at: str | None = None
    since_marker_label: str | None = None
    marker_error: str | None = None


class PerformanceBaselineMarkerResponse(BaseModel):
    marker_id: str
    label: str | None = None
    created_at: str
    counters: dict[str, int] = Field(default_factory=dict)
    histograms: dict[str, HistogramSnapshot] = Field(default_factory=dict)


class PerformanceBaselineResetResponse(BaseModel):
    keys_deleted: int
