#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/docker-up-open.sh
source "${SCRIPT_DIR}/lib/docker-up-open.sh"

wait_pid=""

cleanup() {
  stop_claude_host_agent
  if [[ -n "${wait_pid}" ]] && kill -0 "${wait_pid}" 2>/dev/null; then
    kill "${wait_pid}" 2>/dev/null || true
    wait "${wait_pid}" 2>/dev/null || true
  fi
}

main() {
  load_env_file ".env"
  prepare_docker_runtime
  start_claude_host_agent

  wait_for_health &
  wait_pid=$!

  docker compose up --build "$@"
}

trap cleanup EXIT INT TERM

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
