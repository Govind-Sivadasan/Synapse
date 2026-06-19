"""Tests for Phase 0 observability metrics."""

import fnmatch

import pytest

from app.observability import metrics as metrics_module


class FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, int | float | str] = {}

    def incrby(self, key: str, amount: int = 1) -> int:
        self.values[key] = int(self.values.get(key, 0)) + amount
        return int(self.values[key])

    def incrbyfloat(self, key: str, amount: float) -> float:
        self.values[key] = float(self.values.get(key, 0)) + amount
        return float(self.values[key])

    def incr(self, key: str) -> int:
        return self.incrby(key, 1)

    def get(self, key: str):
        return self.values.get(key)

    def set(self, key: str, value: str) -> None:
        self.values[key] = value

    def delete(self, key: str) -> None:
        self.values.pop(key, None)

    def pipeline(self):
        return FakePipeline(self)

    def scan_iter(self, match: str):
        for key in sorted(self.values):
            if fnmatch.fnmatch(key, match):
                yield key


class FakePipeline:
    def __init__(self, redis: FakeRedis) -> None:
        self.redis = redis
        self.ops: list[tuple] = []

    def incrbyfloat(self, key: str, amount: float):
        self.ops.append(("incrbyfloat", key, amount))
        return self

    def incr(self, key: str):
        self.ops.append(("incr", key))
        return self

    def execute(self):
        for op in self.ops:
            if op[0] == "incrbyfloat":
                self.redis.incrbyfloat(op[1], op[2])
            elif op[0] == "incr":
                self.redis.incr(op[1])
        self.ops.clear()


@pytest.fixture
def fake_redis(monkeypatch):
    client = FakeRedis()
    monkeypatch.setattr(metrics_module, "_redis_client", client)
    monkeypatch.setattr(metrics_module.settings, "metrics_enabled", True)
    return client


def test_inc_counter(fake_redis):
    metrics_module.inc_counter("synapse_test_total", {"status": "ok"})
    metrics_module.inc_counter("synapse_test_total", {"status": "ok"}, amount=2)
    rendered = metrics_module._render_redis_metrics_fixed()
    assert "# TYPE synapse_test_total counter" in rendered
    assert "synapse_test_total" in rendered
    assert 'status="ok"' in rendered
    assert "counter{status=" not in rendered
    assert rendered.strip().endswith("3")


def test_track_task_outcome_renders_correct_counter_name(fake_redis):
    metrics_module.track_task_outcome("migration_queue", "migrate_study", 1.0, success=True)
    rendered = metrics_module._render_redis_metrics_fixed()
    assert "# TYPE synapse_celery_tasks_total counter" in rendered
    assert 'task="migrate_study"' in rendered


def test_observe_histogram(fake_redis):
    metrics_module.observe_histogram(
        "synapse_test_duration_seconds",
        0.42,
        {"task": "demo"},
    )
    rendered = metrics_module._render_redis_metrics_fixed()
    assert "synapse_test_duration_seconds_bucket" in rendered
    assert "synapse_test_duration_seconds_sum" in rendered
    assert "synapse_test_duration_seconds_count" in rendered


def test_track_task_outcome(fake_redis, monkeypatch):
    from app.observability import queues as queues_module

    monkeypatch.setattr(
        queues_module,
        "get_queue_depths_sync",
        lambda: {"routing_queue": 0, "migration_queue": 0},
    )
    metrics_module.track_task_outcome(
        "routing_queue",
        "route_study",
        1.25,
        success=True,
        retries=0,
    )
    snapshot = metrics_module.get_baseline_snapshot()
    assert any("synapse_celery_tasks_total" in key for key in snapshot["counters"])
    assert any("synapse_celery_task_duration_seconds" in key for key in snapshot["histograms"])


def test_baseline_marker_delta(fake_redis, monkeypatch):
    from app.observability import queues as queues_module

    monkeypatch.setattr(
        queues_module,
        "get_queue_depths_sync",
        lambda: {"routing_queue": 0, "migration_queue": 0},
    )
    metrics_module.inc_counter("synapse_test_total", {"status": "ok"}, amount=2)
    marker = metrics_module.save_baseline_marker(label="before-run")
    metrics_module.inc_counter("synapse_test_total", {"status": "ok"}, amount=3)

    delta = metrics_module.get_baseline_snapshot(since_marker=marker["marker_id"])
    assert delta["since_marker_id"] == marker["marker_id"]
    assert delta["counters"]["synapse_test_total{status=ok}"] == 3


def test_reset_cumulative_metrics(fake_redis):
    metrics_module.inc_counter("synapse_test_total", {"status": "ok"})
    metrics_module.observe_histogram("synapse_test_duration_seconds", 0.5, {"task": "demo"})
    metrics_module.save_baseline_marker(label="checkpoint")

    deleted = metrics_module.reset_cumulative_metrics()
    assert deleted >= 3
    snapshot = metrics_module.get_baseline_snapshot()
    assert snapshot["counters"] == {}
    assert snapshot["histograms"] == {}
