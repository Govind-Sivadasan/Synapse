# Synapse Run Script

The project includes wrapper scripts around Docker Compose for common start/stop workflows. They auto-create `.env` from `.env.example` when missing and print service URLs after a detached start.

## Entry points

| Platform | Command |
|----------|---------|
| **Windows CMD** | `run.bat` from the project root (see below) |
| Windows PowerShell | `.\scripts\run.ps1` |
| Git Bash / WSL / macOS / Linux | `./scripts/run.sh` |

> **Using Command Prompt (cmd.exe)?** Do **not** run `.\scripts\run.ps1` directly — CMD cannot execute PowerShell scripts. Use **`run.bat`** instead. It forwards to the same script with identical flags.

All entry points accept the same commands. Flag syntax: **CMD / PowerShell** use `-Detach`, `-Build`, etc. **Bash** uses `--detach`, `--build`.

## Prerequisites

- Docker Desktop 4.x+ with Compose v2
- Docker daemon running
- Ports free: 3000, 8000, 8080, 8042, 8043, 11112, 11434 (and 5173 for `dev` mode)

## Quick start

```bat
REM Windows CMD — from project root (d:\PROJECTS\Synapse)
cd /d d:\PROJECTS\Synapse
run.bat up -Detach -Build
```

```powershell
# Windows PowerShell — from project root
.\scripts\run.ps1 up -Detach -Build
# Or: .\run.bat up -Detach -Build
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
| `restart` | Full stack: `down` then `up`, preserving flags. With service names: restart only those containers (see below). |
| `logs` | Show container logs. Use with `-Follow` / `--follow` to tail. |
| `ps` | `docker compose ps` — container status. |
| `health` | `GET http://localhost:8000/api/v1/health` |
| `build` | Build images without starting containers. |
| `dev` | Start backend stack in Docker; run Vite locally on port 5173. |
| `env` | Copy `.env.example` → `.env` if `.env` does not exist. |
| `help` | Print usage. |

## Options

| CMD / PowerShell | Bash | Effect |
|------------------|------|--------|
| `-Build` | `--build` / `-b` | Rebuild images before `up` or `dev`. |
| `-Detach` | `--detach` / `-d` | Run containers in the background. |
| `-Infra` | `--infra` | Start infrastructure only (see service groups below). |
| `-NoOllama` | `--no-ollama` | Skip Ollama (faster startup; chatbot unavailable). |
| `-Volumes` | `--volumes` / `-v` | With `down`: remove **all** volumes (including Ollama model cache). |
| `-KeepOllama` | `--keep-ollama` | With `down`: wipe DB, Orthanc, and temp data but **keep** `ollama_data`. |
| `-Follow` | `--follow` / `-f` | With `logs`: follow output. |
| `-Service NAME` | `--service NAME` | Limit to specific compose services (repeatable). |
| `NAME …` (after command) | — | **PowerShell / CMD only:** shorthand for `-Service` on `restart`, e.g. `restart frontend -Build`. |

### Restarting specific services

When you pass one or more service names, the script restarts **only those containers** instead of tearing down the full stack:

| Goal | CMD / PowerShell |
|------|------------------|
| Rebuild and recreate frontend | `run.bat restart frontend -Build` |
| Restart Keycloak (theme changes) | `run.bat restart keycloak` |
| Named flag form | `run.bat restart -Service frontend -Build` |
| Full stack down + up | `run.bat restart -Detach -Build` (no service names) |

With `-Build`, targeted restart runs `docker compose up -d --build --force-recreate <services>`. Without `-Build`, it runs `docker compose restart <services>`.

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

```bat
run.bat up -Detach -Build
```

```powershell
.\scripts\run.ps1 up -Detach -Build
```

Everything runs in Docker, including the frontend on port 3000.

### Development (`dev`) — fast UI hot reload

```powershell
.\scripts\run.ps1 dev
```

```bat
run.bat dev
```

1. Starts postgres, redis, keycloak, orthanc, ollama, backend, and Celery workers in Docker (detached).
2. Skips the frontend container (no image rebuild per UI edit).
3. Runs `npm install` in `frontend/` if `node_modules` is missing.
4. Starts **Vite** (`npm run dev`) in the foreground at **http://localhost:5173**.

