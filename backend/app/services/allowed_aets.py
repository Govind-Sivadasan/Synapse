"""Cache of permitted calling AE titles loaded from configured source nodes."""

import threading

from sqlalchemy import select

from app.database import async_session_factory
from app.models.node import Node
from app.services.runtime_config import get_runtime_config

# Built-in test callers (scripts/test_dimse_e2e.py). Not registered PACS nodes.
_TEST_CALLING_AETS = frozenset({"STORESCU", "ECHOSCU"})

# Deny-all sentinel when strict mode has zero registered source AETs.
_DENY_ALL_CALLING_AET = "__SYNAPSE_NO_CALLERS__"

_lock = threading.Lock()
_allowed_aets: set[str] = set(_TEST_CALLING_AETS)


def get_allowed_calling_aets() -> set[str]:
    with _lock:
        return set(_allowed_aets)


def get_registered_source_calling_aets() -> set[str]:
    with _lock:
        return set(_allowed_aets) - set(_TEST_CALLING_AETS)


def is_calling_aet_allowed(calling_ae: str) -> bool:
    if get_runtime_config()["dimse_promiscuous_mode"]:
        return True
    normalized = calling_ae.strip()
    if not normalized:
        return False
    return normalized in get_allowed_calling_aets()


def get_required_calling_aets() -> list[str]:
    """Calling AE allow-list for pynetdicom; empty list accepts any caller."""
    if get_runtime_config()["dimse_promiscuous_mode"]:
        return []

    allowed = get_allowed_calling_aets()
    registered = allowed - set(_TEST_CALLING_AETS)
    if not registered:
        # pynetdicom treats [] as "no restriction"; use impossible AET to reject all.
        return [_DENY_ALL_CALLING_AET]
    return sorted(allowed)


def set_allowed_calling_aets(aets: set[str]) -> None:
    global _allowed_aets
    with _lock:
        _allowed_aets = set(aets) | set(_TEST_CALLING_AETS)


async def refresh_allowed_calling_aets() -> set[str]:
    async with async_session_factory() as session:
        result = await session.execute(
            select(Node.ae_title).where(
                Node.node_type == "source",
                Node.is_active.is_(True),
                Node.ae_title.isnot(None),
            )
        )
        source_aets = {row[0].strip() for row in result.all() if row[0] and row[0].strip()}
        merged = source_aets | set(_TEST_CALLING_AETS)
        set_allowed_calling_aets(merged)
        _sync_dimse_calling_aet_policy()
        return merged


def _sync_dimse_calling_aet_policy() -> None:
    from app.dimse.listener import refresh_calling_aet_policy

    refresh_calling_aet_policy()
