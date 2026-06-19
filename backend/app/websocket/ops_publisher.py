"""Periodic queue depth and worker utilization over WebSocket (Phase 3.3)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import structlog

from app.config import settings
from app.observability.queues import get_queue_depths
from app.observability.workers import get_worker_utilization
from app.websocket.event_batcher import event_batcher

logger = structlog.get_logger()


async def ws_ops_publisher() -> None:
    interval = max(settings.ws_ops_snapshot_interval_seconds, 1.0)
    logger.info("ws_ops_publisher_started", interval_seconds=interval)
    try:
        while True:
            if settings.ws_ops_events_enabled:
                depths = await get_queue_depths()
                workers = get_worker_utilization()
                await event_batcher.enqueue(
                    "ops_snapshot",
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "queues": depths,
                        "workers_online": workers.get("workers_online", 0),
                        "routing_queue": {
                            "queued": depths.get("routing_queue", 0),
                            "active_tasks": workers.get("routing_queue", {}).get("active_tasks", 0),
                        },
                        "migration_queue": {
                            "queued": depths.get("migration_queue", 0),
                            "active_tasks": workers.get("migration_queue", {}).get("active_tasks", 0),
                        },
                    },
                )
            await asyncio.sleep(interval)
    except asyncio.CancelledError:
        logger.info("ws_ops_publisher_stopped")
        raise
