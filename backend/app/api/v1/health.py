"""Health check endpoint for service and dependency monitoring."""

import asyncio
import time
from datetime import datetime, timezone

import httpx
import redis.asyncio as aioredis
from fastapi import APIRouter
from sqlalchemy import text

from app.config import settings
from app.database import async_session_factory
from app.dimse.stats import get_dimse_runtime
from app.schemas.common import HealthComponent, HealthResponse
from app.services.runtime_config import get_runtime_config

router = APIRouter(tags=["Health"])


def _latency_ms(start: float) -> int:
    return max(0, int((time.perf_counter() - start) * 1000))


async def _check_postgres() -> HealthComponent:
    start = time.perf_counter()
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
        return HealthComponent(name="postgresql", status="healthy", latency_ms=_latency_ms(start))
    except Exception as exc:
        return HealthComponent(
            name="postgresql", status="unhealthy", message=str(exc), latency_ms=_latency_ms(start)
        )


async def _check_redis() -> HealthComponent:
    start = time.perf_counter()
    try:
        client = aioredis.from_url(settings.redis_url)
        await client.ping()
        await client.aclose()
        return HealthComponent(name="redis", status="healthy", latency_ms=_latency_ms(start))
    except Exception as exc:
        return HealthComponent(name="redis", status="unhealthy", message=str(exc), latency_ms=_latency_ms(start))


async def _check_http(name: str, url: str) -> HealthComponent:
    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url)
            if response.status_code < 400:
                return HealthComponent(name=name, status="healthy", latency_ms=_latency_ms(start))
            return HealthComponent(
                name=name,
                status="unhealthy",
                message=f"HTTP {response.status_code}",
                latency_ms=_latency_ms(start),
            )
    except Exception as exc:
        return HealthComponent(name=name, status="unhealthy", message=str(exc), latency_ms=_latency_ms(start))


def _check_dimse_listener() -> HealthComponent:
    start = time.perf_counter()
    runtime = get_dimse_runtime()
    latency = _latency_ms(start)
    if runtime.listening:
        return HealthComponent(
            name="dimse_listener",
            status="healthy",
            message=f"{runtime.ae_title}@{runtime.port}",
            latency_ms=latency,
        )
    return HealthComponent(name="dimse_listener", status="unhealthy", message="Not listening", latency_ms=latency)


async def _check_celery_workers() -> HealthComponent:
    start = time.perf_counter()
    from app.config import settings
    from app.observability.workers import get_celery_health_summary

    summary = await asyncio.to_thread(get_celery_health_summary)
    latency = _latency_ms(start)
    routing_expected = max(settings.celery_routing_replicas, 1)
    migration_expected = max(settings.celery_migration_replicas, 1)
    routing_ok = summary["routing_workers"] >= routing_expected
    migration_ok = summary["migration_workers"] >= migration_expected
    message = (
        f"routing {summary['routing_workers']}/{routing_expected} workers, "
        f"{summary['routing_active_tasks']} active; "
        f"migration {summary['migration_workers']}/{migration_expected} workers, "
        f"{summary['migration_active_tasks']} active"
    )
    if routing_ok and migration_ok:
        return HealthComponent(name="celery_workers", status="healthy", message=message, latency_ms=latency)
    return HealthComponent(name="celery_workers", status="degraded", message=message, latency_ms=latency)


@router.get("/health/live")
async def health_live() -> dict[str, str]:
    """Fast liveness probe for Docker/orchestrator (no Celery inspect)."""
    return {"status": "ok"}


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    components = [
        _check_dimse_listener(),
        await _check_celery_workers(),
        await _check_postgres(),
        await _check_redis(),
        await _check_http(
            "orthanc_onprem", f"{settings.orthanc_onprem_dicomweb_url.rsplit('/dicom-web', 1)[0]}/system"
        ),
        await _check_http(
            "orthanc_cloud", f"{settings.orthanc_cloud_dicomweb_url.rsplit('/dicom-web', 1)[0]}/system"
        ),
        await _check_http("keycloak", f"{settings.keycloak_url}/realms/{settings.keycloak_realm}"),
        await _check_http(
            "ollama", f"{get_runtime_config().get('ollama_base_url', settings.ollama_base_url).rstrip('/')}/"
        ),
    ]
    overall = "healthy" if all(c.status == "healthy" for c in components) else "degraded"
    return HealthResponse(
        status=overall,
        components=components,
        timestamp=datetime.now(timezone.utc),
    )
