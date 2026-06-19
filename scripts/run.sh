#!/usr/bin/env bash
# Synapse stack runner (POSIX). Mirrors scripts/run.ps1.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMMAND="up"
BUILD=0
DETACH=0
INFRA=0
VOLUMES=0
KEEP_OLLAMA=0
NO_OLLAMA=0
FOLLOW=0
SERVICES=()

INFRA_SERVICES=(postgres redis keycloak orthanc-onprem orthanc-cloud)
OLLAMA_SERVICE=ollama
APP_SERVICES=(backend celery-routing celery-migration frontend)
ALL_SERVICES=("${INFRA_SERVICES[@]}" "$OLLAMA_SERVICE" "${APP_SERVICES[@]}")

info()  { printf '\033[36m[synapse]\033[0m %s\n' "$*"; }
ok()    { printf '\033[32m[synapse]\033[0m %s\n' "$*"; }
warn()  { printf '\033[33m[synapse]\033[0m %s\n' "$*"; }
err()   { printf '\033[31m[synapse]\033[0m %s\n' "$*" >&2; }

COMPOSE_VOLUMES=(postgres_data orthanc_onprem_data orthanc_cloud_data ollama_data temp_dicom)
OLLAMA_VOLUME=ollama_data

compose_project_name() {
  if [[ -n "${COMPOSE_PROJECT_NAME:-}" ]]; then
    printf '%s' "$COMPOSE_PROJECT_NAME"
    return
  fi
  basename "$ROOT" | tr '[:upper:]' '[:lower:]'
}

compose_down() {
  if [[ $VOLUMES -eq 1 && $KEEP_OLLAMA -eq 1 ]]; then
    err "Use --volumes or --keep-ollama, not both."
    exit 1
  fi
  if [[ $VOLUMES -eq 1 ]]; then
    warn "Removing all volumes - database, Orthanc, Ollama model cache, and temp storage will be wiped."
    docker compose down -v
    return
  fi
  docker compose down
  if [[ $KEEP_OLLAMA -eq 0 ]]; then
    return
  fi
  local project
  project="$(compose_project_name)"
  warn "Removing data volumes except Ollama (ollama_data / model cache preserved)."
  local volume
  for volume in "${COMPOSE_VOLUMES[@]}"; do
    [[ "$volume" == "$OLLAMA_VOLUME" ]] && continue
    docker volume rm "${project}_${volume}" 2>/dev/null || true
  done
}

usage() {
  cat <<'EOF'
Synapse run script

Usage:
  ./scripts/run.sh [command] [options]

Commands:
  up        Start services (default). Foreground unless --detach.
  down      Stop services. Use --volumes or --keep-ollama to remove data volumes.
  restart   Restart services.
  logs      Tail service logs. Use --service and --follow.
  ps        Show container status.
  health    Call the backend health endpoint.
  build     Build images without starting containers.
  dev       Start stack without frontend container; run Vite locally.
  env       Ensure .env exists.
  help      Show this help.

Options:
  --build, -b       Rebuild images before start.
  --detach, -d      Run containers in the background.
  --infra           Start only infrastructure services.
  --no-ollama       Skip Ollama (chatbot unavailable).
  --volumes, -v       With down: remove all named volumes (including Ollama).
  --keep-ollama       With down: remove data volumes but keep ollama_data.
  --follow, -f      With logs: follow output.
  --service NAME    Limit to a compose service (repeatable).

Examples:
  ./scripts/run.sh
  ./scripts/run.sh up --detach --build
  ./scripts/run.sh up --infra --detach
  ./scripts/run.sh dev
  ./scripts/run.sh logs --service backend --follow
  ./scripts/run.sh down --volumes
  ./scripts/run.sh down --keep-ollama
EOF
}

require_docker() {
  command -v docker >/dev/null 2>&1 || { err "Docker not found."; exit 1; }
  docker info >/dev/null 2>&1 || { err "Docker daemon is not running."; exit 1; }
}

