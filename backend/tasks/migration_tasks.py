"""Celery tasks for bulk DICOM migration."""

import time
import uuid

import structlog

from app.config import settings
from app.database import run_async_task
from app.observability.metrics import inc_counter, timed_phase, track_task_outcome
from app.observability.tracing import trace_kwargs
from app.services.migration_backpressure import wait_for_migration_queue_slot
from celery_app import celery_app

logger = structlog.get_logger()


async def _mark_job_failed(job_id: str) -> None:
    from datetime import datetime, timezone

    from app.database import async_session_factory
    from app.models.migration import MigrationJob

    async with async_session_factory() as session:
        job = await session.get(MigrationJob, uuid.UUID(job_id))
        if job and job.status not in ("cancelled", "completed", "partial"):
            job.status = "failed"
            job.end_time = datetime.now(timezone.utc)
            await session.commit()


async def _resume_enqueue(job_id: str, job_uuid: uuid.UUID) -> dict:
    from sqlalchemy import select

    from app.database import async_session_factory
    from app.models.migration import MigrationStudyRecord

    async with async_session_factory() as session:
        result = await session.execute(
            select(MigrationStudyRecord).where(MigrationStudyRecord.job_id == job_uuid)
        )
        existing_records = list(result.scalars().all())

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

    enqueued = 0
    for record in to_enqueue:
        wait_for_migration_queue_slot()
        migrate_study.delay(
            job_id,
            record.study_uid,
            **trace_kwargs(study_uid=record.study_uid),
        )
        enqueued += 1

    return {
        "job_id": job_id,
        "studies_found": len(existing_records),
        "enqueued": enqueued,
        "resumed": True,
    }


async def _fetch_and_enqueue_legacy(job_id: str) -> dict:
    from sqlalchemy import select

    from app.database import async_session_factory
    from app.migration.engine import MigrationEngine
    from app.models.migration import MigrationJob, MigrationStudyRecord
    from datetime import datetime, timezone

    engine = MigrationEngine()
    job_uuid = uuid.UUID(job_id)

    async with async_session_factory() as session:
        result = await session.execute(
            select(MigrationStudyRecord).where(MigrationStudyRecord.job_id == job_uuid)
        )
        existing_records = list(result.scalars().all())

    if existing_records:
        return await _resume_enqueue(job_id, job_uuid)

    studies = await engine.discover_studies_for_job(job_uuid)
    if not studies:
        async with async_session_factory() as session:
            job = await session.get(MigrationJob, job_uuid)
            if job and job.status != "cancelled":
                job.status = "completed"
                job.total_studies = 0
                job.discovery_complete = True
                job.end_time = datetime.now(timezone.utc)
                await session.commit()
        return {"job_id": job_id, "studies_found": 0, "enqueued": 0}

    created = await engine.enqueue_study_records(job_uuid, studies)

    enqueued = 0
    for study in studies:
        wait_for_migration_queue_slot()
        migrate_study.delay(
            job_id,
            study.study_uid,
            **trace_kwargs(study_uid=study.study_uid),
        )
        enqueued += 1

    async with async_session_factory() as session:
        job = await session.get(MigrationJob, job_uuid)
        if job and job.status != "cancelled":
            job.discovery_complete = True
            await session.commit()

    logger.info(
        "fetch_and_enqueue_complete",
        job_id=job_id,
        studies_found=len(studies),
        records_created=created,
        enqueued=enqueued,
        mode="legacy",
    )
    return {
        "job_id": job_id,
        "studies_found": len(studies),
        "records_created": created,
        "enqueued": enqueued,
    }


