from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: UUID
    event_type: str
    user_id: str | None
    user_role: str | None
    entity_type: str | None
    entity_id: UUID | None
    details: dict | None
    ip_address: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    total: int
    items: list[AuditLogResponse]
