"""Audit log query API."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.keycloak import CurrentUser, require_roles
from app.database import get_db
from app.models.audit_log import AuditLog
from app.schemas.audit_log import AuditLogListResponse, AuditLogResponse

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


@router.get("", response_model=AuditLogListResponse)
async def list_audit_logs(
    event_type: str | None = None,
    user_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("service_user", "operator", "admin")),
) -> AuditLogListResponse:
    query = select(AuditLog)
    count_query = select(func.count()).select_from(AuditLog)

    if event_type:
        query = query.where(AuditLog.event_type == event_type)
        count_query = count_query.where(AuditLog.event_type == event_type)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
        count_query = count_query.where(AuditLog.user_id == user_id)
    if date_from:
        query = query.where(AuditLog.created_at >= date_from)
        count_query = count_query.where(AuditLog.created_at >= date_from)
    if date_to:
        query = query.where(AuditLog.created_at <= date_to)
        count_query = count_query.where(AuditLog.created_at <= date_to)

    total = await db.scalar(count_query) or 0
    result = await db.execute(query.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset))
    items = list(result.scalars().all())

    return AuditLogListResponse(
        total=total,
        items=[AuditLogResponse.model_validate(item) for item in items],
    )
