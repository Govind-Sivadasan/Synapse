# Synapse Run Script

The project includes wrapper scripts around Docker Compose for common start/stop workflows. They auto-create `.env` from `.env.example` when missing and print service URLs after a detached start.

## Entry points

| Platform | Command |
|----------|---------|
| Windows (batch) | `run.bat` from the project root |
| Windows (PowerShell) | `.\scripts\run.ps1` |
| Git Bash / WSL / macOS / Linux | `./scripts/run.sh` |

All three accept the same commands and options (PowerShell uses `-Flag` syntax; bash uses `--flag`).

## Prerequisites

- Docker Desktop 4.x+ with Compose v2
- Docker daemon running
- Ports free: 3000, 8000, 8080, 8042, 8043, 11112, 11434 (and 5173 for `dev` mode)

## Quick start

```powershell
# First run: build images and start in the background
.\scripts\run.ps1 up -Detach -Build
```

```bash
./scripts/run.sh up --detach --build
```

Open http://localhost:3000 and sign in with `admin` / `admin123`.

## Commands

| Command | Description |
|---------|-------------|
| `up` | Start services. Default command. Foreground unless `-Detach` / `--detach`. |
| `down` | Stop and remove containers. |
| `restart` | `down` then `up`, preserving flags. |
| `logs` | Show container logs. Use with `-Follow` / `--follow` to tail. |
| `ps` | `docker compose ps` — container status. |
| `health` | `GET http://localhost:8000/api/v1/health` |
| `build` | Build images without starting containers. |
| `dev` | Start backend stack in Docker; run Vite locally on port 5173. |
| `env` | Copy `.env.example` → `.env` if `.env` does not exist. |
| `help` | Print usage. |

## Options

| PowerShell | Bash | Effect |
|------------|------|--------|
| `-Build` | `--build` / `-b` | Rebuild images before `up` or `dev`. |
| `-Detach` | `--detach` / `-d` | Run containers in the background. |
| `-Infra` | `--infra` | Start infrastructure only (see service groups below). |
| `-NoOllama` | `--no-ollama` | Skip Ollama (faster startup; chatbot unavailable). |
| `-Volumes` | `--volumes` / `-v` | With `down`: remove named volumes (wipes DB, Orthanc, Ollama cache). |
| `-Follow` | `--follow` / `-f` | With `logs`: follow output. |
| `-Service NAME` | `--service NAME` | Limit to specific compose services (repeatable). |

## Service groups

The script maps friendly flags to `docker-compose.yml` service names:

| Group | Services |
|-------|----------|
| **Infrastructure** (`-Infra`) | `postgres`, `redis`, `keycloak`, `orthanc-onprem`, `orthanc-cloud`, `ollama` |
| **Application** | `backend`, `celery-routing`, `celery-migration`, `frontend` |
| **Full stack** (default) | All of the above |

With `-NoOllama`, the full stack runs without the `ollama` service.

## Run modes

### Full stack (production-like)

```powershell
.\scripts\run.ps1 up -Detach -Build
```

Everything runs in Docker, including the frontend on port 3000.

### Development (`dev`)

```powershell
.\scripts\run.ps1 dev
```

1. Starts postgres, redis, keycloak, orthanc, ollama, backend, and Celery workers in Docker (detached).
2. Skips the frontend container.
3. Runs `npm install` in `frontend/` if `node_modules` is missing.
4. Starts `npm run dev` (Vite) in the foreground at http://localhost:5173.

Use this when iterating on React UI with hot reload while keeping the backend in Docker.

### Infrastructure only

```powershell
.\scripts\run.ps1 up -Infra -Detach
```

Useful if you plan to run backend/frontend locally against Dockerized dependencies. Note: Postgres and Redis are not exposed on host ports by default — prefer `dev` mode or the full stack unless you add port mappings.

### Lightweight (no Ollama)

```powershell
.\scripts\run.ps1 up -NoOllama -Detach
```

Same as full stack but skips LLM pull/startup. Chatbot features will be unavailable.

### Subset of services

```powershell
.\scripts\run.ps1 -Service backend -Service celery-routing up -Detach
```

Passes explicit service names to `docker compose up`.

## Examples

```powershell
# Start detached (no rebuild)
.\scripts\run.ps1 up -Detach

# Rebuild and start
.\scripts\run.ps1 up -Detach -Build

# Tail backend logs
.\scripts\run.ps1 logs -Service backend -Follow

# Check health after startup
.\scripts\run.ps1 health

# Stop everything
.\scripts\run.ps1 down

# Full reset (deletes database, Orthanc studies, Ollama model cache)
.\scripts\run.ps1 down -Volumes

# Restart with rebuild
.\scripts\run.ps1 restart -Detach -Build
```

```bash
./scripts/run.sh dev
./scripts/run.sh logs --service backend --follow
./scripts/run.sh down --volumes
```

## Service URLs

After a detached `up` or at the start of `dev`, the script prints:

| Service | URL |
|---------|-----|
| Frontend (full stack) | http://localhost:3000 |
| Frontend (`dev` mode) | http://localhost:5173 |
| API / Swagger | http://localhost:8000/docs |
| Keycloak | http://localhost:8080 |
| Orthanc On-Prem | http://localhost:8042 |
| Orthanc Cloud | http://localhost:8043 |
| Ollama | http://localhost:11434 |
| DIMSE listener | localhost:11112 |

Default UI login: `admin` / `admin123`

## What the script does automatically

1. **Docker check** — Verifies `docker` is on PATH and the daemon is running.
2. **`.env` bootstrap** — On `up`, `dev`, or `build`, copies `.env.example` to `.env` if missing.
3. **Working directory** — Always runs from the project root regardless of where you invoke the script.
4. **Compose invocation** — Builds the correct `docker compose` argument list for the chosen command and flags.

## Equivalence with raw Compose

| Script | Raw Compose |
|--------|-------------|
| `.\scripts\run.ps1 up -Detach -Build` | `docker compose up --build -d` |
| `.\scripts\run.ps1 down -Volumes` | `docker compose down -v` |
| `.\scripts\run.ps1 logs -Service backend -Follow` | `docker compose logs -f backend` |
| `.\scripts\run.ps1 up -Infra -Detach` | `docker compose up -d postgres redis keycloak orthanc-onprem orthanc-cloud ollama` |

## Troubleshooting

| Issue | Action |
|-------|--------|
| `Docker daemon is not running` | Start Docker Desktop. |
| Script execution blocked (Windows) | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` or use `run.bat`. |
| `dev` fails on `npm` | Install Node.js 18+ or use full stack (`up -Detach`) instead. |
| Port already in use | Stop conflicting services or change compose port mappings. |
| Stale data after schema changes | `.\scripts\run.ps1 down -Volumes` then `up -Detach -Build` (destructive). |

## Related docs

- [SETUP.md](SETUP.md) — Full installation and service reference
- [TEST_PLAN.md](TEST_PLAN.md) — End-to-end verification checklist
