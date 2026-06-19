"""Celery worker utilization snapshot for ops dashboards."""

from __future__ import annotations

import structlog

logger = structlog.get_logger()

ROUTING_TASK_PREFIXES = ("tasks.routing_tasks.", "tasks.dimse_tasks.")
MIGRATION_TASK_PREFIX = "tasks.migration_tasks."


def get_worker_utilization() -> dict[str, object]:
    """Best-effort active task counts and online workers via Celery inspect."""
    try:
        from celery_app import celery_app

        inspect = celery_app.control.inspect(timeout=0.5)
        if inspect is None:
            return {"workers_online": 0, "routing_queue": {"active_tasks": 0}, "migration_queue": {"active_tasks": 0}}

        active = inspect.active() or {}
        ping = inspect.ping() or {}

        routing_active = 0
        migration_active = 0
        for tasks in active.values():
            for task in tasks:
                name = task.get("name") or ""
                if name.startswith(MIGRATION_TASK_PREFIX):
                    migration_active += 1
                elif name.startswith(ROUTING_TASK_PREFIXES):
                    routing_active += 1

        return {
            "workers_online": len(ping),
            "routing_queue": {"active_tasks": routing_active},
            "migration_queue": {"active_tasks": migration_active},
        }
    except Exception as exc:
        logger.debug("worker_utilization_unavailable", error=str(exc))
        return {"workers_online": 0, "routing_queue": {"active_tasks": 0}, "migration_queue": {"active_tasks": 0}}
