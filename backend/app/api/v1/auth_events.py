"""Authentication-related audit events."""

from fastapi import APIRouter, Depends, Request

from app.auth.keycloak import CurrentUser, require_roles
from app.database import get_db
from app.schemas.common import MessageResponse
from app.services.audit_logger import AuditLogger
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login-audit", response_model=MessageResponse)
async def record_login(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("viewer", "service_user", "operator", "admin")),
) -> MessageResponse:
    await AuditLogger.log(
        db,
        "USER_LOGIN",
        user_id=user.sub,
        user_role=",".join(user.roles),
        details={"username": user.username},
        ip_address=request.client.host if request.client else None,
    )
    return MessageResponse(message="Login recorded")
