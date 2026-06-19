# Performance Engine Guide

Synapse includes a **performance engine** (separate from product phases in the README) for migration throughput, observability, and database scale.

| Perf phase | Goal |
|------------|------|
| **0** | Prometheus `/metrics`, baseline API, load-test script |
| **1** | HTTP pooling, DB indexes, dashboard metric rollups |
| **2** | Parallel WADO, migration queue backpressure |
| **3** | Monthly DB partitions, `trace_id` tracing |
| **Post-3** | Parallel STOW batching, optional OpenTelemetry, partition cron |

> Product **Phase 4** in README = migration UI/API. This doc uses **perf phases** above.

## Quick deploy

After pulling performance changes:

```bash
docker compose exec backend alembic upgrade head
docker compose up -d --build backend celery-routing celery-migration partition-maintenance
```

- Backend runs `manage_partitions.py` once after migrations on startup.
- `partition-maintenance` loops partition creation (default every 24h).

## Environment variables

See `.env.example`. Key knobs:

| Variable | Default | Purpose |
|----------|---------|---------|
| `CELERY_MIGRATION_CONCURRENCY` | 8 | Parallel migration workers |
| `WADO_PARALLEL_INSTANCES` | 8 | Concurrent WADO-RS fetches per study |
| `MIGRATION_QUEUE_BACKPRESSURE_MAX` | 200 | Max queued studies before enqueue blocks |
| `STOW_BATCH_SIZE` | 4 | Instances per STOW multipart request |
| `STOW_PARALLEL_BATCHES` | 2 | Concurrent STOW batches per study |
| `PARTITION_MONTHS_AHEAD` | 3 | Months of future partitions to create |
| `PARTITION_MAINTENANCE_INTERVAL_SECONDS` | 86400 | Cron interval for `partition-maintenance` |
| `OTEL_ENABLED` | false | Export traces via OTLP HTTP |
| `OTEL_EXPORTER_ENDPOINT` | — | e.g. `http://otel-collector:4318/v1/traces` |

## API endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /metrics` | Public | Prometheus scrape |
| `GET /api/v1/performance/baseline` | Operator | JSON snapshot (queues, counters, avg phase times) |
| `GET /api/v1/performance/baseline?since=<marker_id>` | Operator | Delta since checkpoint |
| `POST /api/v1/performance/baseline/mark` | Operator | Save checkpoint before a run |
| `POST /api/v1/performance/baseline/reset` | Operator | Clear cumulative Redis metrics |
| `POST /api/v1/performance/partitions/ensure` | Operator | Create upcoming monthly partitions |

## Baseline workflow

Reset before a clean A/B run:

```bash
docker compose exec backend python scripts/reset_performance_metrics.py --yes
```

Or mark without reset:

```bash
curl -X POST "http://localhost:8000/api/v1/performance/baseline/mark?label=pre-run" \
  -H "Authorization: Bearer $TOKEN"
# after job:
curl "http://localhost:8000/api/v1/performance/baseline?since=<marker_id>" \
  -H "Authorization: Bearer $TOKEN"
```

Load-test helper:

```bash
docker compose exec backend python scripts/load_test_baseline.py --api-url http://backend:8000
```

## Metrics to watch

**Counters:** `synapse_migration_studies_total`, `synapse_celery_queue_depth`, `synapse_migration_backpressure_waits_total`

**Histograms** (avg = sum/count):

| Metric | Labels | Meaning |
|--------|--------|---------|
| `synapse_celery_task_duration_seconds` | `task=migrate_study` | End-to-end per study |
| `synapse_pipeline_phase_duration_seconds` | `phase=wado\|stow\|morph\|db_finalize` | Migration phase breakdown |
| `synapse_dicomweb_request_duration_seconds` | `operation=wado_rs\|stow_rs` | DICOMweb HTTP latency |

**Throughput estimate:** studies/min ≈ `(CELERY_MIGRATION_CONCURRENCY × 60) / avg_migrate_study_seconds`

## Tuning guide

```
Failures/retries high?     → Fix stability first
Queue depth stays high?    → Raise CELERY_MIGRATION_CONCURRENCY
WADO dominates?            → Tune WADO_PARALLEL_INSTANCES
STOW dominates?            → Tune STOW_BATCH_SIZE / STOW_PARALLEL_BATCHES
                             or lower CELERY_MIGRATION_CONCURRENCY
Dashboard slow at scale?   → Verify migration 005 applied; check cache TTL
```

## Tracing

- Every Celery task and HTTP request gets a `trace_id` (16-char hex) in logs and DB rows.
- Pass `X-Trace-Id` on API calls to correlate.
- Optional OpenTelemetry: set `OTEL_ENABLED=true` and `OTEL_EXPORTER_ENDPOINT`. Instruments FastAPI, httpx (DICOMweb), and Celery.

## Partition maintenance

Manual one-shot:

```bash
docker compose exec backend python scripts/manage_partitions.py
```

Or via API: `POST /api/v1/performance/partitions/ensure`

Partitions apply to `audit_logs` and `dimse_events` (Alembic migration `006`).

## Related docs

- [MIGRATION_TESTING.md](MIGRATION_TESTING.md) — migration job flow and worker logs
- [SETUP.md](SETUP.md) — service reference including `partition-maintenance`
- [RUN.md](RUN.md) — compose service groups