ensure_env() {
  if [[ -f .env ]]; then
    return
  fi
  if [[ ! -f .env.example ]]; then
    err ".env missing and .env.example not found."
    exit 1
  fi
  cp .env.example .env
  warn "Created .env from .env.example."
}

dotenv_value() {
  local key="$1"
  local default="${2:-1}"
  if [[ ! -f .env ]]; then
    printf '%s' "$default"
    return
  fi
  local line
  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" .env | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    printf '%s' "$default"
    return
  fi
  printf '%s' "${line#*=}" | sed 's/[[:space:]]*#.*$//' | xargs
}

worker_scale_args() {
  local -n _targets=$1
  local scale_all=0
  [[ ${#_targets[@]} -eq 0 ]] && scale_all=1
  local routing replicas migration
  routing="$(dotenv_value CELERY_ROUTING_REPLICAS 1)"
  migration="$(dotenv_value CELERY_MIGRATION_REPLICAS 1)"
  if [[ $scale_all -eq 1 ]] || printf '%s\n' "${_targets[@]}" | grep -qx celery-routing; then
    if [[ "$routing" =~ ^[0-9]+$ ]] && [[ "$routing" -gt 1 ]]; then
      printf '%s\n' --scale "celery-routing=${routing}"
    fi
  fi
  if [[ $scale_all -eq 1 ]] || printf '%s\n' "${_targets[@]}" | grep -qx celery-migration; then
    if [[ "$migration" =~ ^[0-9]+$ ]] && [[ "$migration" -gt 1 ]]; then
      printf '%s\n' --scale "celery-migration=${migration}"
    fi
  fi
}

target_services() {
  if [[ ${#SERVICES[@]} -gt 0 ]]; then
    printf '%s\n' "${SERVICES[@]}"
    return
  fi
  if [[ $INFRA -eq 1 ]]; then
    printf '%s\n' "${INFRA_SERVICES[@]}"
    [[ $NO_OLLAMA -eq 0 ]] && printf '%s\n' "$OLLAMA_SERVICE"
    return
  fi
  if [[ $NO_OLLAMA -eq 1 ]]; then
    printf '%s\n' "${INFRA_SERVICES[@]}" "${APP_SERVICES[@]}"
    return
  fi
  printf '%s\n' "${ALL_SERVICES[@]}"
}

show_urls() {
  local mode="${1:-full}"
  echo
  ok "Services started ($mode mode)."
  if [[ "$mode" == "dev" ]]; then
    echo "  Frontend (local)  http://localhost:5173  (npm run dev)"
  else
    echo "  Frontend          http://localhost:3000"
  fi
  echo "  API / Swagger     http://localhost:8000/docs"
  echo "  Keycloak          http://localhost:8080"
  echo "  Orthanc On-Prem   http://localhost:8042"
  echo "  Orthanc Cloud     http://localhost:8043"
  [[ $NO_OLLAMA -eq 0 && $INFRA -eq 0 ]] && echo "  Ollama            http://localhost:11434"
  echo "  Login             admin / admin123"
  echo
}

health_check() {
  info "GET http://localhost:8000/api/v1/health"
  curl -sf "http://localhost:8000/api/v1/health" | python3 -m json.tool 2>/dev/null \
    || curl -sf "http://localhost:8000/api/v1/health"
}

start_frontend_dev() {
  if [[ ! -f frontend/package.json ]]; then
    err "frontend/package.json not found."
    exit 1
  fi
  if [[ ! -d frontend/node_modules ]]; then
    info "Installing frontend dependencies..."
    (cd frontend && npm install)
  fi
  info "Starting Vite dev server (Ctrl+C to stop)..."
  echo ""
  echo "  Hot reload UI:  http://localhost:5173  (edit frontend/src - changes apply in ~1s)"
  echo "  Do not use       http://localhost:3000  (Docker frontend - rebuild required per change)"
  echo ""
  (cd frontend && npm run dev)
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    up|down|restart|logs|ps|health|build|dev|env|help)
      COMMAND="$1"; shift ;;
    --build|-b) BUILD=1; shift ;;
    --detach|-d) DETACH=1; shift ;;
    --infra) INFRA=1; shift ;;
    --no-ollama) NO_OLLAMA=1; shift ;;
    --volumes|-v) VOLUMES=1; shift ;;
    --keep-ollama) KEEP_OLLAMA=1; shift ;;
    --follow|-f) FOLLOW=1; shift ;;
    --service) SERVICES+=("$2"); shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown argument: $1"; usage; exit 1 ;;
  esac
