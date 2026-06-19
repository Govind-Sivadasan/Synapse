# Synapse — Complete Real-Time Test Plan

End-to-end validation for the DU2 Hackathon demo stack. Focus: **live DIMSE intake**, **WebSocket events**, **Celery workers**, **STOW-RS routing**, **bulk migration**, and **UI refresh without page reload**.

**Estimated duration:** 90–120 minutes (full run) · **Smoke path:** 45 minutes (Sections 2, 3, 5.1, 6.1) · **Demo rehearsal:** 20 minutes (see [DEMO_SCRIPT.md](DEMO_SCRIPT.md))

### Phase coverage

| Phase | Focus | Sections |
|-------|--------|----------|
| 0 | Platform, health, seed data | 2, 10 |
| 1 | Admin config CRUD | 11 |
| 2 | DIMSE C-ECHO / C-STORE | 5 |
| 3 | Routing, STOW-RS, morphing | 6 |
| 4 | Bulk migration | 7 |
| 5 | Dashboard, reports, audit | 8 |
| 6 | Chatbot + PHI | 9 |
| — | RBAC, security | 4 |
| — | Performance & observability (optional) | 15 |

> **Performance phases** (WADO/STOW tuning, metrics, partitions) are documented in [PERFORMANCE.md](PERFORMANCE.md) — separate from product phases above.

---

## 1. Test Environment

### 1.1 Prerequisites

| Requirement | Detail |
|-------------|--------|
| Docker Desktop | 4.x+, Compose v2, 4 CPU / 8 GB RAM min |
| Ports free | 3000, 8000, 8080, 8042, 8043, 11112, 11434, 4242 |
| OS | Windows / macOS / Linux with Docker |

### 1.2 Bootstrap

```bash
cd d:\PROJECTS\Synapse
cp .env.example .env
docker compose up --build -d
docker exec synapse-ollama ollama pull qwen2.5:7b-instruct
```

Wait until all containers are healthy:

```bash
docker compose ps
```

### 1.3 Service URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API / Swagger | http://localhost:8000/docs |
| Keycloak | http://localhost:8080 |
| Orthanc On-Prem | http://localhost:8042 |
| Orthanc Cloud | http://localhost:8043 |
| WebSocket | ws://localhost:8000/ws/events |
| DIMSE | localhost:11112 (AE: **SYNAPSE**) |

### 1.4 Test Users

| Username | Password | Roles |
|----------|----------|-------|
| admin | admin123 | admin, operator, service_user, viewer |
| operator | operator123 | operator, service_user, viewer |
| service | service123 | service_user, viewer |
| viewer | viewer123 | viewer |

### 1.5 Obtain API Token (optional CLI tests)

```bash
curl -s -X POST "http://localhost:8080/realms/synapse/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=synapse-ui" \
  -d "username=admin" \
  -d "password=admin123" \
  -d "grant_type=password" | jq -r .access_token
```

Export as `TOKEN` for curl commands below.

---

## 2. Pre-Flight Checklist (5 min)

| # | Check | Command / Action | Pass Criteria |
|---|-------|------------------|---------------|
| P1 | All containers up | `docker compose ps` | 10 services running |
| P2 | API health | `curl http://localhost:8000/api/v1/health` | `status: healthy` or `degraded` with only ollama model missing |
| P3 | DIMSE listening | Health → `dimse_listener` | `SYNAPSE@11112` |
| P4 | Celery routing | `docker logs synapse-celery-routing --tail 5` | Worker ready |
| P5 | Celery migration | `docker logs synapse-celery-migration --tail 5` | Worker ready |
| P6 | Seed data | UI → Nodes | Orthanc On-Prem + Orthanc Cloud present |
| P7 | Routing rule | UI → Routing Rules | "Route CT to Cloud PACS" active |
| P8 | Morphing rule | UI → Tag Morphing | "CT Institution Rename" active |
| P9 | Ollama model | `docker exec synapse-ollama ollama list` | `qwen2.5:7b-instruct` listed |
| P10 | UI login | http://localhost:3000 | Synapse theme, dashboard loads |

---

## 3. Automated Unit Tests (5 min)

```bash
docker build -t synapse-backend ./backend
docker run --rm synapse-backend python -m pytest tests/ -v
```

