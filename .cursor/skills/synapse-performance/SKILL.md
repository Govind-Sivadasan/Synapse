---
name: synapse-performance
description: Synapse performance roadmap (Phases 0–5), Prometheus/baseline interpretation, and next-step decisions after migration or routing load tests. Use when the user asks about performance phases, /metrics, baseline API, WADO/STOW bottlenecks, Celery queue depth, or what to build next.
---

# Synapse performance engine

**Authoritative roadmap:** Phases **1–5** below (project plan). **Phase 0** is repo instrumentation added before Phase 1.

**Do not confuse** with product phases in README (product Phase 4 = migration UI).

---

## Execution order (required)

1. **Ascending phases only** — complete open items in Phase **N** before starting Phase **N+1**.
2. **Skip only when harmful or out of scope** — record the skip in this file (e.g. optional tiers not needed for client).
3. **Do not jump ahead** — Phase **4.5** (STOW rate limits) was implemented early; treat as done but **do not add more Phase 4** until Phase **3** is closed.
4. **Commits** — read `.cursor/skills/synapse-git-commits/SKILL.md` and `.cursor/rules/git-commit-format.mdc` (bullet body, no `Co-authored-by`).

### Current focus (client delivery)

| Phase | Status | Next action |
|-------|--------|-------------|
| **0** | Done | — |
| **1** | **Done** | 1.5 `GET /routing-transactions/summary` shipped |
| **2** | **Done** | 2.6 Redis job counters shipped — Phase 2 closed |
| **3** | **Done** | 3.1–3.3 complete |
| **4** | Partial | 4.1 worker scale + 4.3 shared temp volume done; 4.5 STOW limits done |
| **5** | Not started | After Phase 4 |

### Phase 2 — explicit skips (not harmful to defer)

| Item | Skip? | Reason |
|------|-------|--------|
| 2.2 `migrate_study_batch` | **Skip** | Optional tier; adds complexity without client requirement |
| 2.5 STOW streaming body / adapters | **Skip** | Batch STOW sufficient; streaming multipart risky to change mid-delivery |

---

## Roadmap overview

| Phase | Theme | Timeline (plan) | Repo status |
|-------|--------|-----------------|-------------|
| **0** | Instrumentation — metrics, baseline API, load-test script | — | **Done** |
| **1** | Quick wins — pools, indexes, rollups | 1–2 weeks | **Done** |
| **2** | Pipeline architecture — coordinator, WADO/STOW, backpressure | 3–5 weeks | **Done** |
| **3** | Data layer & observability — partitions, archival, tracing | 2–3 weeks | **Done** |
| **4** | Horizontal scale & production hardening | 3–4 weeks | **Partial** (4.1, 4.3, 4.5 done) |
| **5** | UI & operator experience at scale | — | **Not started** |

---

## Phase 0 — Instrumentation (repo addition)

| Deliverable | Status |
|-------------|--------|
| `GET /metrics` (Prometheus) | Done |
| `GET/POST /api/v1/performance/baseline` (+ mark, reset, `?since=`) | Done |
| `scripts/load_test_baseline.py`, `scripts/reset_performance_metrics.py` | Done |
| Phase histograms (`synapse_pipeline_phase_duration_seconds`) | Done |

---

## Phase 1 — Quick wins (config + DB, low risk)

**Goal:** ~2–4× on same hardware without architectural rewrites.

| # | Deliverable | Status | Notes |
|---|-------------|--------|-------|
| 1.1 | Worker/pool tuning (`CELERY_*_CONCURRENCY`, DB pool) | Done | `config.py`, `docker-compose.yml` |
| 1.2 | Reuse HTTP connections (shared httpx pool per worker) | Done | `http_pool.py` |
| 1.3 | DB indexes (routing, migration, audit) | Done | Alembic `005` |
| 1.4 | Dashboard metrics rollups (`metrics_daily`) | Done | `metrics_rollup.py`, `dashboard_metrics.py` |
| 1.5 | Aggregate endpoints (avoid full-table scans) | Done | `GET /routing-transactions/summary?days=` uses rollups |

