"""Synapse FastAPI application entry point."""

import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.api.v1.router import api_router
from app.config import settings
from app.database import async_session_factory
from app.dimse.listener import DIMSEListener
from app.services.allowed_aets import refresh_allowed_calling_aets
from app.services.runtime_config import set_runtime_overrides
from app.services.system_config import get_system_config
from app.websocket.manager import ws_manager
from app.websocket.redis_bridge import redis_event_subscriber
from app.observability.metrics import render_prometheus, update_scrape_gauges

logger = structlog.get_logger()
dimse_listener: DIMSEListener | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global dimse_listener
    logger.info("starting_synapse", ae_title=settings.dimse_ae_title, port=settings.dimse_port)

    async with async_session_factory() as session:
        config = await get_system_config(session)
        set_runtime_overrides(config)

    await refresh_allowed_calling_aets()

    dimse_listener = DIMSEListener()
    dimse_task = asyncio.create_task(dimse_listener.start())
    redis_task = asyncio.create_task(redis_event_subscriber())

    yield

    redis_task.cancel()
    if dimse_listener:
        await dimse_listener.stop()
    dimse_task.cancel()
    for task in (redis_task, dimse_task):
        try:
            await task
        except asyncio.CancelledError:
            pass
    logger.info("synapse_shutdown_complete")


app = FastAPI(
    title=settings.app_name,
    description="DICOM Data Migration Router - DIMSE to DICOMweb bridge",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
async def root() -> dict:
    return {"service": settings.app_name, "version": "0.1.0", "docs": "/docs"}


@app.get("/metrics")
async def prometheus_metrics() -> Response:
    """Prometheus scrape endpoint (queue depth + pipeline/task metrics)."""
    await update_scrape_gauges()
    body, content_type = render_prometheus()
    return Response(content=body, media_type=content_type)


@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
