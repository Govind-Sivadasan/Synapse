from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.audit_log import AuditLog


class AuditLogResponse(BaseModel):
    id: UUID
    event_type: str
    user_id: str | None
    username: str | None = None
    user_role: str | None
    entity_type: str | None
    entity_id: UUID | None
    details: dict | None
    ip_address: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


def audit_log_response(item: AuditLog) -> AuditLogResponse:
    resp = AuditLogResponse.model_validate(item)
    username = None
    if resp.details and isinstance(resp.details.get("username"), str):
        username = resp.details["username"]
    return resp.model_copy(update={"username": username})


class AuditLogListResponse(BaseModel):
    total: int
    items: list[AuditLogResponse]
