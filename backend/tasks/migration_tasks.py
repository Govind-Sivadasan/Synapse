"""Celery tasks for bulk DICOM migration."""

import structlog

from celery_app import celery_app

logger = structlog.get_logger()


@celery_app.task(name="tasks.migration_tasks.fetch_and_enqueue_studies", bind=True)
def fetch_and_enqueue_studies(self, job_id: str) -> dict:
    """Paginate QIDO-RS on source PACS and enqueue per-study migration tasks."""
    logger.info("fetch_and_enqueue_studies", job_id=job_id)
    return {"job_id": job_id, "status": "pending"}


@celery_app.task(name="tasks.migration_tasks.migrate_study", bind=True, max_retries=3)
def migrate_study(self, job_id: str, study_uid: str) -> dict:
    """Migrate a single study: WADO-RS download → morph → STOW-RS upload."""
    logger.info("migrate_study", job_id=job_id, study_uid=study_uid)
    return {"job_id": job_id, "study_uid": study_uid, "status": "pending"}