**Exit criteria (plan):** 2–3× throughput on same hardware; dashboard fast at 100k+ rows → **met for typical demo volumes**; not load-tested at 100k+ in CI.

---

## Phase 2 — Pipeline architecture (core engine)

**Goal:** Large jobs start in seconds, bounded memory/queues, no OOM at 10k studies.

| # | Deliverable | Status | Notes |
|---|-------------|--------|-------|
| 2.1 | **Streaming migration discovery** (coordinator, QIDO page-by-page, cap in-flight) | Done | `MIGRATION_STREAMING_DISCOVERY`; legacy path when false |
| 2.2 | Batch-oriented `migrate_study_batch` (optional tier) | **Skipped** | Optional; not required for client bulk migration |
| 2.3 | Live routing backpressure (DIMSE 0xA700 / queue monitor) | Done | `routing_backpressure.py`; C-STORE 0xA700 + enqueue wait |
| 2.4 | Parallel WADO (`WADO_PARALLEL_INSTANCES`, semaphore) | Done | |
| 2.5 | STOW optimization (chunked + parallel batch upload) | **Partial (accepted)** | Batch STOW done; skip streaming body/adapters |
| 2.6 | Reduce DB chatter (Redis counters, batched flush) | Done | `migration_job_counters.py`; `MIGRATION_REDIS_COUNTERS_ENABLED`, flush every N studies |
| 2.7 | Celery HTTP pool event-loop fix | Done | `run_async_task` closes httpx clients |
| 2.8 | Pre-flight source/destination connectivity on job Start | Done | `migration_preflight.py`; `MIGRATION_PREFLIGHT_ECHO` |
| 2.9 | Single active migration job guard on Start | Done | `MIGRATION_SINGLE_ACTIVE_JOB` (409 if overlap) |

**Exit criteria (plan):** 10k-study job discovery in seconds, flat memory, bounded Redis queue → **met for coordinator** (validated at 79 studies: 1 page, 0.06 s discovery).

**Phase 2 closed** (2026-06-15): all required items done; 2.2 and 2.5 streaming explicitly skipped.

---

## Phase 3 — Data layer & observability

**Goal:** Stable at 1M+ transactions; ops can see STOW vs QIDO slowness in traces.

| # | Deliverable | Status | Notes |
|---|-------------|--------|-------|
| 3.1 | Partition large tables | **Done** | Alembic `008`; `audit_logs`, `dimse_events`, `routing_transactions`, `migration_study_records` |
| 3.2 | Archival & retention policy | **Done** | `partition_retention.py`; drop expired monthly partitions; cron via `manage_partitions.py` |
| 3.3 | Event streaming (throttled WS batch events, queue depth on WS) | **Done** | `event_batcher.py`, `ops_publisher.py`; `event_batch` + `ops_snapshot` on WS |
| 3.4 | Tracing (`trace_id`, optional OpenTelemetry OTLP) | Done | `tracing.py`, `otel.py`, Celery signals |
| 3.5 | Partition maintenance cron | Done | `partition-maintenance` service, `manage_partitions.py` |

**Exit criteria (plan):** Dashboards/metrics stable at 1M+ tx; trace slow hops per destination → **tracing done**; **1M scale not validated**.

**Repo sign-off (2026-06-19):** 79-study clean runs, 0 failures — stability for **demo/single-node** scope, not full Phase 3 doc.

---

## Phase 4 — Horizontal scale & production hardening

**Goal:** Linear throughput when adding worker containers; no Redis/Postgres SPOF in prod.

| # | Deliverable | Status |
|---|-------------|--------|
| 4.1 | Scale workers independently (2–4 replicas routing + migration) | **Done** | `CELERY_*_REPLICAS` + `run.ps1`/`run.sh` `--scale`; unique `-n routing@%h` |
| 4.2 | DIMSE intake scaling (multi-listener / ingest service / backpressure) | **Skipped** | Single DIMSE on backend + Phase 2.3 C-STORE backpressure |
| 4.3 | Shared temp storage (NFS/EBS) or pipe mode WADO→STOW | **Done (compose)** | `temp_dicom` volume on backend + all workers; NFS bind in prod |
| 4.4 | Redis HA (Sentinel / managed) | **Doc only** | `REDIS_URL` comment in `.env.example`; no local Sentinel stack |
| 4.5 | Per-destination rate limits (token bucket on STOW) | Done | Shipped in Phase 2 delivery |

