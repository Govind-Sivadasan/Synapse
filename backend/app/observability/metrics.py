"""Redis-backed Prometheus metrics for cross-process Celery + API aggregation."""

from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Iterator

import redis
import structlog
from prometheus_client import CONTENT_TYPE_LATEST, Gauge, generate_latest

from app.config import settings

logger = structlog.get_logger()

METRICS_PREFIX = "synapse:metrics"
HISTOGRAM_BUCKETS = (0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0)

# Gauges updated on each /metrics scrape (API process only).
CELERY_QUEUE_DEPTH = Gauge(
    "synapse_celery_queue_depth",
    "Number of tasks waiting in a Celery Redis queue",
    ["queue"],
)

_redis_client: redis.Redis | None = None


def _redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


def _labels_key(labels: dict[str, str]) -> str:
    if not labels:
        return ""
    parts = [f"{key}={value}" for key, value in sorted(labels.items())]
    return ",".join(parts)


def _metric_key(kind: str, name: str, labels: dict[str, str]) -> str:
    label_part = _labels_key(labels)
    if label_part:
        return f"{METRICS_PREFIX}:{kind}:{name}:{label_part}"
    return f"{METRICS_PREFIX}:{kind}:{name}"


def inc_counter(name: str, labels: dict[str, str] | None = None, amount: int = 1) -> None:
    if not settings.metrics_enabled:
        return
    try:
        key = _metric_key("counter", name, labels or {})
        _redis().incrby(key, amount)
    except Exception as exc:
        logger.warning("metrics_counter_failed", name=name, error=str(exc))


def observe_histogram(
    name: str,
    duration_seconds: float,
    labels: dict[str, str] | None = None,
    buckets: tuple[float, ...] = HISTOGRAM_BUCKETS,
) -> None:
    if not settings.metrics_enabled:
        return
    try:
        base = _metric_key("hist", name, labels or {})
        client = _redis()
        pipe = client.pipeline()
        pipe.incrbyfloat(f"{base}:sum", duration_seconds)
        pipe.incr(f"{base}:count")
        for bucket in buckets:
            if duration_seconds <= bucket:
                pipe.incr(f"{base}:le_{bucket}")
        pipe.incr(f"{base}:le_inf")
        pipe.execute()
    except Exception as exc:
        logger.warning("metrics_histogram_failed", name=name, error=str(exc))


@contextmanager
def timed_phase(component: str, phase: str, **context: str) -> Iterator[None]:
    """Time a pipeline phase and record histogram + structured log."""
    start = time.perf_counter()
    status = "success"
    try:
        yield
    except Exception:
        status = "error"
        raise
    finally:
        duration = time.perf_counter() - start
        labels = {"component": component, "phase": phase, "status": status}
        observe_histogram("synapse_pipeline_phase_duration_seconds", duration, labels)
        logger.info(
            "perf_phase",
            component=component,
            phase=phase,
            status=status,
            duration_ms=round(duration * 1000, 2),
            **context,
        )


def track_task_outcome(
    queue: str,
    task: str,
    duration_seconds: float,
    *,
    success: bool,
    retries: int = 0,
) -> None:
    status = "success" if success else "error"
    inc_counter(
        "synapse_celery_tasks_total",
        {"queue": queue, "task": task, "status": status},
    )
    if retries:
        inc_counter(
            "synapse_celery_task_retries_total",
            {"queue": queue, "task": task},
            amount=retries,
        )
    observe_histogram(
        "synapse_celery_task_duration_seconds",
        duration_seconds,
        {"queue": queue, "task": task, "status": status},
    )


def _parse_labels(label_blob: str) -> dict[str, str]:
    if not label_blob:
        return {}
    labels: dict[str, str] = {}
    for part in label_blob.split(","):
        if "=" in part:
            key, value = part.split("=", 1)
            labels[key] = value
    return labels


def _format_labels(labels: dict[str, str]) -> str:
    if not labels:
        return ""
    inner = ",".join(f'{key}="{value}"' for key, value in sorted(labels.items()))
    return f"{{{inner}}}"


def _parse_metric_body(kind: str, body: str) -> tuple[str, str]:
    """Return metric name and label blob from a Redis metric body key."""
    head = f"{METRICS_PREFIX}:{kind}:"
    rest = body[len(head) :] if body.startswith(head) else body
    name, _, label_blob = rest.partition(":")
    return name, label_blob


