#!/usr/bin/env bash
# RAM 容量に応じて Ollama モデルを選ぶ（未設定時のみ）
# 12 GiB 未満 → qwen2.5:3b-instruct、以上 → qwen2.5:7b-instruct

TPC_OLLAMA_MODEL_7B="${TPC_OLLAMA_MODEL_7B:-qwen2.5:7b-instruct}"
TPC_OLLAMA_MODEL_3B="${TPC_OLLAMA_MODEL_3B:-qwen2.5:3b-instruct}"
# 7B 推論 + Docker + OS 用（8GB マシンは 3B へフォールバック）
TPC_OLLAMA_RAM_THRESHOLD_GIB="${TPC_OLLAMA_RAM_THRESHOLD_GIB:-12}"
# Docker Compose 経路ではホスト RAM よりコンテナ上限を優先
TPC_OLLAMA_DOCKER_RAM_GIB="${TPC_OLLAMA_DOCKER_RAM_GIB:-8}"

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

resolve_ollama_model_from_bytes() {
  local bytes threshold_bytes
  bytes="$1"
  threshold_bytes=$((TPC_OLLAMA_RAM_THRESHOLD_GIB * 1024 * 1024 * 1024))
  if [[ "${bytes}" -ge "${threshold_bytes}" ]]; then
    echo "${TPC_OLLAMA_MODEL_7B}"
  else
    echo "${TPC_OLLAMA_MODEL_3B}"
  fi
}

resolve_ollama_model_from_ram() {
  resolve_ollama_model_from_bytes "$(get_system_ram_bytes)"
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

resolve_and_export_ollama_model_for_docker() {
  if [[ -n "${TPC_OLLAMA_MODEL:-}" ]]; then
    return 0
  fi
  local host_bytes docker_cap_bytes effective_bytes host_gib effective_gib
  host_bytes="$(get_system_ram_bytes)"
  docker_cap_bytes=$((TPC_OLLAMA_DOCKER_RAM_GIB * 1024 * 1024 * 1024))
  if [[ "${host_bytes}" -lt "${docker_cap_bytes}" ]]; then
    effective_bytes="${host_bytes}"
  else
    effective_bytes="${docker_cap_bytes}"
  fi
  host_gib=$((host_bytes / 1024 / 1024 / 1024))
  effective_gib=$((effective_bytes / 1024 / 1024 / 1024))
  export TPC_OLLAMA_MODEL="$(resolve_ollama_model_from_bytes "${effective_bytes}")"
  if [[ "${TPC_OLLAMA_MODEL}" == "${TPC_OLLAMA_MODEL_3B}" ]]; then
    echo "RAM 実効 ${effective_gib} GiB (host ${host_gib} GiB, Docker cap ${TPC_OLLAMA_DOCKER_RAM_GIB} GiB): Ollama モデルを ${TPC_OLLAMA_MODEL} に自動選択" >&2
  else
    echo "RAM 実効 ${effective_gib} GiB (host ${host_gib} GiB, Docker cap ${TPC_OLLAMA_DOCKER_RAM_GIB} GiB): Ollama モデルを ${TPC_OLLAMA_MODEL} に自動選択" >&2
  fi
}
