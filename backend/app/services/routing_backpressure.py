"""Routing queue backpressure (Phase 2.3)."""

from __future__ import annotations

import time

import structlog

from app.config import settings
from app.observability.metrics import inc_counter
from app.observability.queues import get_queue_depths_sync

logger = structlog.get_logger()

# DICOM PS3.7 — Refused: Out of Resources (C-STORE backpressure)
OUT_OF_RESOURCES = 0xA700


def routing_queue_depth() -> int:
    return get_queue_depths_sync().get("routing_queue", 0)


def is_routing_queue_overloaded() -> bool:
    """True when routing queue depth is at or above the backpressure threshold."""
    limit = settings.routing_queue_backpressure_max
    if limit <= 0:
        return False
    return routing_queue_depth() >= limit


def wait_for_routing_queue_slot(poll_seconds: float = 1.0) -> None:
    """Block until routing queue depth is below the backpressure threshold."""
    limit = settings.routing_queue_backpressure_max
    if limit <= 0:
        return

    waited = 0.0
    while True:
        depth = routing_queue_depth()
        if depth < limit:
            if waited > 0:
                logger.info(
                    "routing_backpressure_release",
                    queue_depth=depth,
                    limit=limit,
                    waited_seconds=round(waited, 1),
                )
            return

        if waited == 0:
            logger.warning("routing_backpressure_wait", queue_depth=depth, limit=limit)
            inc_counter("synapse_routing_backpressure_waits_total")

        time.sleep(poll_seconds)
        waited += poll_seconds
