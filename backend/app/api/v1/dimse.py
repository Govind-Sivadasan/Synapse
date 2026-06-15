"""DIMSE listener status and monitoring API."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.keycloak import CurrentUser, require_roles
from app.database import get_db
from app.dimse.stats import get_dimse_runtime
from app.services.allowed_aets import get_allowed_calling_aets
from app.services.dimse_event_store import get_dimse_statistics
from app.services.runtime_config import get_runtime_config

router = APIRouter(prefix="/dimse", tags=["DIMSE"])


@router.get("/status")
async def dimse_status(
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("operator", "admin", "service_user")),
) -> dict:
    runtime_state = get_dimse_runtime()
    runtime = get_runtime_config()
    stats = await get_dimse_statistics(db)

    return {
        "listening": runtime_state.listening,
        "ae_title": runtime["dimse_ae_title"],
        "port": runtime["dimse_port"],
        "promiscuous_mode": runtime["dimse_promiscuous_mode"],
        "allowed_calling_aets": sorted(get_allowed_calling_aets()),
        "statistics": {
            "associations_total": stats["associations_total"],
            "associations_accepted": stats["associations_accepted"],
            "associations_rejected": stats["associations_rejected"],
            "c_echo_total": stats["c_echo_total"],
            "instances_received": stats["instances_received"],
            "studies_assembled": stats["studies_assembled"],
            "last_association_at": (
                stats["last_association_at"].isoformat() if stats["last_association_at"] else None
            ),
            "last_calling_ae": stats["last_calling_ae"],
            "last_study_uid": stats["last_study_uid"],
        },
        "recent_events": stats["recent_events"],
    }