async def _coordinator_tick(job_id: str) -> dict:
    from sqlalchemy import select

    from app.database import async_session_factory
    from app.migration.engine import MigrationEngine
    from app.models.migration import MigrationJob, MigrationStudyRecord
    from app.workers.dispatch import enqueue_coordinator_next_page
    from datetime import datetime, timezone

    engine = MigrationEngine()
    job_uuid = uuid.UUID(job_id)

    async with async_session_factory() as session:
        job = await session.get(MigrationJob, job_uuid)
        if not job:
            raise ValueError(f"Migration job not found: {job_id}")
        if job.status == "cancelled":
            return {"job_id": job_id, "status": "cancelled", "enqueued": 0}

        result = await session.execute(
            select(MigrationStudyRecord).where(MigrationStudyRecord.job_id == job_uuid)
        )
        existing_records = list(result.scalars().all())

    if existing_records and job.discovery_complete:
        return await _resume_enqueue(job_id, job_uuid)

    first_tick = job.discovery_offset == 0 and not existing_records
    if first_tick:
        async with async_session_factory() as session:
            job = await session.get(MigrationJob, job_uuid)
            if job and job.status not in ("cancelled", "discovering", "in_progress"):
                job.status = "discovering"
                job.start_time = job.start_time or datetime.now(timezone.utc)
                await session.commit()

    with timed_phase("migration", "discovery_page", job_id=job_id):
        page, has_more = await engine.discover_studies_page(job_uuid)

    if not page and job.discovery_offset == 0 and not existing_records:
        async with async_session_factory() as session:
            job = await session.get(MigrationJob, job_uuid)
            if job and job.status != "cancelled":
                job.status = "completed"
                job.total_studies = 0
                job.discovery_complete = True
                job.end_time = datetime.now(timezone.utc)
                await session.commit()
        return {"job_id": job_id, "studies_found": 0, "enqueued": 0, "page": 0}

    created = await engine.enqueue_study_records(job_uuid, page)
    study_uids = [study.study_uid for study in page]
    to_enqueue = await engine.study_uids_needing_migration(job_uuid, study_uids)

    enqueued = 0
    for study_uid in to_enqueue:
        wait_for_migration_queue_slot()
        migrate_study.delay(
            job_id,
            study_uid,
            **trace_kwargs(study_uid=study_uid),
        )
        enqueued += 1

    await engine.advance_discovery_progress(job_uuid, page, has_more, first_tick=first_tick)
    inc_counter("synapse_migration_discovery_pages_total")

    new_offset = job.discovery_offset + len(page)
    logger.info(
        "coordinator_page_complete",
        job_id=job_id,
        page_size=len(page),
        records_created=created,
        enqueued=enqueued,
        has_more=has_more,
        discovery_offset=new_offset,
    )

    if has_more:
        enqueue_coordinator_next_page(job_id, countdown=settings.migration_coordinator_chain_delay_seconds)

    return {
        "job_id": job_id,
        "page_size": len(page),
        "records_created": created,
        "enqueued": enqueued,
        "has_more": has_more,
        "mode": "coordinator",
    }


async def _fetch_and_enqueue(job_id: str) -> dict:
    if settings.migration_streaming_discovery:
        return await _coordinator_tick(job_id)
    return await _fetch_and_enqueue_legacy(job_id)


async def _migrate_study(job_id: str, study_uid: str) -> dict:
    from app.migration.engine import MigrationEngine

    engine = MigrationEngine()
    return await engine.migrate_study(uuid.UUID(job_id), study_uid)


@celery_app.task(name="tasks.migration_tasks.fetch_and_enqueue_studies", bind=True, max_retries=2)
def fetch_and_enqueue_studies(self, job_id: str, **_: object) -> dict:
    """Paginate QIDO-RS on source PACS and enqueue per-study migration tasks."""
    logger.info("fetch_and_enqueue_studies", job_id=job_id)
    started = time.perf_counter()
    try:
        result = run_async_task(_fetch_and_enqueue(job_id))
        track_task_outcome(
            "migration_queue",
            "fetch_and_enqueue_studies",
            time.perf_counter() - started,
            success=True,
            retries=self.request.retries,
        )
        return result
    except Exception as exc:
        track_task_outcome(
            "migration_queue",
            "fetch_and_enqueue_studies",
            time.perf_counter() - started,
            success=False,
            retries=self.request.retries,
        )
        logger.error("fetch_and_enqueue_failed", job_id=job_id, error=str(exc))
        run_async_task(_mark_job_failed(job_id))
        raise self.retry(exc=exc, countdown=2**self.request.retries)


@celery_app.task(name="tasks.migration_tasks.migrate_study", bind=True, max_retries=3)
def migrate_study(self, job_id: str, study_uid: str, **_: object) -> dict:
    """Migrate a single study: WADO-RS download → morph → STOW-RS upload."""
    logger.info("migrate_study", job_id=job_id, study_uid=study_uid)
    started = time.perf_counter()
    try:
        result = run_async_task(_migrate_study(job_id, study_uid))
        track_task_outcome(
            "migration_queue",
            "migrate_study",
            time.perf_counter() - started,
            success=True,
            retries=self.request.retries,
        )
        return result
    except Exception as exc:
        track_task_outcome(
            "migration_queue",
            "migrate_study",
            time.perf_counter() - started,
            success=False,
            retries=self.request.retries,
        )
        logger.error("migrate_study_task_failed", job_id=job_id, study_uid=study_uid, error=str(exc))
        raise self.retry(exc=exc, countdown=2**self.request.retries)
