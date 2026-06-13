#!/usr/bin/env bash
set -euo pipefail

APP_URL="${TPC_APP_URL:-http://localhost:3000}"
HEALTH_URL="${APP_URL}/api/health"
MAX_WAIT="${TPC_HEALTH_TIMEOUT:-120}"

wait_pid=""

cleanup() {
  if [[ -n "${wait_pid}" ]] && kill -0 "${wait_pid}" 2>/dev/null; then
    kill "${wait_pid}" 2>/dev/null || true
    wait "${wait_pid}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

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
  echo "Warning: health check timed out; opening browser anyway" >&2
  open_browser
}

if [[ -f .env ]]; then
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

wait_for_health &
wait_pid=$!

docker compose up --build "$@"
