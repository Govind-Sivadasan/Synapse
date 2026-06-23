"""Enqueue Celery tasks by name without importing task modules in the API process.

Importing task modules from async FastAPI handlers can pull in asyncio/SQLAlchemy
machinery and break the active async session (MissingGreenlet).
"""

from app.observability.tracing import trace_kwargs
from celery_app import celery_app

MIGRATION_QUEUE = "migration_queue"
ROUTING_QUEUE = "routing_queue"


def enqueue_coordinator_next_page(job_id: str, countdown: float = 0) -> str:
    result = celery_app.send_task(
        "tasks.migration_tasks.fetch_and_enqueue_studies",
        args=[job_id],
        kwargs=trace_kwargs(job_id=job_id),
        queue=MIGRATION_QUEUE,
        countdown=max(0, countdown),
    )
    return result.id


def enqueue_fetch_and_enqueue_studies(job_id: str) -> str:
    result = celery_app.send_task(
        "tasks.migration_tasks.fetch_and_enqueue_studies",
        args=[job_id],
        kwargs=trace_kwargs(job_id=job_id),
        queue=MIGRATION_QUEUE,
    )
    return result.id


def enqueue_migrate_study(job_id: str, study_uid: str) -> str:
    result = celery_app.send_task(
        "tasks.migration_tasks.migrate_study",
        args=[job_id, study_uid],
        kwargs=trace_kwargs(job_id=job_id, study_uid=study_uid),
        queue=MIGRATION_QUEUE,
    )
    return result.id


def enqueue_route_study_from_source(source_node_id: str, study_uid: str) -> str:
    result = celery_app.send_task(
        "tasks.routing_tasks.route_study_from_source",
        args=[source_node_id, study_uid],
        kwargs=trace_kwargs(source_node_id=source_node_id, study_uid=study_uid),
        queue=ROUTING_QUEUE,
    )
    return result.id
