"""Operational reporting and audit export API."""

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.keycloak import CurrentUser, require_roles
from app.database import get_db
from app.models.audit_log import AuditLog
from app.schemas.dashboard import ChartDataPoint, ReportSummaryResponse
from app.services.dashboard_metrics import get_report_summary

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/summary", response_model=ReportSummaryResponse)
async def get_summary(
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("service_user", "operator", "admin")),
) -> ReportSummaryResponse:
    return await get_report_summary(db, days=days)


@router.get("/audit/summary", response_model=list[ChartDataPoint])
async def get_audit_summary(
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("service_user", "operator", "admin")),
) -> list[ChartDataPoint]:
    from datetime import timedelta, timezone

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        await db.execute(
            select(AuditLog.event_type, func.count())
            .where(AuditLog.created_at >= cutoff)
            .group_by(AuditLog.event_type)
            .order_by(func.count().desc())
        )
    ).all()
    return [ChartDataPoint(label=row[0], value=row[1]) for row in rows]


@router.get("/audit/export")
async def export_audit_logs(
    event_type: str | None = None,
    user_id: str | None = None,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("operator", "admin")),
):
    from datetime import timedelta, timezone

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    query = select(AuditLog).where(AuditLog.created_at >= cutoff)
    if event_type:
        query = query.where(AuditLog.event_type == event_type)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)

    result = await db.execute(query.order_by(AuditLog.created_at.desc()).limit(5000))
    items = list(result.scalars().all())

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["timestamp", "event_type", "user_id", "user_role", "entity_type", "entity_id", "details", "ip_address"]
    )
    for item in items:
        writer.writerow(
            [
                item.created_at.isoformat() if item.created_at else "",
                item.event_type,
                item.user_id or "",
                item.user_role or "",
                item.entity_type or "",
                str(item.entity_id) if item.entity_id else "",
                str(item.details) if item.details else "",
                item.ip_address or "",
            ]
        )

    output.seek(0)
    filename = f"synapse-audit-{datetime.utcnow().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
