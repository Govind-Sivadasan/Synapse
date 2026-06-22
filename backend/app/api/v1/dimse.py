"""DIMSE listener status and monitoring API."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.keycloak import CurrentUser, require_roles
from app.database import get_db
from app.dimse.stats import get_dimse_runtime
from app.dimse.listener import reload_dimse_listener
from app.services.allowed_aets import get_allowed_calling_aets, get_registered_source_calling_aets
from app.services.dimse_event_store import get_dimse_statistics
from app.services.runtime_config import get_runtime_config

router = APIRouter(prefix="/dimse", tags=["DIMSE"])


def _dimse_status_payload(runtime_state, runtime: dict, stats: dict) -> dict:
    configured_ae = runtime["dimse_ae_title"]
    configured_port = runtime["dimse_port"]
    active_ae = runtime_state.ae_title if runtime_state.listening else None
    active_port = runtime_state.port if runtime_state.listening else None
    listener_pending = runtime_state.listening and (
        active_ae != configured_ae or active_port != configured_port
    )

    return {
        "listening": runtime_state.listening,
        "ae_title": configured_ae,
        "port": configured_port,
        "configured_ae_title": configured_ae,
        "configured_port": configured_port,
        "active_ae_title": active_ae,
        "active_port": active_port,
        "listener_pending": listener_pending,
        "promiscuous_mode": runtime["dimse_promiscuous_mode"],
        "allowed_calling_aets": sorted(get_allowed_calling_aets()),
        "registered_source_aets": sorted(get_registered_source_calling_aets()),
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


@router.get("/status")
async def dimse_status(
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("operator", "admin", "service_user")),
) -> dict:
    runtime_state = get_dimse_runtime()
    runtime = get_runtime_config()
    stats = await get_dimse_statistics(db)
    return _dimse_status_payload(runtime_state, runtime, stats)


@router.post("/reload")
async def dimse_reload(
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
) -> dict:
    try:
        await reload_dimse_listener()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"DIMSE listener reload failed: {exc}",
        ) from exc

    runtime_state = get_dimse_runtime()
    runtime = get_runtime_config()
    stats = await get_dimse_statistics(db)
    return _dimse_status_payload(runtime_state, runtime, stats)
