#!/usr/bin/env bash

HOST_PORT="${TPC_HOST_PORT:-3000}"
APP_URL="${TPC_APP_URL:-http://localhost:${HOST_PORT}}"
HEALTH_URL="${APP_URL}/api/health"
MAX_WAIT="${TPC_HEALTH_TIMEOUT:-120}"

configure_runtime() {
  local host_port="$1"
  HOST_PORT="${host_port}"
  if [[ -n "${TPC_APP_URL:-}" ]]; then
    APP_URL="${TPC_APP_URL}"
  else
    APP_URL="http://localhost:${host_port}"
  fi
  HEALTH_URL="${APP_URL}/api/health"
}

is_port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  if command -v nc >/dev/null 2>&1; then
    nc -z localhost "${port}" >/dev/null 2>&1
    return $?
  fi
  return 1
}

describe_port_conflict() {
  local port="$1"
  echo "Port ${port} is in use:" >&2
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null | tail -n +2 >&2 || true
  fi
  if command -v docker >/dev/null 2>&1; then
    docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -F ":${port}->" >&2 || true
  fi
}

find_available_port() {
  local preferred="${1:-3000}"
  local max_port="${2:-3099}"
  local port

  for ((port = preferred; port <= max_port; port++)); do
    if ! is_port_in_use "${port}"; then
      if [[ "${port}" != "${preferred}" ]]; then
        echo "Port ${preferred} is in use; starting on port ${port} instead." >&2
        describe_port_conflict "${preferred}"
      fi
      echo "${port}"
      return 0
    fi
  done

  echo "ERROR: No available port between ${preferred} and ${max_port}." >&2
  describe_port_conflict "${preferred}"
  return 1
}

open_browser() {
  if command -v open >/dev/null 2>&1; then
    open "${APP_URL}"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${APP_URL}"
  else
    echo "Open ${APP_URL} in your browser"
  fi
}

wait_for_health() {
  local elapsed=0
  while [[ "${elapsed}" -lt "${MAX_WAIT}" ]]; do
    if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
      open_browser
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  echo "Warning: ${HEALTH_URL} did not become ready in ${MAX_WAIT}s." >&2
  echo "Check docker compose logs above, then open ${APP_URL} manually when the app is ready." >&2
  return 1
}

load_env_file() {
  local env_file="${1:-.env}"
  if [[ -f "${env_file}" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "${env_file}"
    set +a
  fi
}

prepare_docker_runtime() {
  local host_port
  host_port="$(find_available_port "${TPC_HOST_PORT:-3000}")"
  export TPC_HOST_PORT="${host_port}"
  configure_runtime "${host_port}"
  {
    echo ""
    echo "=========================================="
    echo " The Project Commander"
    echo " URL: ${APP_URL}"
    echo " (Keep this terminal open while using the app)"
    echo " Stop: Ctrl+C"
    echo "=========================================="
    echo ""
  } >&2
}