**Phase 3 closed** (2026-06-15). Phase 4.1–4.4 may proceed when client needs horizontal scale.

---

## Phase 5 — UI & operator experience at scale

| Feature (plan) | Status |
|----------------|--------|
| Job progress: discovered / enqueued / in-flight / done | **Done** | `GET /migration-jobs/{id}/progress` + pipeline UI |
| Throughput charts (studies/min, MB/s) | **Done** | Redis minute buckets + throughput panel in Migration Jobs |
| Queue depth widget | **Done** | `MigrationQueueWidget` on Migration Jobs (WS `ops_snapshot`) |
| Migration job **pause** (not just cancel) | **Done** | `POST /pause`, `POST /resume`; engine + coordinator respect `paused` |
| Bulk retry failed with concurrency limit | **Done** | `retry-failed?limit=` + `MIGRATION_BULK_RETRY_LIMIT` (default 50) |
| Reports export from rollups | Done |

---

## Is the 1–5 plan “best in class”?

**The roadmap (Phases 1–5) is best-in-class planning** for DICOM migration/routing middleware: it matches what production vendors do — pooling → pipeline control → data lifecycle → horizontal scale → ops UX.

**What is in the repo today is not best-in-class production scale yet.** It is a **strong Phase 1 + Phase 2 migration pipeline** suitable for **client single-node bulk migration**. Missing pieces that separate client v1 from full production scale:

- **Phase 4:** multi-replica workers + shared storage (4.1–4.4; 4.5 STOW limits done)
- **Phase 5:** operator UI at scale — **done** for client scope (progress, throughput, pause, queue widget, bulk retry limit)

The old skill’s “Phase 0–3 complete” labels **overstated** completion vs this plan. Use the tables above for honest status.

---

## Key endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /metrics` | Prometheus scrape |
| `GET /api/v1/performance/baseline` | JSON snapshot (queues, counters, avg phase times) |
| `GET /api/v1/performance/baseline?since=<marker_id>` | Delta since checkpoint |
| `POST /api/v1/performance/baseline/mark` | Checkpoint before a run |
| `POST /api/v1/performance/baseline/reset` | Clear cumulative Redis metrics |
| `POST /api/v1/performance/partitions/ensure` | Create upcoming monthly partitions |
| `POST /api/v1/performance/partitions/retention?dry_run=` | Drop expired partitions (admin) |
| `POST /api/v1/migration-jobs/{id}/pause` | Pause discovery/enqueue (in-flight studies finish) |
| `POST /api/v1/migration-jobs/{id}/resume` | Resume paused job |
| `GET /api/v1/migration-jobs/{id}/progress` | Discovered / enqueued / in-flight / done counts |
| `GET /api/v1/migration-jobs/{id}/throughput` | Studies/min, MB/s, minute samples |
| `POST /api/v1/migration-jobs/{id}/studies/retry-failed?limit=` | Bulk retry with concurrency cap |

---

## Deploy / ops

```bash
docker compose exec backend alembic upgrade head
docker compose up -d --build backend celery-routing celery-migration partition-maintenance
docker compose exec backend python scripts/reset_performance_metrics.py --yes
```

After `.env` changes: `docker compose up -d --force-recreate celery-migration`

**Run hygiene:** one migration job at a time; verify `fetch_and_enqueue_studies` count = 1; recreate workers after concurrency changes.

**Celery + HTTP pool:** `get_dicomweb_client` is per event loop; `run_async_task` closes pooled clients after each task.

---

## Metrics that matter

### Counters

