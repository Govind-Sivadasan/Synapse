"""Shared httpx connection pools for DICOMweb (Phase 1 performance)."""

from __future__ import annotations

from urllib.parse import urlparse

import httpx

from app.config import settings

_clients: dict[str, httpx.AsyncClient] = {}


def _pool_key(base_url: str, timeout: float) -> str:
    netloc = urlparse(base_url).netloc or base_url
    return f"{netloc}:{timeout}"


def get_dicomweb_client(base_url: str, timeout: float | None = None) -> httpx.AsyncClient:
    """Return a process-wide AsyncClient with connection pooling for a DICOMweb host."""
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
    """Close pooled clients (tests / graceful shutdown)."""
    for key, client in list(_clients.items()):
        if not client.is_closed:
            await client.aclose()
        del _clients[key]
