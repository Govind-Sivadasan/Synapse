"""Tests for Redis-backed migration job counters (Phase 2.6)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.migration import MigrationJob
from app.services import migration_job_counters as counters


class FakeHashRedis:
    def __init__(self) -> None:
        self.hashes: dict[str, dict[str, str]] = {}
        self.deleted: set[str] = set()

    def delete(self, key: str) -> None:
        self.hashes.pop(key, None)
        self.deleted.add(key)

    def exists(self, key: str) -> bool:
        return key in self.hashes

    def expire(self, key: str, ttl: int) -> None:
        return None

    def hset(self, key: str, mapping: dict | None = None, **kwargs) -> None:
        bucket = self.hashes.setdefault(key, {})
        if mapping:
            for field, value in mapping.items():
                bucket[field] = str(value)
        for field, value in kwargs.items():
            bucket[field] = str(value)

    def hget(self, key: str, field: str) -> str | None:
        return self.hashes.get(key, {}).get(field)

    def hgetall(self, key: str) -> dict[str, str]:
        return dict(self.hashes.get(key, {}))

    def hincrby(self, key: str, field: str, amount: int = 1) -> int:
        bucket = self.hashes.setdefault(key, {})
        current = int(bucket.get(field, 0))
        current += amount
        bucket[field] = str(current)
        return current


@pytest.fixture
def fake_redis(monkeypatch):
    client = FakeHashRedis()
    monkeypatch.setattr(counters, "_redis_client", client)
    monkeypatch.setattr(counters.settings, "migration_redis_counters_enabled", True)
    monkeypatch.setattr(counters.settings, "migration_job_counter_flush_interval", 5)
    monkeypatch.setattr(counters.settings, "metrics_enabled", False)
    return client


def test_undo_study_failure_terminal_reverses_failed_count(fake_redis):
    job_id = uuid.uuid4()
    counters.init_job_counters(job_id, completed=0, failed=0)
    counters.record_study_in_progress(job_id)
    counters.record_study_terminal(job_id, "failed")
    assert counters.get_job_counters(job_id)["failed"] == 1

    counters.undo_study_failure_terminal(job_id)
    counts = counters.get_job_counters(job_id)
    assert counts["failed"] == 0
    assert counts["terminals"] == 0


def test_record_study_terminal_updates_counters(fake_redis):
    job_id = uuid.uuid4()
    counters.init_job_counters(job_id, completed=0, failed=0)
    counters.record_study_in_progress(job_id)
    terminals = counters.record_study_terminal(job_id, "success")

    counts = counters.get_job_counters(job_id)
    assert counts["completed"] == 1
    assert counts["in_progress"] == 0
    assert terminals == 1


def test_should_flush_every_n_terminals(monkeypatch):
    monkeypatch.setattr(counters.settings, "migration_job_counter_flush_interval", 5)
    assert counters.should_flush_job_counters(5) is True
    assert counters.should_flush_job_counters(4) is False
    assert counters.should_flush_job_counters(10) is True


def test_is_job_complete_requires_discovery_and_no_in_progress():
    job = MigrationJob(
        id=uuid.uuid4(),
        name="test",
        job_type="bulk",
        source_node_id=uuid.uuid4(),
        destination_node_id=uuid.uuid4(),
        status="in_progress",
        total_studies=10,
        discovery_complete=True,
    )
    counts = {"completed": 8, "failed": 2, "skipped": 0, "in_progress": 0, "terminals": 10}
    assert counters.is_job_complete(job, counts) is True

    counts["in_progress"] = 1
    assert counters.is_job_complete(job, counts) is False


@pytest.mark.asyncio
async def test_flush_job_counters_skips_db_until_interval(fake_redis, monkeypatch):
    job_id = uuid.uuid4()
    counters.init_job_counters(job_id, completed=0, failed=0)
    for _ in range(3):
        counters.record_study_terminal(job_id, "success")

    job = MagicMock(spec=MigrationJob)
    job.total_studies = 100
    job.discovery_complete = True
    job.completed_studies = 0
    job.failed_studies = 0
    job.end_time = None

    session = AsyncMock()
    session.get = AsyncMock(return_value=job)

    await counters.flush_job_counters(session, job_id, force=False)
    assert job.completed_studies == 0

    counters.record_study_terminal(job_id, "success")
    counters.record_study_terminal(job_id, "success")
    await counters.flush_job_counters(session, job_id, force=False)
    assert job.completed_studies == 5


@pytest.mark.asyncio
async def test_flush_job_counters_completes_job_on_last_study(fake_redis, monkeypatch):
    job_id = uuid.uuid4()
    counters.init_job_counters(job_id, completed=0, failed=0)
    counters.record_study_terminal(job_id, "success")
    counters.record_study_terminal(job_id, "failed")

    job = MagicMock(spec=MigrationJob)
    job.id = job_id
    job.total_studies = 2
    job.discovery_complete = True
    job.completed_studies = 0
    job.failed_studies = 0
    job.status = "in_progress"
    job.end_time = None

    session = AsyncMock()
    session.get = AsyncMock(return_value=job)

    published: list[tuple] = []
    monkeypatch.setattr(counters, "publish_event", lambda event, payload: published.append((event, payload)))

    await counters.flush_job_counters(session, job_id, force=True)
    assert job.status == "partial"
    assert job.completed_studies == 1
    assert job.failed_studies == 1
    assert published and published[0][0] == "migration_job_completed"
    assert str(job_id) not in fake_redis.hashes
