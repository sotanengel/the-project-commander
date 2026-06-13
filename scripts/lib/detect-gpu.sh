#!/usr/bin/env bash
# GPU 検出（Windows WSL2 / Linux NVIDIA）。macOS は pnpm start GPU 対応外のため none を返す。

detect_gpu_kind() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    echo "none"
    return
  fi
  if command -v nvidia-smi >/dev/null 2>&1; then
    if nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | grep -q .; then
      echo "nvidia"
      return
    fi
  fi
  if command -v rocm-smi >/dev/null 2>&1; then
    if rocm-smi --showmeminfo vram 2>/dev/null | grep -qi "vram"; then
      echo "rocm"
      return
    fi
  fi
  echo "none"
}

get_gpu_vram_bytes() {
  local kind mib
  kind="$(detect_gpu_kind)"
  if [[ "${kind}" == "nvidia" ]] && command -v nvidia-smi >/dev/null 2>&1; then
    mib="$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -n1 | tr -d '[:space:]')"
    if [[ "${mib}" =~ ^[0-9]+$ ]]; then
      echo $((mib * 1024 * 1024))
      return
    fi
  fi
  echo 0
}

has_nvidia_gpu() {
  [[ "$(detect_gpu_kind)" == "nvidia" ]]
}

resolve_use_gpu() {
  local mode="${1:-${TPC_OLLAMA_USE_GPU:-auto}}"
  mode="$(echo "${mode}" | tr '[:upper:]' '[:lower:]')"
  case "${mode}" in
    on|true|1|yes) return 0 ;;
    off|false|0|no) return 1 ;;
    *) has_nvidia_gpu ;;
  esac
}

resolve_compose_gpu_args() {
  unset COMPOSE_GPU_ARGS
  if ! resolve_use_gpu "${TPC_OLLAMA_USE_GPU:-auto}"; then
    return 0
  fi
  if has_nvidia_gpu; then
    export COMPOSE_GPU_ARGS="-f docker-compose.gpu.yml"
  fi
}

gpu_vram_gib() {
  local bytes gib
  bytes="$(get_gpu_vram_bytes)"
  gib=$((bytes / 1024 / 1024 / 1024))
  echo "${gib}"
}

describe_gpu_runtime() {
  local kind vram_gib
  kind="$(detect_gpu_kind)"
  if [[ "${kind}" == "none" ]]; then
    echo "GPU: なし（CPU 推論）"
    return
  fi
  vram_gib="$(gpu_vram_gib)"
  if resolve_use_gpu "${TPC_OLLAMA_USE_GPU:-auto}"; then
    echo "GPU: ${kind} (VRAM ${vram_gib} GiB)"
  else
    echo "GPU: ${kind} (VRAM ${vram_gib} GiB, TPC_OLLAMA_USE_GPU=off のため CPU 推論)"
  fi
}
