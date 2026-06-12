"""Append-only audit logging for configuration and operational events."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


class AuditLogger:
    @staticmethod
    async def log(
        db: AsyncSession,
        event_type: str,
        *,
        user_id: str | None = None,
        user_role: str | None = None,
        entity_type: str | None = None,
        entity_id: uuid.UUID | None = None,
        details: dict[str, Any] | None = None,
        ip_address: str | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            id=uuid.uuid4(),
            event_type=event_type,
            user_id=user_id,
            user_role=user_role,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
            ip_address=ip_address,
        )
        db.add(entry)
        await db.flush()
        return entry