#### How hot reload works

| Mode | URL | UI change speed |
|------|-----|-----------------|
| **Dev** (Vite) | http://localhost:5173 | **Instant** — save a `.tsx` / `.css` file and the browser updates in ~1s |
| **Full stack** (Docker) | http://localhost:3000 | **Slow** — requires `run.bat restart frontend -Build` |

Vite watches `frontend/src/`. On save it sends changed modules to the browser via **HMR (Hot Module Replacement)**. React **Fast Refresh** keeps component state when possible (e.g. toggles, form input) instead of reloading the whole page.

The dev server **proxies** `/api` and `/ws` to `http://localhost:8000`, so the UI talks to the same Docker backend without CORS issues.

**Use http://localhost:5173 while `dev` is running** — not port 3000 (that is the production-like Docker frontend).

#### Frontend only (backend already running)

If Docker stack is already up:

```powershell
cd frontend
npm install   # first time only
npm run dev
```

#### Troubleshooting dev reload

| Issue | Fix |
|-------|-----|
| Edits not detected | Set `VITE_USE_POLLING=true` before `npm run dev` |
| Wrong port | Open **5173**, not 3000 |
| API errors | Ensure backend is up: `run.bat health` |
| Login redirect fails | Keycloak allows `http://localhost:5173` in `keycloak/realm-export.json` |

Use dev mode when iterating on React UI. Use full stack (`up -Detach`) for production-like smoke tests.

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

```bat
REM CMD
run.bat help
run.bat up -Detach -Build
run.bat logs -Service backend -Follow
run.bat down -Volumes
run.bat down -KeepOllama
run.bat restart frontend -Build
run.bat restart keycloak
```

```powershell
# PowerShell
.\scripts\run.ps1 up -Detach
.\scripts\run.ps1 up -Detach -Build
.\scripts\run.ps1 logs -Service backend -Follow
.\scripts\run.ps1 health
.\scripts\run.ps1 down
.\scripts\run.ps1 down -Volumes
.\scripts\run.ps1 restart frontend -Build
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
| `.\scripts\run.ps1 down -KeepOllama` | `docker compose down` + remove all volumes except `ollama_data` |
| `.\scripts\run.ps1 logs -Service backend -Follow` | `docker compose logs -f backend` |
| `.\scripts\run.ps1 restart frontend -Build` | `docker compose up -d --build --force-recreate frontend` |
| `.\scripts\run.ps1 restart keycloak` | `docker compose restart keycloak` |
| `.\scripts\run.ps1 up -Infra -Detach` | `docker compose up -d postgres redis keycloak orthanc-onprem orthanc-cloud ollama` |

## Troubleshooting

| Issue | Action |
|-------|--------|
| **CMD: `run.ps1` is not recognized / opens in editor** | Use `run.bat` instead of `scripts\run.ps1`. CMD does not run `.ps1` files. |
| **CMD: must be in project root** | `cd /d d:\PROJECTS\Synapse` then `run.bat ...` |
| `Docker daemon is not running` | Start Docker Desktop. |
| Script execution blocked (PowerShell only) | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` or use `run.bat`. |
| `dev` fails on `npm` | Install Node.js 18+ or use full stack (`run.bat up -Detach`) instead. |
| Port already in use | Stop conflicting services or change compose port mappings. |
| Stale data after schema changes | `run.bat down -KeepOllama` (keeps model) or `run.bat down -Volumes` (full wipe). |
| UI changes not visible (Docker frontend) | Use `run.bat dev` and open http://localhost:5173, or `run.bat restart frontend -Build` |
| Keycloak login theme not updated | `run.bat restart keycloak` (theme is mounted from `keycloak/themes/`) |
| **`A positional parameter cannot be found that accepts argument 'frontend'`** | Use `run.bat restart frontend -Build` or `run.bat restart -Service frontend -Build` — not `restart frontend` as a bare second positional before the script was updated. |

## Related docs

- [SETUP.md](SETUP.md) — Full installation and service reference
- [TEST_PLAN.md](TEST_PLAN.md) — End-to-end verification checklist
