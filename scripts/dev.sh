#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/docker-up-open.sh
source "${SCRIPT_DIR}/lib/docker-up-open.sh"

main() {
  load_env_file ".env"
  local host_port
  host_port="$(find_available_port "${TPC_HOST_PORT:-3000}")"
  export PORT="${host_port}"
  export VITE_API_PORT="${host_port}"

  {
    echo ""
    echo "=========================================="
    echo " The Project Commander (dev)"
    echo " Web:  http://localhost:5173"
    echo " API:  http://localhost:${host_port}"
    echo " Stop: Ctrl+C"
    echo "=========================================="
    echo ""
  } >&2

  pnpm --parallel --filter @tpc/server --filter @tpc/web dev
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
