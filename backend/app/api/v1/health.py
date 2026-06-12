"""Health check endpoint for service and dependency monitoring."""

from datetime import datetime, timezone

import httpx
import redis.asyncio as aioredis
from fastapi import APIRouter
from sqlalchemy import text

from app.config import settings
from app.database import async_session_factory
from app.schemas.common import HealthComponent, HealthResponse

router = APIRouter(tags=["Health"])


async def _check_postgres() -> HealthComponent:
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
        return HealthComponent(name="postgresql", status="healthy")
    except Exception as exc:
        return HealthComponent(name="postgresql", status="unhealthy", message=str(exc))


async def _check_redis() -> HealthComponent:
    try:
        client = aioredis.from_url(settings.redis_url)
        await client.ping()
        await client.aclose()
        return HealthComponent(name="redis", status="healthy")
    except Exception as exc:
        return HealthComponent(name="redis", status="unhealthy", message=str(exc))


async def _check_http(name: str, url: str) -> HealthComponent:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url)
            if response.status_code < 400:
                return HealthComponent(name=name, status="healthy")
            return HealthComponent(name=name, status="unhealthy", message=f"HTTP {response.status_code}")
    except Exception as exc:
        return HealthComponent(name=name, status="unhealthy", message=str(exc))


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    components = [
        await _check_postgres(),
        await _check_redis(),
        await _check_http("orthanc_onprem", f"{settings.orthanc_onprem_dicomweb_url.rsplit('/dicom-web', 1)[0]}/system"),
        await _check_http("orthanc_cloud", f"{settings.orthanc_cloud_dicomweb_url.rsplit('/dicom-web', 1)[0]}/system"),
        await _check_http("keycloak", f"{settings.keycloak_url}/realms/{settings.keycloak_realm}"),
        await _check_http("ollama", f"{settings.ollama_base_url}/"),
    ]
    overall = "healthy" if all(c.status == "healthy" for c in components) else "degraded"
    return HealthResponse(
        status=overall,
        components=components,
        timestamp=datetime.now(timezone.utc),
    )
