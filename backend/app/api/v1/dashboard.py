"""Dashboard metrics API."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.keycloak import CurrentUser, require_roles
from app.database import get_db
from app.models.migration import MigrationJob
from app.models.routing import RoutingTransaction

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/metrics")
async def get_dashboard_metrics(
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("viewer", "service_user", "operator", "admin")),
) -> dict:
    total_routed = await db.scalar(select(func.count()).select_from(RoutingTransaction))
    successful = await db.scalar(
        select(func.count()).select_from(RoutingTransaction).where(RoutingTransaction.overall_status == "success")
    )
    failed = await db.scalar(
        select(func.count()).select_from(RoutingTransaction).where(RoutingTransaction.overall_status == "failed")
    )
    active_jobs = await db.scalar(
        select(func.count()).select_from(MigrationJob).where(MigrationJob.status == "in_progress")
    )
    return {
        "total_studies_processed": total_routed or 0,
        "successful_studies": successful or 0,
        "failed_studies": failed or 0,
        "active_migration_jobs": active_jobs or 0,
        "success_rate": round((successful or 0) / max(total_routed or 1, 1) * 100, 2),
    }
