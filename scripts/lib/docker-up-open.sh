#!/usr/bin/env bash

HOST_PORT="${TPC_HOST_PORT:-3000}"
APP_URL="${TPC_APP_URL:-http://localhost:${HOST_PORT}}"
HEALTH_URL="${APP_URL}/api/health"
MAX_WAIT="${TPC_HEALTH_TIMEOUT:-120}"
CLAUDE_HOST_AGENT_PID=""

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
    if open "${APP_URL}" >/dev/null 2>&1; then
      return 0
    fi
  fi
  if command -v xdg-open >/dev/null 2>&1; then
    if xdg-open "${APP_URL}" >/dev/null 2>&1; then
      return 0
    fi
  fi
  echo "Open ${APP_URL} in your browser"
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
  export TPC_MCP_PUBLIC_URL="http://127.0.0.1:${HOST_PORT}/mcp"
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

start_claude_host_agent() {
  local agent_port="${TPC_CLAUDE_HOST_PORT:-9477}"

  if ! command -v claude >/dev/null 2>&1; then
    echo "Warning: claude CLI が見つかりません。コメント AI 提案は利用できません。" >&2
    return 0
  fi

  if curl -fsS "http://127.0.0.1:${agent_port}/health" >/dev/null 2>&1; then
    echo "Claude host agent: http://127.0.0.1:${agent_port} (already running)" >&2
    return 0
  fi

  local repo_root
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  (
    cd "${repo_root}"
    TPC_CLAUDE_HOST_PORT="${agent_port}" pnpm --filter @tpc/server claude-host-agent
  ) &
  CLAUDE_HOST_AGENT_PID=$!

  local elapsed=0
  while [[ "${elapsed}" -lt 30 ]]; do
    if curl -fsS "http://127.0.0.1:${agent_port}/health" >/dev/null 2>&1; then
      echo "Claude host agent: http://127.0.0.1:${agent_port}" >&2
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  echo "Warning: Claude host agent did not become ready on port ${agent_port}." >&2
}

stop_claude_host_agent() {
  if [[ -n "${CLAUDE_HOST_AGENT_PID}" ]] && kill -0 "${CLAUDE_HOST_AGENT_PID}" 2>/dev/null; then
    kill "${CLAUDE_HOST_AGENT_PID}" 2>/dev/null || true
    wait "${CLAUDE_HOST_AGENT_PID}" 2>/dev/null || true
    CLAUDE_HOST_AGENT_PID=""
  fi
}
