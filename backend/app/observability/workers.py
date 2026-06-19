"""Celery worker utilization snapshot for ops dashboards and health checks."""

from __future__ import annotations

import time

import structlog

logger = structlog.get_logger()

ROUTING_TASK_PREFIXES = ("tasks.routing_tasks.", "tasks.dimse_tasks.")
MIGRATION_TASK_PREFIX = "tasks.migration_tasks."
ROUTING_QUEUE = "routing_queue"
MIGRATION_QUEUE = "migration_queue"

_HEALTH_CACHE_TTL_SECONDS = 5.0
_health_cache: dict[str, object] | None = None
_health_cache_at: float = 0.0


def _count_workers_by_queue(active_queues: dict | None) -> dict[str, int]:
    counts = {ROUTING_QUEUE: 0, MIGRATION_QUEUE: 0}
    if not active_queues:
        return counts
    for queues in active_queues.values():
        names = {entry.get("name") for entry in queues if isinstance(entry, dict)}
        if ROUTING_QUEUE in names:
            counts[ROUTING_QUEUE] += 1
        if MIGRATION_QUEUE in names:
            counts[MIGRATION_QUEUE] += 1
    return counts


def get_worker_utilization() -> dict[str, object]:
    """Best-effort active task counts and online workers via Celery inspect."""
    summary = get_celery_health_summary()
    return {
        "workers_online": summary["workers_online"],
        "routing_queue": {
            "active_tasks": summary["routing_active_tasks"],
            "workers": summary["routing_workers"],
        },
        "migration_queue": {
            "active_tasks": summary["migration_active_tasks"],
            "workers": summary["migration_workers"],
        },
    }


def get_celery_health_summary(*, use_cache: bool = True) -> dict[str, int]:
    """Worker counts and active tasks for health checks."""
    global _health_cache, _health_cache_at

    now = time.monotonic()
    if use_cache and _health_cache is not None and (now - _health_cache_at) < _HEALTH_CACHE_TTL_SECONDS:
        return dict(_health_cache)  # type: ignore[arg-type]

    empty = {
        "workers_online": 0,
        "routing_workers": 0,
        "migration_workers": 0,
        "routing_active_tasks": 0,
        "migration_active_tasks": 0,
    }
    try:
        from celery_app import celery_app
        from app.config import settings

        timeout = settings.celery_inspect_timeout_seconds
        inspect = celery_app.control.inspect(timeout=timeout)
        if inspect is None:
            return empty

        ping = inspect.ping() or {}
        if not ping:
            logger.debug("celery_inspect_ping_empty", timeout=timeout)
            return empty

        active = inspect.active() or {}
        queue_workers = _count_workers_by_queue(inspect.active_queues())

        routing_active = 0
        migration_active = 0
        for tasks in active.values():
            for task in tasks:
                name = task.get("name") or ""
                if name.startswith(MIGRATION_TASK_PREFIX):
                    migration_active += 1
                elif name.startswith(ROUTING_TASK_PREFIXES):
                    routing_active += 1

        result = {
            "workers_online": len(ping),
            "routing_workers": queue_workers[ROUTING_QUEUE],
            "migration_workers": queue_workers[MIGRATION_QUEUE],
            "routing_active_tasks": routing_active,
            "migration_active_tasks": migration_active,
        }
        if result["workers_online"] > 0:
            _health_cache = result
            _health_cache_at = now
        return result
    except Exception as exc:
        logger.debug("worker_utilization_unavailable", error=str(exc))
        return empty
