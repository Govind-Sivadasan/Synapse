"""Celery tasks for bulk DICOM migration."""

import uuid

import structlog

from app.database import run_async_task
from celery_app import celery_app

logger = structlog.get_logger()


async def _fetch_and_enqueue(job_id: str) -> dict:
    from sqlalchemy import select

    from app.database import async_session_factory
    from app.migration.engine import MigrationEngine
    from app.models.migration import MigrationStudyRecord

    engine = MigrationEngine()
    job_uuid = uuid.UUID(job_id)

    try:
        async with async_session_factory() as session:
            result = await session.execute(
                select(MigrationStudyRecord).where(MigrationStudyRecord.job_id == job_uuid)
            )
            existing_records = list(result.scalars().all())

        if existing_records:
            to_enqueue = [r for r in existing_records if r.status in ("pending", "failed")]
            async with async_session_factory() as session:
                for record in to_enqueue:
                    if record.status == "failed":
                        db_record = await session.get(MigrationStudyRecord, record.id)
                        if db_record:
                            db_record.status = "pending"
                            db_record.failure_reason = None
                            db_record.completed_at = None
                await session.commit()

            for record in to_enqueue:
                migrate_study.delay(job_id, record.study_uid)

            return {
                "job_id": job_id,
                "studies_found": len(existing_records),
                "enqueued": len(to_enqueue),
                "resumed": True,
            }

        studies = await engine.discover_studies_for_job(job_uuid)
        if not studies:
            from app.database import async_session_factory
            from app.models.migration import MigrationJob
            from datetime import datetime, timezone

            async with async_session_factory() as session:
                job = await session.get(MigrationJob, job_uuid)
                if job and job.status != "cancelled":
                    job.status = "completed"
                    job.total_studies = 0
                    job.end_time = datetime.now(timezone.utc)
                    await session.commit()
            return {"job_id": job_id, "studies_found": 0, "enqueued": 0}

        created = await engine.enqueue_study_records(job_uuid, studies)

        enqueued = 0
        for study in studies:
            migrate_study.delay(job_id, study.study_uid)
            enqueued += 1

        logger.info(
            "fetch_and_enqueue_complete",
            job_id=job_id,
            studies_found=len(studies),
            records_created=created,
            enqueued=enqueued,
        )
        return {
            "job_id": job_id,
            "studies_found": len(studies),
            "records_created": created,
            "enqueued": enqueued,
        }
    except Exception as exc:
        from app.database import async_session_factory
        from app.models.migration import MigrationJob
        from datetime import datetime, timezone

        logger.error("fetch_and_enqueue_failed", job_id=job_id, error=str(exc))
        async with async_session_factory() as session:
            job = await session.get(MigrationJob, job_uuid)
            if job:
                job.status = "failed"
                job.end_time = datetime.now(timezone.utc)
                await session.commit()
        raise


async def _migrate_study(job_id: str, study_uid: str) -> dict:
    from app.migration.engine import MigrationEngine

    engine = MigrationEngine()
    return await engine.migrate_study(uuid.UUID(job_id), study_uid)


@celery_app.task(name="tasks.migration_tasks.fetch_and_enqueue_studies", bind=True, max_retries=2)
def fetch_and_enqueue_studies(self, job_id: str) -> dict:
    """Paginate QIDO-RS on source PACS and enqueue per-study migration tasks."""
    logger.info("fetch_and_enqueue_studies", job_id=job_id)
    try:
        return run_async_task(_fetch_and_enqueue(job_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=2**self.request.retries)


@celery_app.task(name="tasks.migration_tasks.migrate_study", bind=True, max_retries=3)
def migrate_study(self, job_id: str, study_uid: str) -> dict:
    """Migrate a single study: WADO-RS download → morph → STOW-RS upload."""
    logger.info("migrate_study", job_id=job_id, study_uid=study_uid)
    try:
        return run_async_task(_migrate_study(job_id, study_uid))
    except Exception as exc:
        logger.error("migrate_study_task_failed", job_id=job_id, study_uid=study_uid, error=str(exc))
        raise self.retry(exc=exc, countdown=2**self.request.retries)