**Pass:** All tests green (22+).

```bash
cd frontend && npm run build
```

**Pass:** Build succeeds with no errors.

---

## 4. Authentication & RBAC (10 min)

### 4.1 Keycloak Login Theme

| # | Step | Pass Criteria |
|---|------|---------------|
| A1 | Logout, visit http://localhost:3000 | Redirect to Keycloak |
| A2 | Observe login page | Synapse PNG logo and favicon, dark theme |
| A3 | Login as `admin` / `admin123` | Redirect to dashboard |

### 4.2 Role-Based Navigation

Test each user; verify sidebar items match role:

| Role | Must see | Must NOT see |
|------|----------|--------------|
| **viewer** | Dashboard, Chatbot, Reports | Nodes, Settings, Migration Jobs, Audit Logs export |
| **service** | Dashboard, Routing Monitor, Audit Logs, Reports, Chatbot | Nodes, Settings, Reports CSV export |
| **operator** | + Migration Jobs, System Health | Nodes, Settings |
| **admin** | All pages | — |

### 4.3 Login Audit

| # | Step | Pass Criteria |
|---|------|---------------|
| A4 | Login as any user | Audit Logs → `USER_LOGIN` event within 30s |

---

## 5. Real-Time DIMSE Intake (15 min)

Reference: [DIMSE_TESTING.md](DIMSE_TESTING.md)

### 5.1 C-ECHO + C-STORE (Primary Path)

**Terminal 1 — open Routing Monitor in browser** (WebSocket pill = **live**).

**Terminal 2 — send study:**

```bash
docker exec synapse-backend python scripts/test_dimse_e2e.py --host localhost --port 11112 --instances 3
```

| # | Real-time observation | Pass Criteria | Timing |
|---|----------------------|---------------|--------|
| D1 | Routing Monitor → Live Events | `study_received` appears | < 5s |
| D2 | DIMSE metrics cards | Studies Assembled +1 | < 10s |
| D3 | Live Events | `routing_completed` with status | < 30s |
| D4 | Routing Transactions table | New row, status `success` | < 30s |
| D5 | Dashboard metrics | Studies Routed increments | < 15s (auto-refresh) |
| D6 | Audit Logs | `STUDY_RECEPTION`, `ROUTING_RULE_MATCH`, `TAG_MORPHING_APPLIED` | < 60s |

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/dimse/status | jq
```

**Pass:** `listening: true`, `statistics.studies_assembled` increased.

### 5.2 WebSocket Event Stream (API-level)

Use browser DevTools → Network → WS on `ws://localhost:8000/ws/events`, or:

```javascript
// Browser console on localhost:3000
const ws = new WebSocket("ws://localhost:8000/ws/events");
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

Send C-STORE again. **Pass:** JSON messages with `study_received` and `routing_completed`.

### 5.3 Promiscuous Mode / AE Rejection

| # | Step | Pass Criteria |
|---|------|---------------|
| D7 | Settings → promiscuous mode **OFF** | Saved |
| D8 | `docker exec synapse-backend python scripts/test_dimse_e2e.py --calling-ae UNKNOWN_AE` | Association rejected |
| D9 | DIMSE status → recent events | `association_rejected` |
| D10 | Enable promiscuous mode | Re-test succeeds |

### 5.4 No-Match Routing

Generate MR study (no rule):

```bash
docker exec synapse-backend python scripts/generate_test_dicom.py --output /data/temp_dicom/mr_test --modality MR --instances 1
docker exec synapse-backend python -c "
from pathlib import Path
from pynetdicom import AE
from pydicom import dcmread
files = list(Path('/data/temp_dicom/mr_test').glob('*.dcm'))
ae = AE(ae_title='STORESCU')
ds = dcmread(files[0])
ae.add_requested_context(ds.SOPClassUID)
assoc = ae.associate('localhost', 11112, ae_title='SYNAPSE')
assoc.send_c_store(ds)
assoc.release()
print('MR sent')
"
```

**Pass:** Transaction `overall_status` = `no_match`; no STOW-RS to cloud.

---

## 6. Real-Time Routing & STOW-RS (15 min)

Reference: [ROUTING_TESTING.md](ROUTING_TESTING.md)

### 6.1 End-to-End Protocol Conversion

```
Modality --C-STORE (DIMSE)--> Synapse --STOW-RS (DICOMweb)--> Cloud Orthanc
```

| # | Verification | How | Pass Criteria |
|---|--------------|-----|---------------|
| R1 | Cloud PACS received study | http://localhost:8043 → Studies | CT study visible |
| R2 | Tag morphing applied | Cloud Orthanc metadata / QIDO | `InstitutionName` = **Cloud Demo Hospital** |
| R3 | No DIMSE to destination | Cloud `orthanc.json` has no DIMSE port exposed | Only DICOMweb path used |

```bash
curl -s "http://localhost:8043/dicom-web/studies?Modality=CT" -H "Accept: application/dicom+json" | jq length
```

### 6.2 Per-Destination Retry (Failure Recovery)

| # | Step | Pass Criteria |
|---|------|---------------|
| R4 | `docker compose stop orthanc-cloud` | Cloud down |
| R5 | Send new CT study via DIMSE | Destination status `failed` in UI |
| R6 | `docker compose start orthanc-cloud` | Cloud back |
| R7 | Click **Retry** on failed destination | Status → `success` |
| R8 | Audit Logs | `RETRY_ATTEMPT` event |

API alternative:

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/routing-transactions/destinations/{DEST_ID}/retry"
```

