"""Append-only audit logging for configuration and operational events."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.services.runtime_config import get_runtime_config

ALWAYS_LOG_EVENT_TYPES = frozenset(
    {"CONFIG_CHANGE", "RETRY_ATTEMPT", "USER_LOGIN", "STUDY_RECEPTION"}
)

EVENT_TOGGLE_KEYS: dict[str, str] = {
    "DIMSE_ASSOCIATION": "audit_log_dimse",
    "DIMSE_ASSOCIATION_REJECTED": "audit_log_dimse",
    "ROUTING_RULE_MATCH": "audit_log_routing",
    "TAG_MORPHING_APPLIED": "audit_log_tag_morphing",
    "JOB_STATUS_CHANGE": "audit_log_migration",
    "CHATBOT_QUERY": "audit_log_chatbot",
}

PHI_DETAIL_KEYS = frozenset(
    {"patient_id", "PatientID", "patient_name", "PatientName", "accession_number", "AccessionNumber"}
)


def _audit_enabled(event_type: str) -> bool:
    if event_type in ALWAYS_LOG_EVENT_TYPES:
        return True
    toggle_key = EVENT_TOGGLE_KEYS.get(event_type)
    if toggle_key is None:
        return True
    config = get_runtime_config()
    return bool(config.get(toggle_key, True))


def _sanitize_details(details: dict[str, Any] | None) -> dict[str, Any] | None:
    if not details:
        return details
    config = get_runtime_config()
    if config.get("audit_include_phi", False):
        return details
    sanitized = dict(details)
    for key in list(sanitized.keys()):
        if key in PHI_DETAIL_KEYS or "patient" in key.lower():
            sanitized[key] = "[REDACTED]"
    return sanitized


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
    ) -> AuditLog | None:
        if not _audit_enabled(event_type):
            return None

        entry = AuditLog(
            id=uuid.uuid4(),
            event_type=event_type,
            user_id=user_id,
            user_role=user_role,
            entity_type=entity_type,
            entity_id=entity_id,
            details=_sanitize_details(details),
            ip_address=ip_address,
        )
        db.add(entry)
        await db.flush()
        return entry
