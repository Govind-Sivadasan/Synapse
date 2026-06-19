"""Performance baseline API."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.keycloak import CurrentUser, require_roles
from app.config import settings
from app.database import engine
from app.observability.metrics import (
    get_baseline_snapshot,
    reset_cumulative_metrics,
    save_baseline_marker,
)
from app.schemas.performance import (
    PartitionEnsureResponse,
    PartitionRetentionResponse,
    PerformanceBaselineMarkerResponse,
    PerformanceBaselineResetResponse,
    PerformanceBaselineResponse,
)

router = APIRouter(tags=["Performance"])


def _to_response(snapshot: dict) -> PerformanceBaselineResponse:
    return PerformanceBaselineResponse(
        timestamp=datetime.now(timezone.utc),
        queues=snapshot.get("queues", {}),
        counters=snapshot.get("counters", {}),
        histograms=snapshot.get("histograms", {}),
        queues_error=snapshot.get("queues_error"),
        since_marker_id=snapshot.get("since_marker_id"),
        since_marker_created_at=snapshot.get("since_marker_created_at"),
        since_marker_label=snapshot.get("since_marker_label"),
        marker_error=snapshot.get("marker_error"),
    )


@router.get("/performance/baseline", response_model=PerformanceBaselineResponse)
async def performance_baseline(
    since: str | None = Query(
        default=None,
        description="Marker id from POST /performance/baseline/mark — returns delta since that checkpoint",
    ),
) -> PerformanceBaselineResponse:
    """Human-readable metrics snapshot for load tests and ops dashboards."""
    snapshot = get_baseline_snapshot(since_marker=since)
    if since and snapshot.get("marker_error"):
        raise HTTPException(status_code=404, detail=snapshot["marker_error"])
    return _to_response(snapshot)


@router.post("/performance/baseline/mark", response_model=PerformanceBaselineMarkerResponse)
async def performance_baseline_mark(
    label: str | None = Query(default=None, description="Optional label for this checkpoint"),
    _: CurrentUser = Depends(require_roles("operator", "admin")),
) -> PerformanceBaselineMarkerResponse:
    """Save a cumulative-metrics checkpoint for delta baselines."""
    marker = save_baseline_marker(label=label)
    return PerformanceBaselineMarkerResponse(
        marker_id=marker["marker_id"],
        label=marker.get("label"),
        created_at=marker["created_at"],
        counters=marker.get("counters", {}),
        histograms=marker.get("histograms", {}),
    )


@router.post("/performance/baseline/reset", response_model=PerformanceBaselineResetResponse)
async def performance_baseline_reset(
    _: CurrentUser = Depends(require_roles("operator", "admin")),
) -> PerformanceBaselineResetResponse:
    """Clear cumulative Redis performance counters and histograms."""
    return PerformanceBaselineResetResponse(keys_deleted=reset_cumulative_metrics())


@router.post("/performance/partitions/ensure", response_model=PartitionEnsureResponse)
async def performance_partitions_ensure(
    _: CurrentUser = Depends(require_roles("operator", "admin")),
) -> PartitionEnsureResponse:
    """Create upcoming monthly PostgreSQL partitions for high-volume tables."""
    from app.services.partition_maintenance import ensure_all_partitions

    async with engine.begin() as connection:
        results = await connection.run_sync(
            lambda sync_conn: ensure_all_partitions(
                sync_conn,
                months_ahead=settings.partition_months_ahead,
            )
        )
    return PartitionEnsureResponse(tables=results)


@router.post("/performance/partitions/retention", response_model=PartitionRetentionResponse)
async def performance_partitions_retention(
    dry_run: bool = Query(
        True,
        description="When true, report expired partitions without dropping them",
    ),
    _: CurrentUser = Depends(require_roles("admin")),
) -> PartitionRetentionResponse:
    """Drop monthly partitions older than each table's retention window (Phase 3.2)."""
    from app.services.partition_retention import apply_partition_retention, retention_summary

    if not settings.partition_retention_enabled:
        raise HTTPException(status_code=400, detail="Partition retention is disabled")

    async with engine.begin() as connection:
        summary = await connection.run_sync(retention_summary)
        results = await connection.run_sync(
            lambda sync_conn: apply_partition_retention(sync_conn, dry_run=dry_run)
        )
    return PartitionRetentionResponse(dry_run=dry_run, tables=results, summary=summary)