### 6.3 Multi-Destination (Optional)

| # | Step | Pass Criteria |
|---|------|---------------|
| R9 | Add second cloud destination node (admin) | Node created |
| R10 | Edit routing rule → two destinations | Rule saved |
| R11 | Send CT study | Two destination rows, independent statuses |

---

## 7. Bulk Migration — Real-Time Progress (20 min)

Reference: [MIGRATION_TESTING.md](MIGRATION_TESTING.md)

### 7.1 Prepare Source Data

Upload studies to on-prem Orthanc (if empty):

```bash
# Generate + C-STORE to on-prem via DIMSE, OR use Orthanc UI at :8042 to upload
docker exec synapse-backend python scripts/test_dimse_e2e.py --instances 2
# Studies land in Synapse temp; for migration source use Orthanc on-prem DICOMweb
```

Ensure on-prem Orthanc has at least one CT study (upload via http://localhost:8042).

### 7.2 Create & Start Migration Job

| # | Step (UI as `operator`) | Pass Criteria |
|---|---------------------------|---------------|
| M1 | Migration Jobs → New Job | Form opens |
| M2 | Source: Orthanc On-Prem, Dest: Orthanc Cloud, filter Modality=CT | Job created `not_started` |
| M3 | Click **Start** | Status → `in_progress` |
| M4 | Open job **Details** | Study records appear (QIDO discovery) |
| M5 | Watch progress in job list and **Details** | Progress bar under in-progress rows; counters increment live (~3s refresh) |
| M6 | Celery logs | `docker logs -f synapse-celery-migration` shows `migrate_study` |
| M7 | Job completes | Status `completed` or `partial` |
| M8 | Cloud Orthanc | Migrated studies visible |

### 7.3 Cancel & Resume

| # | Step | Pass Criteria |
|---|------|---------------|
| M9 | Start new job, click **Cancel** mid-run | Status `cancelled` |
| M10 | Job with failures or `partial` status, click **Resume** (re-calls `POST /start`) | Job re-enters `in_progress`; failed/pending studies re-enqueued |

> **Note:** Pause mid-job is not implemented. Use **Cancel** to stop, or **Resume** on `failed` / `partial` jobs to restart processing.

### 7.4 Per-Study Retry

| # | Step | Pass Criteria |
|---|------|---------------|
| M11 | Force failure (stop cloud during job) | Study record `failed` |
| M12 | Restart cloud, click **Retry** on study | Status → `success` |

---

## 8. Dashboard & Reporting — Live Metrics (10 min)

Reference: [REPORTING.md](REPORTING.md)

| # | Page | Real-time test | Pass Criteria |
|---|------|----------------|---------------|
| DR1 | Dashboard | Send C-STORE while page open | Metrics + activity feed update within 10–15s |
| DR2 | Dashboard | Volume chart (7 days) | Bar for today increments |
| DR3 | Reports | Change period 7→30 days or **All time** | Summary recalculates; empty states explain missing data |
| DR3b | Reports | Login as `viewer` | Page loads; no Export Audit CSV button |
| DR4 | Audit Logs | Filter by `ROUTING_RULE_MATCH` | Matching events only |
| DR5 | Audit Logs | Export CSV | File downloads |
| DR6 | Reports | Export Audit CSV | File downloads (operator/admin) |

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/dashboard/metrics | jq
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/v1/reports/summary?days=7" | jq
```

---

## 9. Chatbot (10 min)

Reference: [CHATBOT.md](CHATBOT.md)

| # | Step | Pass Criteria |
|---|------|---------------|
| C1 | Chatbot page → status pill | "Ollama ready" (or fallback if model missing) |
| C1b | Any other page | Floating chatbot button bottom-right; drawer opens with same history |
| C1c | `/chatbot` page | Floating button hidden (full page in use) |
| C2 | Ask: "What is the migration status?" | Coherent answer using live counts |
| C3 | Ask: "How many studies failed routing today?" | References routing data |
| C4 | Ask: "Is the DIMSE listener online?" | Correct listener state |
| C5 | Include Study UID in question | Study-specific lookup in answer |
| C6 | Audit Logs | `CHATBOT_QUERY` events |
| C7 | Login as `viewer` | PHI redacted (masked UIDs); banner shown |
| C8 | Login as `service` | Full operational detail in answers |
| C9 | Stop Ollama: `docker compose stop ollama` | Fallback response + "Fallback" badge |
| C10 | Restart Ollama | LLM responses resume |
| C11 | Reload page after chat | Prior messages and timestamps restored |
| C12 | Clear chat | History removed from UI and database |

---

## 10. System Health & Workers (5 min)

| # | Check | Pass Criteria |
|---|-------|---------------|
| H1 | UI → System Health | All components healthy (ollama may warn if model not pulled) |
| H2 | Stop postgres → refresh health | `postgresql` unhealthy, overall degraded |
| H3 | Restart postgres | Recovers to healthy |
| H4 | `docker logs synapse-backend --tail 20` | No repeated tracebacks |
| H5 | `docker logs synapse-celery-routing --tail 20` | `route_study` tasks complete |
| H6 | `docker compose ps partition-maintenance` | Container running (partition cron) |

---

## 11. Admin Configuration CRUD (10 min)

| # | Area | Test | Pass Criteria |
|---|------|------|---------------|
| AD1 | Nodes | Create / edit / delete test node | Audit `CONFIG_CHANGE` |
| AD2 | Routing Rules | Create rule, preview | Preview returns match result |
| AD3 | Tag Morphing | Preview morphing | Shows before/after |
| AD4 | Settings | Change DIMSE AE title (careful) | Requires stack restart to fully apply listener |

---

## 12. Negative & Edge Cases

| # | Scenario | Expected behavior |
|---|----------|-------------------|
| N1 | API without token | 401 Unauthorized |
| N2 | Viewer calls `POST /nodes` | 403 Forbidden |
| N3 | Operator calls `GET /nodes` | 200 (read for migration UI) |
| N4 | Invalid Study UID in chatbot | "No matching records" or honest "don't know" |
| N5 | Duplicate C-STORE same Study UID | New routing transaction (idempotent at PACS level depends on Orthanc) |
| N6 | Redis down | WebSocket events stop; routing may fail — health degraded |

---

## 13. Real-Time Event Matrix

Events that should appear **without manual page refresh** (Routing Monitor open):

| Trigger | WebSocket `event_type` | UI location | API |
|---------|------------------------|-------------|-----|
| C-STORE complete | `study_received` | Live Events | `/routing-transactions` |
| STOW-RS done | `routing_completed` | Live Events + txn status | `/routing-transactions` |
| Migration study done | `migration_study_completed` | Dashboard activity (on refresh) | `/migration-jobs/{id}/studies` |
| Migration job done | `migration_job_completed` | Migration Jobs list | `/migration-jobs` |

---

## 14. Demo Rehearsal Timeline (20 min)

| Time | Activity |
|------|----------|
| 0:00 | Architecture slide: DIMSE → DICOMweb only to cloud |
| 0:02 | System Health — all green |
| 0:03 | Show Nodes, Routing Rules, Tag Morphing |
| 0:06 | Open Routing Monitor → send C-STORE → live events |
| 0:11 | Cloud Orthanc — verify study + morphed InstitutionName |
| 0:13 | Audit Logs — routing + morphing events |
| 0:15 | Migration Job — start, show progress |
| 0:18 | Chatbot — 2 questions; viewer PHI demo |
| 0:20 | RBAC — viewer vs operator nav |

---

## 15. Performance & Observability (optional, 10 min)

Reference: [PERFORMANCE.md](PERFORMANCE.md). Run after a bulk migration job (Section 7) for meaningful phase metrics.

| # | Step | Pass Criteria |
|---|------|---------------|
| P1 | `docker compose ps partition-maintenance` | Container up; logs show periodic `manage_partitions.py` |
| P2 | `curl -s http://localhost:8000/metrics \| grep synapse_migration_studies` | Prometheus counters present |
| P3 | Baseline API (operator token) | `GET /api/v1/performance/baseline` returns queues + histogram avgs |
| P4 | Reset metrics | `docker exec synapse-backend python scripts/reset_performance_metrics.py --yes` exits 0 |
| P5 | Mark + delta | `POST /performance/baseline/mark` → run one study migration → `?since=<marker_id>` shows delta only |
| P6 | Phase breakdown | After migration job, baseline shows `wado`, `stow`, `db_finalize` phase avgs |
| P7 | Partition ensure | `POST /api/v1/performance/partitions/ensure` returns success (operator/admin) |
| P8 | Trace correlation | Celery logs or migration row include `trace_id`; optional `X-Trace-Id` on API call |
| P9 | OTEL export (optional) | With `OTEL_ENABLED=true` + collector, spans appear in backend/worker traces |

```bash
# Metrics scrape
curl -s http://localhost:8000/metrics | grep -E 'synapse_pipeline_phase|synapse_celery_queue'

# Baseline snapshot
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/performance/baseline | jq

# Manual partition ensure
docker exec synapse-backend python scripts/manage_partitions.py
```

**Smoke pass:** P1, P2, P3, P6 (after at least one completed migration study).

---

## 16. Pass / Fail Summary

| Category | Minimum to pass demo |
|----------|----------------------|
| Infrastructure | 8/10 pre-flight checks |
| DIMSE + Routing | D1–D6, R1–R3 all pass |
| Real-time UI | WebSocket live + transaction success |
| Migration | M1–M8 pass |
| Security | RBAC + viewer PHI redaction |
| Chatbot | C2–C4 pass (C9 fallback acceptable) |
| Audit | All major actions logged |
| Performance (optional) | P1–P3, P6 pass after migration smoke |

---

## 17. Troubleshooting Quick Reference

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| WebSocket offline | Backend/redis down | `docker compose restart backend redis` |
| Routing stuck pending | Celery routing worker | `docker compose restart celery-routing` |
| `no_match` for CT | Seed data missing | `docker compose down -v` and re-up, or create rules manually |
| Migration 0 studies | On-prem Orthanc empty | Upload studies to :8042 |
| Chatbot fallback only | Ollama model not pulled | `docker exec synapse-ollama ollama pull qwen2.5:7b-instruct` |
| STOW-RS failed | Cloud Orthanc down | `docker compose restart orthanc-cloud` |
| Keycloak theme old | Cached realm / container | `run.bat restart keycloak`; confirm login theme is `synapse` in admin console |
| `/metrics` empty or 404 | `METRICS_ENABLED=false` | Set `METRICS_ENABLED=true` in `.env`; restart backend |
| Baseline API 403 | Wrong role | Use operator or admin token |
| Partition maintenance errors | Migration 006 not applied | `docker exec synapse-backend alembic upgrade head` |

---

## 18. Related Docs

- [SETUP.md](SETUP.md) — installation
- [DIMSE_TESTING.md](DIMSE_TESTING.md) — DIMSE scripts
- [ROUTING_TESTING.md](ROUTING_TESTING.md) — STOW-RS validation
- [MIGRATION_TESTING.md](MIGRATION_TESTING.md) — bulk migration
- [REPORTING.md](REPORTING.md) — dashboard & audit export
- [CHATBOT.md](CHATBOT.md) — Ollama chatbot
- [PERFORMANCE.md](PERFORMANCE.md) — metrics, tuning, partitions, tracing
- [DEMO_SCRIPT.md](DEMO_SCRIPT.md) — presentation flow

---

## 19. Printable Master Checklist

Copy this section for hackathon sign-off. Check each box during a live run.

### Platform

- [ ] `docker compose up -d` — all core containers running (incl. `partition-maintenance`)
- [ ] `curl http://localhost:8000/api/v1/health` — dimse, postgres, redis, orthanc ×2, keycloak healthy
- [ ] Ollama model pulled (`qwen2.5:7b-instruct`) or chatbot fallback acceptable
- [ ] Keycloak login + Synapse theme works
- [ ] Seed: Orthanc On-Prem, Orthanc Cloud, CT routing rule, morphing rule present
- [ ] `docker exec synapse-backend python -m pytest tests/ -v` — all pass

### DIMSE (Phase 2)

- [ ] C-ECHO OK (`test_dimse_e2e.py --skip-store`)
- [ ] C-STORE → `study_assembled` in Routing Monitor DIMSE events
- [ ] Routing transaction row created
- [ ] WebSocket `study_received` without manual refresh
- [ ] Promiscuous OFF rejects unknown AE; ON accepts

### Routing (Phase 3)

- [ ] CT study → cloud Orthanc via STOW-RS (not DIMSE to destination)
- [ ] Transaction status `success`
- [ ] `InstitutionName` = **Cloud Demo Hospital** in cloud PACS
- [ ] Audit: `ROUTING_RULE_MATCH`, `TAG_MORPHING_APPLIED`
- [ ] MR study → `no_match` (optional)
- [ ] Failed destination **Retry** succeeds after cloud Orthanc restart

### Migration (Phase 4)

- [ ] On-prem Orthanc has source studies
- [ ] Job create + **Start** from Migration Jobs UI
- [ ] Progress bar + counters update live in Migration Jobs list
- [ ] Studies visible in cloud Orthanc after completion
- [ ] **Cancel** mid-run works
- [ ] **Resume** on failed/partial job works
- [ ] Per-study **Retry** works

### Performance (optional)

- [ ] `curl http://localhost:8000/metrics` — `synapse_*` counters/histograms present
- [ ] `GET /api/v1/performance/baseline` — returns queue depth + phase avgs (operator token)
- [ ] After migration job — baseline shows `wado` / `stow` / `db_finalize` breakdown
- [ ] `partition-maintenance` container running; `manage_partitions.py` succeeds manually
- [ ] `reset_performance_metrics.py --yes` + baseline mark/delta (optional benchmark prep)

### Reporting (Phase 5)

- [ ] Dashboard metrics/charts reflect test activity
- [ ] Activity feed updates after routing
- [ ] Reports summary (viewer can read; operator/admin can export CSV)
- [ ] Reports **All time** period shows historical totals when 7-day window is empty
- [ ] Audit Logs: filters, chart, CSV, `USER_LOGIN`

### Chatbot (Phase 6)

- [ ] Chatbot status shows Ollama ready (or fallback badge)
- [ ] Floating chatbot widget on all pages except `/chatbot`
- [ ] Chat history persists across reload; clear chat works
- [ ] Migration / routing / DIMSE questions answered from live data
- [ ] `CHATBOT_QUERY` in audit logs
- [ ] Viewer: PHI redacted; service user: full detail
- [ ] Ollama stopped → fallback response (optional)

### Security & real-time

- [ ] RBAC: viewer / service / operator / admin nav matches matrix (Section 4.2)
- [ ] Viewer blocked from admin APIs (403)
- [ ] Logout clears session
- [ ] Routing completes while migration job runs (separate Celery queues)

### Quick smoke commands

```bash
docker compose up -d
docker exec synapse-ollama ollama pull qwen2.5:7b-instruct
docker exec synapse-backend python -m pytest tests/ -v
docker exec synapse-backend python scripts/test_dimse_e2e.py --host localhost --port 11112 --instances 3
```
