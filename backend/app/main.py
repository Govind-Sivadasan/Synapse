"""Synapse FastAPI application entry point."""

import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.config import settings
from app.dimse.listener import DIMSEListener
from app.websocket.manager import ws_manager

logger = structlog.get_logger()
dimse_listener: DIMSEListener | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global dimse_listener
    logger.info("starting_synapse", ae_title=settings.dimse_ae_title, port=settings.dimse_port)

    dimse_listener = DIMSEListener()
    dimse_task = asyncio.create_task(dimse_listener.start())

    yield

    if dimse_listener:
        await dimse_listener.stop()
    dimse_task.cancel()
    try:
        await dimse_task
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


@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
