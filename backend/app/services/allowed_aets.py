"""Cache of permitted calling AE titles loaded from configured source nodes."""

import threading

from sqlalchemy import select

from app.database import async_session_factory
from app.models.node import Node

_lock = threading.Lock()
_allowed_aets: set[str] = {"STORESCU", "ECHOSCU", "MODALITY", "ORTHANC_ONPREM"}


def get_allowed_calling_aets() -> set[str]:
    with _lock:
        return set(_allowed_aets)


def set_allowed_calling_aets(aets: set[str]) -> None:
    global _allowed_aets
    with _lock:
        _allowed_aets = set(aets) | {"STORESCU", "ECHOSCU"}


async def refresh_allowed_calling_aets() -> set[str]:
    async with async_session_factory() as session:
        result = await session.execute(
            select(Node.ae_title).where(
                Node.node_type == "source",
                Node.is_active.is_(True),
                Node.ae_title.isnot(None),
            )
        )
        source_aets = {row[0].strip() for row in result.all() if row[0]}
        merged = source_aets | {"STORESCU", "ECHOSCU", "MODALITY", "ORTHANC_ONPREM"}
        set_allowed_calling_aets(merged)
        return merged
