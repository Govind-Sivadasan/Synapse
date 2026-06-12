"""Celery application with segregated routing and migration queues."""

from celery import Celery

from app.config import settings

celery_app = Celery(
    "synapse",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["tasks.routing_tasks", "tasks.migration_tasks", "tasks.dimse_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "tasks.routing_tasks.*": {"queue": "routing_queue"},
        "tasks.migration_tasks.*": {"queue": "migration_queue"},
    },
    task_default_retry_delay=5,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)
