#!/usr/bin/env bash
# RAM 容量に応じて Ollama モデルを選ぶ（未設定時のみ）
# 12 GiB 未満 → qwen2.5:3b-instruct、以上 → qwen2.5:7b-instruct

TPC_OLLAMA_MODEL_7B="${TPC_OLLAMA_MODEL_7B:-qwen2.5:7b-instruct}"
TPC_OLLAMA_MODEL_3B="${TPC_OLLAMA_MODEL_3B:-qwen2.5:3b-instruct}"
# 7B 推論 + Docker + OS 用（8GB マシンは 3B へフォールバック）
TPC_OLLAMA_RAM_THRESHOLD_GIB="${TPC_OLLAMA_RAM_THRESHOLD_GIB:-12}"

get_system_ram_bytes() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    sysctl -n hw.memsize 2>/dev/null || echo 0
    return
  fi
  if [[ -r /proc/meminfo ]]; then
    awk '/^MemTotal:/ {print $2 * 1024}' /proc/meminfo
    return
  fi
  echo 0
}

resolve_ollama_model_from_ram() {
  local bytes threshold_bytes
  bytes="$(get_system_ram_bytes)"
  threshold_bytes=$((TPC_OLLAMA_RAM_THRESHOLD_GIB * 1024 * 1024 * 1024))
  if [[ "${bytes}" -ge "${threshold_bytes}" ]]; then
    echo "${TPC_OLLAMA_MODEL_7B}"
  else
    echo "${TPC_OLLAMA_MODEL_3B}"
  fi
}

resolve_and_export_ollama_model() {
  if [[ -n "${TPC_OLLAMA_MODEL:-}" ]]; then
    return 0
  fi
  local bytes gib
  bytes="$(get_system_ram_bytes)"
  gib=$((bytes / 1024 / 1024 / 1024))
  export TPC_OLLAMA_MODEL="$(resolve_ollama_model_from_ram)"
  if [[ "${TPC_OLLAMA_MODEL}" == "${TPC_OLLAMA_MODEL_3B}" ]]; then
    echo "RAM ${gib} GiB (< ${TPC_OLLAMA_RAM_THRESHOLD_GIB} GiB): Ollama モデルを ${TPC_OLLAMA_MODEL} に自動選択" >&2
  else
    echo "RAM ${gib} GiB (>= ${TPC_OLLAMA_RAM_THRESHOLD_GIB} GiB): Ollama モデルを ${TPC_OLLAMA_MODEL} に自動選択" >&2
  fi
}