done

require_docker

case "$COMMAND" in
  help) usage; exit 0 ;;
  env) ensure_env; ok ".env is ready"; exit 0 ;;
  health) health_check; exit 0 ;;
  ps) docker compose ps; exit 0 ;;
  build)
    ensure_env
    mapfile -t targets < <(target_services)
    info "Building: ${targets[*]}"
    docker compose build "${targets[@]}"
    ;;
  logs)
    args=(compose logs)
    [[ $FOLLOW -eq 1 ]] && args+=(-f)
    [[ ${#SERVICES[@]} -gt 0 ]] && args+=("${SERVICES[@]}")
    docker "${args[@]}"
    ;;
  down)
    compose_down
    ;;
  restart)
    down_args=(down)
    [[ $VOLUMES -eq 1 ]] && down_args+=(--volumes)
    [[ $KEEP_OLLAMA -eq 1 ]] && down_args+=(--keep-ollama)
    "$0" "${down_args[@]}"
    restart_args=(up)
    [[ $BUILD -eq 1 ]] && restart_args+=(--build)
    [[ $DETACH -eq 1 ]] && restart_args+=(--detach)
    [[ $INFRA -eq 1 ]] && restart_args+=(--infra)
    [[ $NO_OLLAMA -eq 1 ]] && restart_args+=(--no-ollama)
    [[ $VOLUMES -eq 1 ]] && restart_args+=(--volumes)
    [[ $KEEP_OLLAMA -eq 1 ]] && restart_args+=(--keep-ollama)
    for s in "${SERVICES[@]}"; do restart_args+=(--service "$s"); done
    "$0" "${restart_args[@]}"
    ;;
  dev)
    ensure_env
    mapfile -t targets < <(target_services | grep -v '^frontend$' || true)
    if [[ ${#targets[@]} -eq 0 ]]; then
      mapfile -t targets < <(printf '%s\n' "${INFRA_SERVICES[@]}" "${APP_SERVICES[@]}" | grep -v '^frontend$')
      [[ $NO_OLLAMA -eq 0 ]] && targets+=("$OLLAMA_SERVICE")
    fi
    args=(compose up)
    [[ $BUILD -eq 1 ]] && args+=(--build)
    args+=(-d)
    mapfile -t scale_args < <(worker_scale_args targets)
    args+=("${scale_args[@]}")
    args+=("${targets[@]}")
    info "Starting backend stack in Docker (no frontend container)..."
    docker "${args[@]}"
    show_urls dev
    start_frontend_dev
    ;;
  up)
    ensure_env
    mapfile -t targets < <(target_services)
    args=(compose up)
    [[ $BUILD -eq 1 ]] && args+=(--build)
    [[ $DETACH -eq 1 ]] && args+=(-d)
    mapfile -t scale_args < <(worker_scale_args targets)
    args+=("${scale_args[@]}")
    args+=("${targets[@]}")
    mode=full
    [[ $INFRA -eq 1 ]] && mode=infra
    [[ $NO_OLLAMA -eq 1 && $INFRA -eq 0 ]] && mode=no-ollama
    info "Starting ($mode): ${targets[*]}"
    docker "${args[@]}"
    [[ $DETACH -eq 1 ]] && show_urls "$mode"
    ;;
esac
