# Synapse Setup Guide

## Documentation

| Guide | Purpose |
|-------|---------|
| [RUN.md](RUN.md) | **Run script** (`run.ps1` / `run.sh`) — start, stop, dev mode, logs |
| [TEST_PLAN.md](TEST_PLAN.md) | **Complete real-time test plan** (all phases, RBAC, checklist) |
| [DEMO_SCRIPT.md](DEMO_SCRIPT.md) | 20-minute hackathon demo flow |
| [DIMSE_TESTING.md](DIMSE_TESTING.md) | Phase 2 DIMSE E2E |
| [ROUTING_TESTING.md](ROUTING_TESTING.md) | Phase 3 routing / STOW-RS |
| [MIGRATION_TESTING.md](MIGRATION_TESTING.md) | Phase 4 bulk migration |
| [REPORTING.md](REPORTING.md) | Phase 5 dashboard & reports |
| [CHATBOT.md](CHATBOT.md) | Phase 6 Ollama chatbot |

## Prerequisites

- Docker Desktop 4.x+ with Docker Compose v2
- Minimum **4 CPU cores** and **8 GB RAM**
- Ports available: 3000, 8000, 8080, 8042, 8043, 11112, 11434

## Installation

### 1. Clone and configure

```bash
cd d:\PROJECTS\Synapse
cp .env.example .env
```

Review `.env` and adjust secrets for non-development deployments.

### 2. Start all services

```powershell
.\scripts\run.ps1 up -Detach -Build
```

Or use raw Compose: `docker compose up --build`.

First startup takes several minutes (image pulls, Keycloak init, Ollama model pull). See [RUN.md](RUN.md) for `dev` mode, infra-only startup, logs, health checks, and volume reset.

### 3. Ollama model (automatic)

The `ollama` service pulls `qwen2.5:7b-instruct` **only when it is not already in the `ollama_data` volume** (first run or after `docker compose down -v`). Normal `docker compose up` reuses the cached model — no manual pull needed.

To verify: `docker exec synapse-ollama ollama list`

To change the model, set `OLLAMA_MODEL` in `.env` and recreate the ollama container.

### 4. Verify health

```bash
curl http://localhost:8000/api/v1/health
```

Expected: JSON with `postgresql`, `redis`, `orthanc_onprem`, `orthanc_cloud`, `keycloak`, `ollama` components.

### 5. Access the UI

1. Open http://localhost:3000
2. Login with `admin` / `admin123`
3. Navigate to **System Health** to verify all services

## Service Reference

| Container | Purpose | Internal Host |
|-----------|---------|---------------|
| synapse-postgres | Application database | postgres:5432 |
| synapse-redis | Celery broker + pub/sub | redis:6379 |
| synapse-keycloak | Authentication (OIDC) | keycloak:8080 |
| synapse-orthanc-onprem | Source PACS simulation | orthanc-onprem:4242/8042 |
| synapse-orthanc-cloud | Destination PACS (DICOMweb only) | orthanc-cloud:8042 |
| synapse-backend | FastAPI + DIMSE listener | backend:8000/11112 |
| synapse-celery-routing | Real-time routing workers | — |
| synapse-celery-migration | Bulk migration workers | — |
| synapse-frontend | React SPA | frontend:80 |
| synapse-ollama | LLM inference for chatbot | ollama:11434 |

## DIMSE Connectivity Test

From a machine with `storescu` (DCMTK) or pynetdicom:

```bash
# C-ECHO test
echoscu localhost 11112 -aec SYNAPSE -aet STORESCU

# C-STORE test (requires a .dcm file)
storescu localhost 11112 -aec SYNAPSE -aet STORESCU test.dcm
```

## Database Migrations

Migrations run automatically on backend startup. To run manually:

```bash
docker exec synapse-backend alembic upgrade head
docker exec synapse-backend python scripts/seed_data.py
```

## Local Development (without Docker)

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Requires local PostgreSQL and Redis, or use Docker for infra only:

```bash
docker compose up postgres redis keycloak orthanc-onprem orthanc-cloud -d
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Keycloak login fails | Wait 60s for realm import; check http://localhost:8080 |
| Health shows `degraded` | Individual components may still be starting; wait and refresh |
| DIMSE port not listening | Check backend logs: `docker logs synapse-backend` |
| Celery tasks not processing | Verify workers: `docker logs synapse-celery-routing` |
| Ollama unhealthy | Model not pulled yet; run `ollama pull` command above |

## Phase 1 APIs (Admin)

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/v1/nodes` | GET, POST, PUT, DELETE | PACS node configuration |
| `/api/v1/routing-rules` | GET, POST, PUT, DELETE | Conditional routing rules |
| `/api/v1/routing-rules/{id}/preview` | POST | Test rule against sample metadata |
| `/api/v1/tag-morphing-rules` | GET, POST, PUT, DELETE | Tag morphing rules |
| `/api/v1/tag-morphing-rules/{id}/preview` | POST | Preview morphing result |
| `/api/v1/config` | GET, PUT | System settings (DIMSE, retries, promiscuous mode) |
| `/api/v1/audit-logs` | GET | Filterable audit log viewer |

## Phase 3: Routing E2E (DIMSE → DICOMweb)

See [ROUTING_TESTING.md](ROUTING_TESTING.md).

Fresh installs seed a demo rule: **Modality=CT → Orthanc Cloud** with InstitutionName morphing.

```bash
docker exec synapse-backend python scripts/test_dimse_e2e.py --host localhost --port 11112
```

Check Routing Monitor for `success` status and cloud Orthanc at http://localhost:8043.

## Phase 2: DIMSE E2E Testing

See [DIMSE_TESTING.md](DIMSE_TESTING.md) for full guide.

```bash
# Run unit tests inside backend container
docker exec synapse-backend python -m pytest tests/ -v

# Run DIMSE E2E test (requires celery-routing worker running)
docker exec synapse-backend python scripts/test_dimse_e2e.py --host localhost --port 11112
```

Verify in UI: **Routing Monitor** shows DIMSE stats and received studies.

## Validation

After setup, run the full real-time test plan: [TEST_PLAN.md](TEST_PLAN.md).

Quick smoke:

```bash
docker exec synapse-backend python -m pytest tests/ -v
docker exec synapse-backend python scripts/test_dimse_e2e.py --host localhost --port 11112 --instances 3
```

Then verify **Routing Monitor** (`success`) and cloud Orthanc at http://localhost:8043.
