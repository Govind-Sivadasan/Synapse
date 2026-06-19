"""Tests for Celery worker health helpers (Phase 4.1)."""

from app.observability.workers import _count_workers_by_queue


def test_count_workers_by_queue():
    active_queues = {
        "routing@a": [{"name": "routing_queue"}],
        "routing@b": [{"name": "routing_queue"}],
        "migration@c": [{"name": "migration_queue"}],
    }
    counts = _count_workers_by_queue(active_queues)
    assert counts["routing_queue"] == 2
    assert counts["migration_queue"] == 1


def test_count_workers_by_queue_empty():
    assert _count_workers_by_queue(None) == {"routing_queue": 0, "migration_queue": 0}
