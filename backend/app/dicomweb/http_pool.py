"""Shared httpx connection pools for DICOMweb (Phase 1 performance).

Clients are scoped to the current asyncio event loop so Celery tasks that call
``asyncio.run()`` per task do not reuse httpx clients bound to a closed loop.
"""

from __future__ import annotations

import asyncio
from urllib.parse import urlparse

import httpx

from app.config import settings

_clients: dict[str, httpx.AsyncClient] = {}


def _running_loop_id() -> int:
    try:
        return id(asyncio.get_running_loop())
    except RuntimeError:
        return 0


def _pool_key(base_url: str, timeout: float) -> str:
    netloc = urlparse(base_url).netloc or base_url
    return f"{_running_loop_id()}:{netloc}:{timeout}"


def get_dicomweb_client(base_url: str, timeout: float | None = None) -> httpx.AsyncClient:
    """Return an AsyncClient with connection pooling for a DICOMweb host on this event loop."""
    effective_timeout = timeout if timeout is not None else settings.dicomweb_http_timeout
    key = _pool_key(base_url, effective_timeout)
    client = _clients.get(key)
    if client is None or client.is_closed:
        limits = httpx.Limits(
            max_connections=settings.dicomweb_http_max_connections,
            max_keepalive_connections=settings.dicomweb_http_max_keepalive,
        )
        client = httpx.AsyncClient(timeout=effective_timeout, limits=limits)
        _clients[key] = client
    return client


async def close_dicomweb_clients() -> None:
    """Close pooled clients for the current event loop (or all if no loop is running)."""
    loop_id = _running_loop_id()
    prefix = f"{loop_id}:" if loop_id else None
    for key, client in list(_clients.items()):
        if prefix is not None and not key.startswith(prefix):
            continue
        if not client.is_closed:
            await client.aclose()
        del _clients[key]