- `synapse_migration_studies_total{status="success|failed"}`
- `synapse_celery_tasks_total{queue,task,status}`
- `synapse_celery_queue_depth{queue="routing_queue|migration_queue"}`
- `synapse_migration_backpressure_waits_total`

### Histograms (avg = sum / count)

| Metric | Labels | Meaning |
|--------|--------|---------|
| `synapse_celery_task_duration_seconds` | `task=migrate_study` | End-to-end per study |
| `synapse_pipeline_phase_duration_seconds` | `phase=wado\|stow\|morph\|db_finalize` | Migration phase breakdown |
| `synapse_dicomweb_request_duration_seconds` | `operation=wado_rs\|stow_rs` | DICOMweb HTTP latency |

**Throughput:** studies/min ≈ `(CELERY_MIGRATION_CONCURRENCY × 60) / avg_migrate_study_seconds`

---

## Bottleneck decision tree

```
Failures/retries high?       → Fix stability; check node echo / PACS health
Two jobs in progress?        → Invalid benchmark; run one job only
Queue depth stays high?      → Raise concurrency OR implement Phase 2.1 coordinator
WADO dominates?              → Tune WADO_PARALLEL_INSTANCES (done in repo)
STOW dominates?              → Tune STOW_* or Phase 4.5 destination rate limits (now implemented)
Discovery slow / OOM?        → Phase 2.1 coordinator (not built)
Dashboard slow at scale?     → Phase 1 rollups; Phase 3 partitions + archival
Need multi-node throughput?  → Phase 4 replicas + 4.3 storage
```

---

## Reference baselines (Govind)

### Instrumentation — pre-parallel-WADO (158 studies, conc 4)

| Phase | Avg s | Share |
|-------|-------|-------|
| WADO | 6.1 | ~87% |
| STOW | 0.87 | ~12% |
| migrate_study | 7.0 | E2E |

### Phase 2 slice — parallel WADO (158 studies, conc 8, single STOW)

Config: `CELERY_MIGRATION_CONCURRENCY=8`, `WADO_PARALLEL_INSTANCES=8`, metrics reset, single job.

| Metric | Avg s |
|--------|-------|
| WADO | 3.42 |
| STOW | 1.34 |
| migrate_study | **4.84** |

Throughput: **~99 studies/min**. Historical reference; re-validate on current code.

### Phase 3 sign-off — same codebase (79 studies, conc 8, clean runs)

**Run A — batch STOW** (`STOW_BATCH_SIZE=4`, `STOW_PARALLEL_BATCHES=2`): migrate_study **8.76 s**, ~55 studies/min, `stow_rs` 2,332 calls.

**Run B — single STOW** (`STOW_BATCH_SIZE=0`, `STOW_PARALLEL_BATCHES=1`): migrate_study **16.09 s**, ~30 studies/min, `stow_rs` 79 calls.

**Recommendation:** batch STOW on current stack; single STOW not faster for 79-study job when cloud PACS is warm.

### Phase 2 re-validation — single STOW (79 studies, conc 8, warm cloud PACS)

Config: `STOW_BATCH_SIZE=0`, `STOW_PARALLEL_BATCHES=1`, metrics reset, single job.

| Metric | Avg s |
|--------|-------|
| STOW | ~4.1 / call |
| migrate_study | **16.34** |

Confirms Phase 3 Run B; STOW dominates when not batched.

### Post-2.1 coordinator — batch STOW (79 studies, conc 8, clean run)

Config: `MIGRATION_STREAMING_DISCOVERY=true`, batch STOW, metrics reset, single job.

| Metric | Avg s | Share |
|--------|-------|-------|
| discovery_page | 0.06 | negligible |
| WADO | 12.24 | ~76% |
| STOW | 3.69 | ~23% |
| migrate_study | **16.05** | E2E |

Hygiene: `fetch_and_enqueue_studies`=1, `synapse_migration_discovery_pages_total`=1, 79/79 success.

**Interpretation:** Coordinator adds no measurable overhead at 79 studies. E2E slower than Phase 3 Run A (8.76 s) due to **warm/heavy WADO on source PACS** (12.24 s vs ~4 s), not 2.1. Same variance band as Run B (16.09 s single STOW).

