"""Enqueue Celery tasks by name without importing task modules in the API process.

Importing task modules from async FastAPI handlers can pull in asyncio/SQLAlchemy
machinery and break the active async session (MissingGreenlet).
"""

from celery_app import celery_app

MIGRATION_QUEUE = "migration_queue"


def enqueue_fetch_and_enqueue_studies(job_id: str) -> str:
    result = celery_app.send_task(
        "tasks.migration_tasks.fetch_and_enqueue_studies",
        args=[job_id],
        queue=MIGRATION_QUEUE,
    )
    return result.id


def enqueue_migrate_study(job_id: str, study_uid: str) -> str:
    result = celery_app.send_task(
        "tasks.migration_tasks.migrate_study",
        args=[job_id, study_uid],
        queue=MIGRATION_QUEUE,
    )
    return result.id
