"""Tests for migration job progress and throughput helpers."""

from unittest.mock import MagicMock, patch

import pytest

from app.services.migration_job_progress import build_throughput_snapshot, record_study_transfer


@pytest.fixture
def mock_redis():
    store: dict[str, dict[str, str]] = {}

    client = MagicMock()

    def hgetall(key: str) -> dict[str, str]:
        return dict(store.get(key, {}))

    def hget(key: str, field: str):
        return store.get(key, {}).get(field)

    def hincrby(key: str, field: str, amount: int) -> int:
        bucket = store.setdefault(key, {})
        bucket[field] = str(int(bucket.get(field, 0)) + amount)
        return int(bucket[field])

    def pipeline():
        pipe = MagicMock()
        ops: list[tuple] = []

        def queue_hincrby(key, field, amount):
            ops.append(("hincrby", key, field, amount))
            return pipe

        def queue_expire(key, ttl):
            ops.append(("expire", key, ttl))
            return pipe

        def execute():
            for op in ops:
                if op[0] == "hincrby":
                    hincrby(op[1], op[2], op[3])
                elif op[0] == "expire":
                    pass

        pipe.hincrby = queue_hincrby
        pipe.expire = queue_expire
        pipe.execute = execute
        return pipe

    client.hgetall = hgetall
    client.hget = hget
    client.hincrby = hincrby
    client.pipeline = pipeline
    return client, store


def test_record_study_transfer_tracks_bytes(mock_redis):
    client, store = mock_redis
    with patch("app.services.migration_job_progress._redis", return_value=client):
        record_study_transfer("job-1", 2048)
        record_study_transfer("job-1", 1024)

    assert store["migration:job:job-1:bytes_total"]["total"] == "3072"


def test_build_throughput_snapshot_includes_samples(mock_redis):
    client, _store = mock_redis
    job = MagicMock()
    job.id = "job-1"
    job.start_time = None
    job.end_time = None
    job.completed_studies = 0
    job.failed_studies = 0

    with patch("app.services.migration_job_progress._redis", return_value=client):
        snapshot = build_throughput_snapshot(job, window_minutes=10)

    assert len(snapshot["samples"]) == 10
    assert snapshot["studies_per_minute"] == 0.0