def _render_redis_metrics_fixed() -> str:
    """Render counters and histograms stored in Redis."""
    client = _redis()
    lines: list[str] = []

    # Counters
    counter_groups: dict[str, list[tuple[dict[str, str], str]]] = {}
    for key in client.scan_iter(f"{METRICS_PREFIX}:counter:*"):
        parts = key.split(":", 3)
        if len(parts) < 3:
            continue
        name = parts[2]
        label_blob = parts[3] if len(parts) > 3 else ""
        counter_groups.setdefault(name, []).append((_parse_labels(label_blob), client.get(key) or "0"))

    for name in sorted(counter_groups):
        lines.append(f"# TYPE {name} counter")
        for labels, value in sorted(counter_groups[name], key=lambda item: _labels_key(item[0])):
            lines.append(f"{name}{_format_labels(labels)} {value}")

    # Histograms — group by metric name + label set
    hist_meta: dict[str, dict[str, dict[str, float | int]]] = {}
    for key in client.scan_iter(f"{METRICS_PREFIX}:hist:*"):
        if key.endswith(":sum"):
            body, _ = key.rsplit(":sum", 1)
            hist_meta.setdefault(body, {})["sum"] = float(client.get(key) or 0)
        elif key.endswith(":count"):
            body, _ = key.rsplit(":count", 1)
            hist_meta.setdefault(body, {})["count"] = int(client.get(key) or 0)
        elif ":le_" in key:
            body, bucket_part = key.rsplit(":le_", 1)
            bucket = "+Inf" if bucket_part == "inf" else bucket_part
            hist_meta.setdefault(body, {}).setdefault("buckets", {})[bucket] = int(client.get(key) or 0)

    hist_by_name: dict[str, list[tuple[dict[str, str], dict]]] = {}
    for body, data in hist_meta.items():
        name, label_blob = _parse_metric_body("hist", body)
        if not name:
            continue
        hist_by_name.setdefault(name, []).append((_parse_labels(label_blob), data))

    for name in sorted(hist_by_name):
        lines.append(f"# TYPE {name} histogram")
        for labels, data in sorted(hist_by_name[name], key=lambda item: _labels_key(item[0])):
            label_fmt = _format_labels(labels)
            buckets: dict[str, int] = data.get("buckets", {})  # type: ignore[assignment]
            for bucket in HISTOGRAM_BUCKETS:
                count = int(buckets.get(str(bucket), 0))
                le = str(bucket)
                if label_fmt:
                    lines.append(f'{name}_bucket{label_fmt[:-1]},le="{le}"}} {count}')
                else:
                    lines.append(f'{name}_bucket{{le="{le}"}} {count}')
            inf_count = int(buckets.get("+Inf", 0))
            if label_fmt:
                lines.append(f'{name}_bucket{label_fmt[:-1]},le="+Inf"}} {inf_count}')
            else:
                lines.append(f'{name}_bucket{{le="+Inf"}} {inf_count}')
            lines.append(f"{name}_sum{label_fmt} {data.get('sum', 0)}")
            lines.append(f"{name}_count{label_fmt} {data.get('count', 0)}")

    return "\n".join(lines) + ("\n" if lines else "")


async def update_scrape_gauges() -> None:
    from app.observability.queues import get_queue_depths

    depths = await get_queue_depths()
    for queue, depth in depths.items():
        CELERY_QUEUE_DEPTH.labels(queue=queue).set(depth)


def render_prometheus() -> tuple[bytes, str]:
    """Merge in-process gauges with Redis-backed counters/histograms."""
    api_metrics = generate_latest().decode("utf-8")
    redis_metrics = _render_redis_metrics_fixed()
    body = api_metrics
    if redis_metrics:
        body = f"{api_metrics}\n{redis_metrics}" if api_metrics else redis_metrics
    return body.encode("utf-8"), CONTENT_TYPE_LATEST


def get_baseline_snapshot() -> dict:
    """Human-readable performance snapshot for load tests and ops."""
    client = _redis()
    snapshot: dict = {
        "queues": {},
        "counters": {},
        "histograms": {},
    }

    try:
        from app.observability.queues import get_queue_depths_sync

        snapshot["queues"] = get_queue_depths_sync()
    except Exception as exc:
        snapshot["queues_error"] = str(exc)

    for key in client.scan_iter(f"{METRICS_PREFIX}:counter:*"):
        parts = key.split(":", 3)
        if len(parts) < 3:
            continue
        name = parts[2]
        label_blob = parts[3] if len(parts) > 3 else ""
        metric_id = f"{name}{{{label_blob}}}" if label_blob else name
        snapshot["counters"][metric_id] = int(client.get(key) or 0)

    for key in client.scan_iter(f"{METRICS_PREFIX}:hist:*:count"):
        body = key.rsplit(":count", 1)[0]
        name, label_blob = _parse_metric_body("hist", body)
        if not name:
            continue
        sum_key = f"{body}:sum"
        count = int(client.get(key) or 0)
        total = float(client.get(sum_key) or 0)
        metric_id = f"{name}{{{label_blob}}}" if label_blob else name
        snapshot["histograms"][metric_id] = {
            "count": count,
            "sum_seconds": round(total, 4),
            "avg_seconds": round(total / count, 4) if count else 0,
        }

    return snapshot
