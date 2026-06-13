#!/usr/bin/env bash
# RAM / VRAM 容量に応じて Ollama モデルを選ぶ（未設定時のみ）
# VRAM >= 閾値 → 7B、RAM >= 閾値 → 7B、それ以外 → 3B

_DROM_SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
[[ "${_DROM_SCRIPT_DIR}" == "${BASH_SOURCE[0]}" ]] && _DROM_SCRIPT_DIR="."
# shellcheck source=scripts/lib/detect-gpu.sh
source "${_DROM_SCRIPT_DIR}/detect-gpu.sh"

TPC_OLLAMA_MODEL_7B="${TPC_OLLAMA_MODEL_7B:-qwen2.5:7b-instruct}"
TPC_OLLAMA_MODEL_3B="${TPC_OLLAMA_MODEL_3B:-qwen2.5:3b-instruct}"
# 7B 推論 + Docker + OS 用（8GB マシンは 3B へフォールバック）
TPC_OLLAMA_RAM_THRESHOLD_GIB="${TPC_OLLAMA_RAM_THRESHOLD_GIB:-12}"
TPC_OLLAMA_GPU_VRAM_THRESHOLD_GIB="${TPC_OLLAMA_GPU_VRAM_THRESHOLD_GIB:-6}"
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
  local ram_bytes="${1:-0}"
  local vram_bytes="${2:-0}"
  local ram_threshold_bytes gpu_threshold_bytes
  ram_threshold_bytes=$((TPC_OLLAMA_RAM_THRESHOLD_GIB * 1024 * 1024 * 1024))
  gpu_threshold_bytes=$((TPC_OLLAMA_GPU_VRAM_THRESHOLD_GIB * 1024 * 1024 * 1024))

  if [[ "${vram_bytes}" -ge "${gpu_threshold_bytes}" ]]; then
    echo "${TPC_OLLAMA_MODEL_7B}"
    return
  fi
  if [[ "${ram_bytes}" -ge "${ram_threshold_bytes}" ]]; then
    echo "${TPC_OLLAMA_MODEL_7B}"
  else
    echo "${TPC_OLLAMA_MODEL_3B}"
  fi
}

resolve_ollama_model_from_ram() {
  local vram_bytes=0
  if resolve_use_gpu "${TPC_OLLAMA_USE_GPU:-auto}"; then
    vram_bytes="$(get_gpu_vram_bytes)"
  fi
  resolve_ollama_model_from_bytes "$(get_system_ram_bytes)" "${vram_bytes}"
}

resolve_and_export_ollama_model() {
  if [[ -n "${TPC_OLLAMA_MODEL:-}" ]]; then
    return 0
  fi
  local ram_bytes ram_gib vram_bytes vram_gib
  ram_bytes="$(get_system_ram_bytes)"
  ram_gib=$((ram_bytes / 1024 / 1024 / 1024))
  vram_bytes=0
  if resolve_use_gpu "${TPC_OLLAMA_USE_GPU:-auto}"; then
    vram_bytes="$(get_gpu_vram_bytes)"
  fi
  vram_gib=$((vram_bytes / 1024 / 1024 / 1024))
  export TPC_OLLAMA_MODEL="$(resolve_ollama_model_from_bytes "${ram_bytes}" "${vram_bytes}")"
  if [[ "${TPC_OLLAMA_MODEL}" == "${TPC_OLLAMA_MODEL_3B}" ]]; then
    echo "RAM ${ram_gib} GiB / VRAM ${vram_gib} GiB: Ollama モデルを ${TPC_OLLAMA_MODEL} に自動選択" >&2
  else
    echo "RAM ${ram_gib} GiB / VRAM ${vram_gib} GiB: Ollama モデルを ${TPC_OLLAMA_MODEL} に自動選択" >&2
  fi
}

resolve_and_export_ollama_model_for_docker() {
  if [[ -n "${TPC_OLLAMA_MODEL:-}" ]]; then
    return 0
  fi
  local host_bytes docker_cap_bytes effective_bytes host_gib effective_gib vram_bytes vram_gib
  host_bytes="$(get_system_ram_bytes)"
  docker_cap_bytes=$((TPC_OLLAMA_DOCKER_RAM_GIB * 1024 * 1024 * 1024))
  if [[ "${host_bytes}" -lt "${docker_cap_bytes}" ]]; then
    effective_bytes="${host_bytes}"
  else
    effective_bytes="${docker_cap_bytes}"
  fi
  host_gib=$((host_bytes / 1024 / 1024 / 1024))
  effective_gib=$((effective_bytes / 1024 / 1024 / 1024))
  vram_bytes=0
  if resolve_use_gpu "${TPC_OLLAMA_USE_GPU:-auto}"; then
    vram_bytes="$(get_gpu_vram_bytes)"
  fi
  vram_gib=$((vram_bytes / 1024 / 1024 / 1024))
  export TPC_OLLAMA_MODEL="$(resolve_ollama_model_from_bytes "${effective_bytes}" "${vram_bytes}")"
  if [[ "${TPC_OLLAMA_MODEL}" == "${TPC_OLLAMA_MODEL_3B}" ]]; then
    echo "RAM 実効 ${effective_gib} GiB (host ${host_gib} GiB, Docker cap ${TPC_OLLAMA_DOCKER_RAM_GIB} GiB) / VRAM ${vram_gib} GiB: Ollama モデルを ${TPC_OLLAMA_MODEL} に自動選択" >&2
  else
    echo "RAM 実効 ${effective_gib} GiB (host ${host_gib} GiB, Docker cap ${TPC_OLLAMA_DOCKER_RAM_GIB} GiB) / VRAM ${vram_gib} GiB: Ollama モデルを ${TPC_OLLAMA_MODEL} に自動選択" >&2
  fi
}
