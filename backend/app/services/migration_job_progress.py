"""Migration job progress and throughput helpers (Phase 5)."""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone

import redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.migration import MigrationJob, MigrationStudyRecord
from app.services.migration_job_counters import get_job_counters

_THROUGHPUT_TTL_SECONDS = 86400
_redis_client: redis.Redis | None = None


def _redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


def _throughput_bucket_key(job_id: uuid.UUID | str, minute_epoch: int) -> str:
    return f"migration:job:{job_id}:throughput:{minute_epoch}"


def _bytes_total_key(job_id: uuid.UUID | str) -> str:
    return f"migration:job:{job_id}:bytes_total"


async def get_study_status_counts(session: AsyncSession, job_id: uuid.UUID) -> dict[str, int]:
    result = await session.execute(
        select(MigrationStudyRecord.status, func.count())
        .where(MigrationStudyRecord.job_id == job_id)
        .group_by(MigrationStudyRecord.status)
    )
    raw = {row[0]: int(row[1]) for row in result.all()}
    return {
        "pending": raw.get("pending", 0),
        "in_progress": raw.get("in_progress", 0),
        "success": raw.get("success", 0),
        "failed": raw.get("failed", 0),
        "skipped": raw.get("skipped", 0),
    }


async def build_job_progress(session: AsyncSession, job: MigrationJob) -> dict:
    counts = await get_study_status_counts(session, job.id)
    in_flight = counts["in_progress"]
    if job.status in ("in_progress", "discovering", "paused") and settings.migration_redis_counters_enabled:
        redis_counts = get_job_counters(job.id)
        in_flight = max(in_flight, redis_counts["in_progress"])

    discovered = job.discovered_studies
    if job.discovery_complete and job.total_studies is not None:
        discovered = job.total_studies

    done = counts["success"] + counts["failed"] + counts["skipped"]
    return {
        "discovered": discovered,
        "enqueued": counts["pending"],
        "in_flight": in_flight,
        "done": done,
        "success": counts["success"],
        "failed": counts["failed"],
        "skipped": counts["skipped"],
    }


def record_study_transfer(job_id: uuid.UUID | str, bytes_transferred: int) -> None:
    if bytes_transferred <= 0:
        return
    client = _redis()
    minute_epoch = int(time.time()) // 60
    bucket_key = _throughput_bucket_key(job_id, minute_epoch)
    pipe = client.pipeline()
    pipe.hincrby(bucket_key, "studies", 1)
    pipe.hincrby(bucket_key, "bytes", bytes_transferred)
    pipe.expire(bucket_key, _THROUGHPUT_TTL_SECONDS)
    pipe.hincrby(_bytes_total_key(job_id), "total", bytes_transferred)
    pipe.expire(_bytes_total_key(job_id), _THROUGHPUT_TTL_SECONDS)
    pipe.execute()


def get_job_bytes_total(job_id: uuid.UUID | str) -> int:
    return int(_redis().hget(_bytes_total_key(job_id), "total") or 0)


def build_throughput_snapshot(job: MigrationJob, *, window_minutes: int = 30) -> dict:
    client = _redis()
    now_minute = int(time.time()) // 60
    samples: list[dict] = []
    total_studies = 0
    total_bytes = 0

    for offset in range(window_minutes - 1, -1, -1):
        minute_epoch = now_minute - offset
        raw = client.hgetall(_throughput_bucket_key(job.id, minute_epoch))
        studies = int(raw.get("studies", 0))
        bytes_count = int(raw.get("bytes", 0))
        total_studies += studies
        total_bytes += bytes_count
        ts = datetime.fromtimestamp(minute_epoch * 60, tz=timezone.utc).isoformat()
        samples.append(
            {
                "timestamp": ts,
                "studies": studies,
                "studies_per_minute": float(studies),
                "megabytes_per_second": round(bytes_count / (1024 * 1024 * 60), 4) if bytes_count else 0.0,
            }
        )

    elapsed_seconds = 0.0
    if job.start_time:
        end = job.end_time or datetime.now(timezone.utc)
        elapsed_seconds = max(1.0, (end - job.start_time).total_seconds())

    completed = job.completed_studies + job.failed_studies
    bytes_total = get_job_bytes_total(job.id)
    studies_per_minute = round((completed / elapsed_seconds) * 60, 2) if completed else 0.0
    megabytes_per_second = round(bytes_total / elapsed_seconds / (1024 * 1024), 4) if bytes_total else 0.0

    recent_studies = sum(s["studies"] for s in samples[-5:])
    recent_bytes = sum(
        int(_redis().hget(_throughput_bucket_key(job.id, now_minute - i), "bytes") or 0)
        for i in range(5)
    )
    recent_studies_per_minute = round(recent_studies / 5, 2) if recent_studies else studies_per_minute
    recent_megabytes_per_second = (
        round(recent_bytes / (5 * 60) / (1024 * 1024), 4) if recent_bytes else megabytes_per_second
    )

    return {
        "studies_per_minute": recent_studies_per_minute,
        "megabytes_per_second": recent_megabytes_per_second,
        "elapsed_seconds": round(elapsed_seconds, 1),
        "completed_studies": completed,
        "bytes_transferred": bytes_total,
        "samples": samples,
    }