---

## Phase 2.1 — Implementation plan (streaming migration coordinator)

**Problem today:** `fetch_and_enqueue_studies` loads **all** QIDO pages into memory (`engine._paginate_qido_search`), inserts all `MigrationStudyRecord` rows, then enqueues **every** `migrate_study` task before returning. For 10k studies this means long discovery, high memory, and a Redis queue spike — backpressure only helps after enqueue starts.

**Goal:** Discovery streams page-by-page; workers start within seconds; memory and queue depth stay bounded.

### Architecture

```
POST /migration-jobs/{id}/start
  → fetch_and_enqueue_studies (coordinator tick #1)
       → QIDO page at discovery_offset
       → upsert MigrationStudyRecord for page
       → enqueue migrate_study for page (respect backpressure)
       → if more pages: self.delay() coordinator tick #2
       → if done: set discovery_complete=true, job stays in_progress until studies finish
```

Coordinator task replaces monolithic discover+enqueue; `migrate_study` unchanged.

### Data model (Alembic `007`)

Add to `migration_jobs`:

| Column | Type | Purpose |
|--------|------|---------|
| `discovery_offset` | `Integer`, default 0 | QIDO offset for next page |
| `discovery_complete` | `Boolean`, default false | All QIDO pages fetched |
| `discovered_studies` | `Integer`, default 0 | Running count (may exceed `total_studies` until dedupe) |

Optional in `job_config`: `coordinator_page_size` (default `qido_limit`, typically 100).

Job status flow: `not_started` → **`discovering`** (new) → `in_progress` → terminal. Resume: if `discovery_complete` and pending records exist, skip QIDO and enqueue pending only (current resume path).

### Engine changes (`backend/app/migration/engine.py`)

1. **`discover_studies_page(job_id, offset, limit) -> tuple[list[QidoStudy], bool]`**  
   Single QIDO call (reuse `search_studies` + modality key resolution once per job, cache modality key in `job_config` after first page). Returns `(studies, has_more)` where `has_more = len(page) == limit`.

2. **`enqueue_study_records`** — keep; optionally batch-only mode that does not set `total_studies` from full count until `discovery_complete`.

3. **Deprecate full-list path** — `_paginate_qido_search` used only by tests or batch UID jobs (explicit UID list unchanged).

### Task changes (`backend/tasks/migration_tasks.py`)

Replace `_fetch_and_enqueue` body:

```python
# Pseudocode
async def _coordinator_tick(job_id):
    # 1. Resume branch: existing records + discovery_complete → enqueue pending/failed, return
    # 2. Cancelled job → return
    # 3. job.status = "discovering" on first tick
    page, has_more = await engine.discover_studies_page(job_id, job.discovery_offset, limit)
    created = await engine.enqueue_study_records(job_id, page)
    for study in page:
        wait_for_migration_queue_slot()
        migrate_study.delay(...)
    job.discovery_offset += len(page)
    job.discovered_studies += len(page)
    if has_more:
        fetch_and_enqueue_studies.delay(job_id)  # chain next page
    else:
        job.discovery_complete = True
        job.status = "in_progress"
        job.total_studies = count(records)  # final
```

**Idempotency:** Celery task name stays `fetch_and_enqueue_studies` (no queue migration). At-most-one coordinator chain per job: store `coordinator_task_id` or guard with Redis lock `migration:coordinator:{job_id}`.

**In-flight cap (optional v2):** Instead of enqueue-all per page, track Redis `migration:inflight:{job_id}` and only enqueue when `inflight < CELERY_MIGRATION_CONCURRENCY * 2`; coordinator re-schedules itself every N seconds until discovery done and queue drained. v1 can rely on existing `MIGRATION_QUEUE_BACKPRESSURE_MAX`.

### API / UI (`migration_jobs.py`, `MigrationJobs.tsx`)

