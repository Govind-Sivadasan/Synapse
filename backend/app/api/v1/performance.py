"""Performance baseline API."""

from datetime import datetime, timezone

from fastapi import APIRouter

from app.observability.metrics import get_baseline_snapshot
from app.schemas.performance import PerformanceBaselineResponse

router = APIRouter(tags=["Performance"])


@router.get("/performance/baseline", response_model=PerformanceBaselineResponse)
async def performance_baseline() -> PerformanceBaselineResponse:
    """Human-readable metrics snapshot for load tests and ops dashboards."""
    snapshot = get_baseline_snapshot()
    return PerformanceBaselineResponse(
        timestamp=datetime.now(timezone.utc),
        queues=snapshot.get("queues", {}),
        counters=snapshot.get("counters", {}),
        histograms=snapshot.get("histograms", {}),
        queues_error=snapshot.get("queues_error"),
    )
