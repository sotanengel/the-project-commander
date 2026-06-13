#!/usr/bin/env bash
set -euo pipefail

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/resolve-ollama-model.sh"
# shellcheck source=scripts/lib/resolve-ollama-model.sh
source "${LIB}"

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

test_low_ram_selects_3b() {
  get_system_ram_bytes() { echo $((8 * 1024 * 1024 * 1024)); }
  assert_eq "qwen2.5:3b-instruct" "$(resolve_ollama_model_from_ram)" "8 GiB RAM selects 3b"
}

test_high_ram_selects_7b() {
  get_system_ram_bytes() { echo $((16 * 1024 * 1024 * 1024)); }
  assert_eq "qwen2.5:7b-instruct" "$(resolve_ollama_model_from_ram)" "16 GiB RAM selects 7b"
}

test_explicit_model_skips_auto() {
  TPC_OLLAMA_MODEL="custom:model"
  resolve_and_export_ollama_model
  assert_eq "custom:model" "${TPC_OLLAMA_MODEL}" "explicit TPC_OLLAMA_MODEL is kept"
  unset TPC_OLLAMA_MODEL
}

test_low_ram_auto_export() {
  unset TPC_OLLAMA_MODEL
  get_system_ram_bytes() { echo $((8 * 1024 * 1024 * 1024)); }
  resolve_and_export_ollama_model
  assert_eq "qwen2.5:3b-instruct" "${TPC_OLLAMA_MODEL}" "auto export selects 3b on low RAM"
  unset TPC_OLLAMA_MODEL
}

test_low_ram_selects_3b
test_high_ram_selects_7b
test_explicit_model_skips_auto
test_low_ram_auto_export

echo ""
echo "resolve-ollama-model tests: ${passed} passed, ${failed} failed"
[[ "${failed}" -eq 0 ]]