- Expose `discovery_offset`, `discovery_complete`, `discovered_studies` in `MigrationJobResponse`.
- Map status **`discovering`** in UI progress (already has “Discovering…” placeholder — wire to real status).
- Start: optional **2.8 pre-flight echo** — `POST echo` source + destination before first coordinator tick; fail fast with `422` if unreachable.

### Config (`.env.example`)

```
MIGRATION_COORDINATOR_PAGE_SIZE=100   # optional; default qido_limit
MIGRATION_COORDINATOR_CHAIN_DELAY=0 # seconds between page ticks (0 = immediate)
```

### Metrics

- `synapse_migration_discovery_pages_total{job_id}` — counter per page (low cardinality if label omitted: global counter only).
- Histogram `synapse_migration_discovery_page_duration_seconds`.
- Log: `coordinator_page_complete` with offset, page_size, enqueued, queue_depth.

### Tests (`backend/tests/`)

1. Unit: `discover_studies_page` with mocked QIDO — two pages, offset advances.
2. Task: coordinator chains self when `has_more`; sets `discovery_complete` on last page.
3. Resume: existing records skip QIDO.
4. Cancel mid-discovery: next tick no-ops.
5. Batch job with explicit `study_uids`: single tick, no pagination.

### Rollout

1. Alembic + model fields  
2. Engine page API  
3. Coordinator task + feature flag `MIGRATION_STREAMING_DISCOVERY=true` (default false until tested)  
4. API schema + UI status  
5. Enable flag in `.env`, recreate `celery-migration`, run 79-study baseline (expect same throughput; `fetch_and_enqueue_studies` count = **pages**, not 1)  
6. Load test 500+ studies — verify flat memory, queue depth ≤ backpressure max

### Exit criteria (Phase 2.1)

- 10k-study job: first `migrate_study` within **≤30 s** of Start  
- Coordinator memory flat (no 10k-length list in worker)  
- `synapse_celery_queue_depth{migration_queue}` stays ≤ `MIGRATION_QUEUE_BACKPRESSURE_MAX` during discovery  
- Clean resume after worker restart mid-discovery

---

## When user shares /metrics or baseline JSON

1. Parse `avg_seconds` from baseline JSON or sum/count from Prometheus.
2. Compare wado vs stow vs db_finalize percentages.
3. Check `fetch_and_enqueue_studies` count (must be 1 for clean run).
4. Note study count, concurrency, STOW mode vs baselines above.
5. Map gaps to **Phase 2.1 / 4.5 / 5** from roadmap tables — not ad-hoc “Phase 4” without referencing this plan.

---

## Config knobs (`.env.example`)

```
CELERY_MIGRATION_CONCURRENCY=8
CELERY_ROUTING_CONCURRENCY=4
WADO_PARALLEL_INSTANCES=8
MIGRATION_QUEUE_BACKPRESSURE_MAX=200
ROUTING_QUEUE_BACKPRESSURE_MAX=200
ROUTING_BACKPRESSURE_DIMSE_REFUSE=true
MIGRATION_STREAMING_DISCOVERY=false
MIGRATION_COORDINATOR_PAGE_SIZE=100
MIGRATION_COORDINATOR_CHAIN_DELAY_SECONDS=0
MIGRATION_PREFLIGHT_ECHO=true
MIGRATION_SINGLE_ACTIVE_JOB=true
DICOMWEB_HTTP_MAX_CONNECTIONS=20
DICOMWEB_HTTP_MAX_KEEPALIVE=10
STOW_BATCH_SIZE=4
STOW_PARALLEL_BATCHES=2
STOW_RATE_LIMIT_ENABLED=false
STOW_DESTINATION_RATE_PER_SECOND=8
STOW_DESTINATION_RATE_BURST=16
STOW_RATE_LIMIT_POLL_SECONDS=0.05
PARTITION_MONTHS_AHEAD=3
PARTITION_MAINTENANCE_INTERVAL_SECONDS=86400
OTEL_ENABLED=false
DASHBOARD_METRICS_CACHE_TTL_SECONDS=30
```

Recommended bulk migration on current stack: batch STOW defaults above unless profiling shows otherwise.
