# Performance Engine Guide

Synapse includes a **performance engine** (separate from product phases in the README) for migration throughput, observability, and database scale.

| Phase | Goal (project plan) |
|-------|---------------------|
| **0** | Instrumentation — `/metrics`, baseline API, load-test script |
| **1** | Quick wins — pools, indexes, dashboard rollups |
| **2** | Pipeline architecture — coordinator, WADO/STOW, backpressure |
| **3** | Data layer & observability — partitions, archival, tracing |
| **4** | Horizontal scale — replicas, shared storage, destination rate limits |
| **5** | Operator UI at scale — throughput charts, pause, queue widget |

> Product **Phase 4** in README = migration UI. This doc uses **performance phases 0–5** above. Full checklist: `.cursor/skills/synapse-performance/SKILL.md`.

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

## Performance phases (authoritative roadmap)

Phases **1–5** follow the project performance plan. **Phase 0** is repo instrumentation (metrics/baseline API). See `.cursor/skills/synapse-performance/SKILL.md` for full deliverable checklists and honest completion status.

| Phase | Theme | Repo status |
|-------|--------|-------------|
| 0 | Instrumentation | Done |
| 1 | Quick wins (pools, indexes, rollups) | Done |
| 2 | Pipeline architecture | Partial |
| 3 | Data layer & observability | Partial |
| 4 | Horizontal scale | Not started |
| 5 | Operator UI at scale | Not started |

## Reference baselines (Govind)

| Phase | Studies | Conc | migrate_study | Notes |
|-------|---------|------|---------------|-------|
| Pre-WADO | 158 | 4 | 7.0 s | Before parallel WADO |
| 2 slice | 158 | 8 | 4.84 s | Single STOW; re-validate |
| 3 sign-off A | 79 | 8 | 8.76 s | Batch STOW, partitions + tracing |
| 3 sign-off B | 79 | 8 | 16.09 s | Single STOW, warm PACS |

Full roadmap and gap analysis: `.cursor/skills/synapse-performance/SKILL.md`.

Valid baseline run hygiene:

1. `reset_performance_metrics.py --yes`
2. One migration job at a time
3. `docker compose up -d --force-recreate celery-migration` after `.env` changes

## Related docs

- [MIGRATION_TESTING.md](MIGRATION_TESTING.md) — migration job flow and worker logs
- [SETUP.md](SETUP.md) — service reference including `partition-maintenance`
- [RUN.md](RUN.md) — compose service groups
