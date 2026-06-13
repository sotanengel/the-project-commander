#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB="${ROOT}/scripts/lib/detect-gpu.sh"

passed=0
failed=0

pass() {
  passed=$((passed + 1))
  echo "PASS: $1"
}

fail() {
  failed=$((failed + 1))
  echo "FAIL: $1" >&2
}

assert_eq() {
  local expected="$1"
  local actual="$2"
  local message="$3"
  if [[ "${actual}" == "${expected}" ]]; then
    pass "${message}"
  else
    fail "${message}" "expected '${expected}', got '${actual}'"
  fi
}

setup_mock_linux_nvidia() {
  local mock_bin="$1"
  mkdir -p "${mock_bin}"
  cat > "${mock_bin}/uname" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "-s" ]]; then
  echo Linux
  exit 0
fi
echo Linux
EOF
  chmod +x "${mock_bin}/uname"
  cat > "${mock_bin}/nvidia-smi" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"--query-gpu=name"* ]]; then
  echo "NVIDIA GeForce RTX 4090"
  exit 0
fi
if [[ "$*" == *"memory.total"* ]]; then
  echo "8192"
  exit 0
fi
exit 1
EOF
  chmod +x "${mock_bin}/nvidia-smi"
}

setup_mock_darwin() {
  local mock_bin="$1"
  mkdir -p "${mock_bin}"
  cat > "${mock_bin}/uname" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "-s" ]]; then
  echo Darwin
  exit 0
fi
echo Darwin
EOF
  chmod +x "${mock_bin}/uname"
}

test_darwin_returns_none() {
  local tmpdir mock_bin kind
  tmpdir="$(mktemp -d)"
  mock_bin="${tmpdir}/bin"
  setup_mock_darwin "${mock_bin}"
  kind="$(
    PATH="${mock_bin}:${PATH}" bash -c "
      set -euo pipefail
      source '${LIB}'
      detect_gpu_kind
    "
  )"
  assert_eq "none" "${kind}" "Darwin returns none"
  rm -rf "${tmpdir}"
}

test_nvidia_detected() {
  local tmpdir mock_bin kind vram
  tmpdir="$(mktemp -d)"
  mock_bin="${tmpdir}/bin"
  setup_mock_linux_nvidia "${mock_bin}"
  kind="$(
    PATH="${mock_bin}:${PATH}" bash -c "
      set -euo pipefail
      source '${LIB}'
      detect_gpu_kind
    "
  )"
  vram="$(
    PATH="${mock_bin}:${PATH}" bash -c "
      set -euo pipefail
      source '${LIB}'
      get_gpu_vram_bytes
    "
  )"
  assert_eq "nvidia" "${kind}" "nvidia-smi success returns nvidia"
  assert_eq $((8192 * 1024 * 1024)) "${vram}" "VRAM bytes from nvidia-smi"
  rm -rf "${tmpdir}"
}

test_compose_gpu_args_when_nvidia() {
  local tmpdir mock_bin args
  tmpdir="$(mktemp -d)"
  mock_bin="${tmpdir}/bin"
  setup_mock_linux_nvidia "${mock_bin}"
  args="$(
    PATH="${mock_bin}:${PATH}" bash -c "
      set -euo pipefail
      source '${LIB}'
      unset COMPOSE_GPU_ARGS || true
      TPC_OLLAMA_USE_GPU=auto
      resolve_compose_gpu_args
      printf '%s' \"\${COMPOSE_GPU_ARGS:-}\"
    "
  )"
  assert_eq "-f docker-compose.gpu.yml" "${args}" "NVIDIA sets compose GPU override"
  rm -rf "${tmpdir}"
}

test_compose_gpu_args_off() {
  local tmpdir mock_bin args
  tmpdir="$(mktemp -d)"
  mock_bin="${tmpdir}/bin"
  setup_mock_linux_nvidia "${mock_bin}"
  args="$(
    PATH="${mock_bin}:${PATH}" bash -c "
      set -euo pipefail
      source '${LIB}'
      unset COMPOSE_GPU_ARGS || true
      TPC_OLLAMA_USE_GPU=off
      resolve_compose_gpu_args
      printf '%s' \"\${COMPOSE_GPU_ARGS:-}\"
    "
  )"
  assert_eq "" "${args}" "USE_GPU=off skips compose GPU override"
  rm -rf "${tmpdir}"
}

test_darwin_returns_none
test_nvidia_detected
test_compose_gpu_args_when_nvidia
test_compose_gpu_args_off

echo ""
echo "detect-gpu tests: ${passed} passed, ${failed} failed"
[[ "${failed}" -eq 0 ]]
