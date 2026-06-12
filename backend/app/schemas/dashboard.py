from datetime import date, datetime

from pydantic import BaseModel


class RoutingMetrics(BaseModel):
    total: int
    success: int
    failed: int
    partial: int
    no_match: int
    success_rate: float


class MigrationMetrics(BaseModel):
    total_jobs: int
    active_jobs: int
    completed_jobs: int
    studies_migrated: int
    studies_failed: int


class DimseMetrics(BaseModel):
    listening: bool
    studies_assembled: int
    instances_received: int
    associations_accepted: int
    associations_rejected: int


class DashboardMetricsResponse(BaseModel):
    routing: RoutingMetrics
    migration: MigrationMetrics
    dimse: DimseMetrics


class ChartDataPoint(BaseModel):
    label: str
    value: int


class VolumeChartResponse(BaseModel):
    days: int
    routing: list[ChartDataPoint]
    migration: list[ChartDataPoint]


class ActivityItem(BaseModel):
    id: str
    type: str
    title: str
    subtitle: str | None = None
    status: str | None = None
    timestamp: datetime


class ActivityFeedResponse(BaseModel):
    items: list[ActivityItem]


class ReportSummaryResponse(BaseModel):
    period_days: int
    routing_studies: int
    routing_success_rate: float
    migration_studies_completed: int
    migration_studies_failed: int
    audit_events: int
    top_modalities: list[ChartDataPoint]
    routing_by_status: list[ChartDataPoint]
