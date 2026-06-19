"""Dashboard metrics and analytics API."""

from fastapi import APIRouter, Depends, Query

from app.auth.keycloak import CurrentUser, require_roles
from app.database import get_db
from app.schemas.dashboard import (
    ActivityFeedResponse,
    ChartDataPoint,
    DashboardMetricsResponse,
    VolumeChartResponse,
)
from app.services.dashboard_metrics import (
    get_activity_feed,
    get_dashboard_metrics,
    get_modality_chart,
    get_status_chart,
    get_volume_chart,
)
from app.services.metrics_cache import get_dashboard_metrics_cache, set_dashboard_metrics_cache
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/metrics", response_model=DashboardMetricsResponse)
async def get_metrics(
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("viewer", "service_user", "operator", "admin")),
) -> DashboardMetricsResponse:
    cached = get_dashboard_metrics_cache()
    if cached is not None:
        return DashboardMetricsResponse.model_validate(cached)
    result = await get_dashboard_metrics(db)
    set_dashboard_metrics_cache(result.model_dump(mode="json"))
    return result


@router.get("/charts/volume", response_model=VolumeChartResponse)
async def get_volume(
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("viewer", "service_user", "operator", "admin")),
) -> VolumeChartResponse:
    return await get_volume_chart(db, days=days)


@router.get("/charts/modality", response_model=list[ChartDataPoint])
async def get_modality_breakdown(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("viewer", "service_user", "operator", "admin")),
) -> list[ChartDataPoint]:
    return await get_modality_chart(db, days=days)


@router.get("/charts/status", response_model=list[ChartDataPoint])
async def get_status_breakdown(
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("viewer", "service_user", "operator", "admin")),
) -> list[ChartDataPoint]:
    return await get_status_chart(db)


@router.get("/activity", response_model=ActivityFeedResponse)
async def get_activity(
    limit: int = Query(15, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("viewer", "service_user", "operator", "admin")),
) -> ActivityFeedResponse:
    mask_phi = "viewer" in user.roles and "admin" not in user.roles and "operator" not in user.roles
    return await get_activity_feed(db, limit=limit, mask_phi=mask_phi)
