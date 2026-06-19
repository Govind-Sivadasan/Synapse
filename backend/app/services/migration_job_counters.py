"""Redis-backed migration job counters (Phase 2.6 — reduce per-study COUNT queries)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import redis
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.migration import MigrationJob
from app.observability.metrics import inc_counter
from app.services.event_publisher import publish_event

logger = structlog.get_logger()

_COUNTERS_TTL_SECONDS = 7 * 86400
_redis_client: redis.Redis | None = None


def _redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


def _key(job_id: uuid.UUID | str) -> str:
    return f"migration:job:{job_id}:counters"


def clear_job_counters(job_id: uuid.UUID | str) -> None:
    _redis().delete(_key(job_id))


def init_job_counters(job_id: uuid.UUID | str, *, completed: int, failed: int) -> None:
    """Seed Redis counters from DB (job start/resume)."""
    client = _redis()
    key = _key(job_id)
    client.hset(
        key,
        mapping={
            "completed": max(0, completed),
            "failed": max(0, failed),
            "skipped": 0,
            "in_progress": 0,
            "terminals": 0,
        },
    )
    client.expire(key, _COUNTERS_TTL_SECONDS)


async def ensure_job_counters_initialized(session: AsyncSession, job_id: uuid.UUID) -> None:
    if _redis().exists(_key(job_id)):
        return
    job = await session.get(MigrationJob, job_id)
    if not job:
        return
    init_job_counters(job_id, completed=job.completed_studies, failed=job.failed_studies)


def cancel_study_in_progress(job_id: uuid.UUID | str) -> None:
    """Undo in_progress counter when a study task exits without completing."""
    if not settings.migration_redis_counters_enabled:
        return
    client = _redis()
    key = _key(job_id)
    if int(client.hget(key, "in_progress") or 0) > 0:
        client.hincrby(key, "in_progress", -1)


def record_study_in_progress(job_id: uuid.UUID | str) -> None:
    if not settings.migration_redis_counters_enabled:
        return
    client = _redis()
    key = _key(job_id)
    if not client.exists(key):
        init_job_counters(job_id, completed=0, failed=0)
    client.hincrby(key, "in_progress", 1)


def record_study_terminal(job_id: uuid.UUID | str, status: str) -> int:
    """Update Redis counters on study completion. Returns terminal count for flush interval."""
    if not settings.migration_redis_counters_enabled:
        return 0

    client = _redis()
    key = _key(job_id)
    if not client.exists(key):
        init_job_counters(job_id, completed=0, failed=0)

    if status == "success":
        client.hincrby(key, "completed", 1)
    elif status == "failed":
        client.hincrby(key, "failed", 1)
    elif status == "skipped":
        client.hincrby(key, "skipped", 1)

    in_progress = int(client.hget(key, "in_progress") or 0)
    if in_progress > 0:
        client.hincrby(key, "in_progress", -1)

    return int(client.hincrby(key, "terminals", 1))


def get_job_counters(job_id: uuid.UUID | str) -> dict[str, int]:
    raw = _redis().hgetall(_key(job_id))
    if not raw:
        return {"completed": 0, "failed": 0, "skipped": 0, "in_progress": 0, "terminals": 0}
    return {
        "completed": int(raw.get("completed", 0)),
        "failed": int(raw.get("failed", 0)),
        "skipped": int(raw.get("skipped", 0)),
        "in_progress": int(raw.get("in_progress", 0)),
        "terminals": int(raw.get("terminals", 0)),
    }


def should_flush_job_counters(terminals: int) -> bool:
    interval = settings.migration_job_counter_flush_interval
    if interval <= 1:
        return True
    return terminals % interval == 0


def is_job_complete(job: MigrationJob, counts: dict[str, int]) -> bool:
    total = job.total_studies or 0
    completed = counts["completed"]
    failed = counts["failed"]
    skipped = counts["skipped"]
    in_progress = counts["in_progress"]
    accounted = completed + failed + skipped
    return bool(
        job.discovery_complete
        and in_progress == 0
        and total > 0
        and accounted >= total
        and (completed or failed)
    )


async def flush_job_counters(session: AsyncSession, job_id: uuid.UUID, *, force: bool = False) -> None:
    """Write Redis counters to migration_jobs and evaluate job completion."""
    if not settings.migration_redis_counters_enabled:
        return

    counts = get_job_counters(job_id)
    if not force and not should_flush_job_counters(counts["terminals"]):
        job = await session.get(MigrationJob, job_id)
        if not job or not is_job_complete(job, counts):
            return

    job = await session.get(MigrationJob, job_id)
    if not job:
        return

    job.completed_studies = counts["completed"]
    job.failed_studies = counts["failed"]

    if is_job_complete(job, counts):
        completed = counts["completed"]
        failed = counts["failed"]
        if failed and completed:
            job.status = "partial"
        elif failed and not completed:
            job.status = "failed"
        else:
            job.status = "completed"
        job.end_time = job.end_time or datetime.now(timezone.utc)
        clear_job_counters(job_id)
        publish_event(
            "migration_job_completed",
            {
                "job_id": str(job_id),
                "status": job.status,
                "completed_studies": job.completed_studies,
                "failed_studies": job.failed_studies,
            },
        )

    inc_counter("synapse_migration_job_counter_flushes_total")
    logger.debug(
        "migration_job_counters_flushed",
        job_id=str(job_id),
        completed=counts["completed"],
        failed=counts["failed"],
        in_progress=counts["in_progress"],
    )
