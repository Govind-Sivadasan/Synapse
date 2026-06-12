"""System configuration API."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.keycloak import CurrentUser, require_roles
from app.database import get_db
from app.schemas.config import SystemConfigResponse, SystemConfigUpdate
from app.services.audit_logger import AuditLogger
from app.services.runtime_config import set_runtime_overrides
from app.services.system_config import get_system_config, save_system_config

router = APIRouter(prefix="/config", tags=["System Config"])


@router.get("", response_model=SystemConfigResponse)
async def get_config(
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
) -> dict:
    return await get_system_config(db)


@router.put("", response_model=SystemConfigResponse)
async def update_config(
    payload: SystemConfigUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("admin")),
) -> dict:
    updates = payload.model_dump(exclude_unset=True)
    config = await save_system_config(db, updates, updated_by=user.username)
    set_runtime_overrides(updates)

    await AuditLogger.log(
        db,
        "CONFIG_CHANGE",
        user_id=user.sub,
        user_role="admin",
        entity_type="SystemConfig",
        details={"action": "update", "changes": updates},
        ip_address=request.client.host if request.client else None,
    )
    return config
