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
