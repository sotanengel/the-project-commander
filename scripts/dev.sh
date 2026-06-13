#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=scripts/lib/docker-up-open.sh
source "${SCRIPT_DIR}/lib/docker-up-open.sh"

ollama_url() {
  local port="${TPC_OLLAMA_HOST_PORT:-11434}"
  echo "http://127.0.0.1:${port}"
}

is_ollama_ready() {
  local url="$1"
  curl -fsS "${url}/api/tags" >/dev/null 2>&1
}

ensure_local_ollama() {
  if [[ "${TPC_LOCAL_AGENT:-auto}" == "off" ]]; then
    return 0
  fi

  local url="${TPC_OLLAMA_BASE_URL:-$(ollama_url)}"
  if is_ollama_ready "${url}"; then
    export TPC_OLLAMA_BASE_URL="${url}"
    return 0
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "Warning: Ollama が ${url} で応答しません。docker がないため自動起動できません。" >&2
    echo "  ollama serve を実行するか、pnpm start を利用してください。" >&2
    return 0
  fi

  echo "Ollama を Docker Compose で起動します（初回はモデルダウンロードに数分）..." >&2
  resolve_compose_gpu_args
  (
    cd "${ROOT}"
    # shellcheck disable=SC2086
    docker compose ${COMPOSE_GPU_ARGS:-} up -d ollama
    # shellcheck disable=SC2086
    docker compose ${COMPOSE_GPU_ARGS:-} run --rm ollama-init
  )

  url="$(ollama_url)"
  if is_ollama_ready "${url}"; then
    export TPC_OLLAMA_BASE_URL="${url}"
    echo "Ollama ready at ${url}" >&2
    return 0
  fi

  echo "Warning: Ollama の起動を確認できませんでした。コメント AI 提案は利用できません。" >&2
}

main() {
  load_env_file "${ROOT}/.env"
  resolve_and_export_ollama_model
  resolve_compose_gpu_args
  ensure_local_ollama
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
    if [[ -n "${TPC_OLLAMA_BASE_URL:-}" ]]; then
      echo " LLM:  ${TPC_OLLAMA_BASE_URL} (${TPC_OLLAMA_MODEL:-auto})"
      describe_gpu_runtime
    fi
    echo " Stop: Ctrl+C"
    echo "=========================================="
    echo ""
  } >&2

  pnpm --parallel --filter @tpc/server --filter @tpc/web dev
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
