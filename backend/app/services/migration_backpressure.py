"""Migration queue backpressure (Phase 2)."""

from __future__ import annotations

import time

import structlog

from app.config import settings
from app.observability.metrics import inc_counter
from app.observability.queues import get_queue_depths_sync

logger = structlog.get_logger()


def wait_for_migration_queue_slot(poll_seconds: float = 1.0) -> None:
    """Block until migration queue depth is below the backpressure threshold."""
    limit = settings.migration_queue_backpressure_max
    if limit <= 0:
        return

    waited = 0.0
    while True:
        depth = get_queue_depths_sync().get("migration_queue", 0)
        if depth < limit:
            if waited > 0:
                logger.info(
                    "migration_backpressure_release",
                    queue_depth=depth,
                    limit=limit,
                    waited_seconds=round(waited, 1),
                )
            return

        if waited == 0:
            logger.warning("migration_backpressure_wait", queue_depth=depth, limit=limit)
            inc_counter("synapse_migration_backpressure_waits_total")

        time.sleep(poll_seconds)
        waited += poll_seconds
