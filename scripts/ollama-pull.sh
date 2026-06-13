#!/usr/bin/env bash
# Ollama サーバーへ接続し、モデルが未導入なら pull する（docker compose ollama-init 用）
set -euo pipefail

OLLAMA_HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-${TPC_OLLAMA_MODEL:-qwen2.5:7b-instruct}}"

export OLLAMA_HOST

echo "Ollama: waiting for ${OLLAMA_HOST}..." >&2
for _ in $(seq 1 60); do
  if ollama list >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! ollama list >/dev/null 2>&1; then
  echo "ERROR: Ollama did not become ready at ${OLLAMA_HOST}" >&2
  exit 1
fi

if ollama show "${OLLAMA_MODEL}" >/dev/null 2>&1; then
  echo "Ollama: model ${OLLAMA_MODEL} already present" >&2
  exit 0
fi

echo "Ollama: pulling ${OLLAMA_MODEL} (初回のみ数分かかります)..." >&2
ollama pull "${OLLAMA_MODEL}"
