#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PULL_SCRIPT="${ROOT}/scripts/ollama-pull.sh"

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

assert_file_contains() {
  local file="$1"
  local expected="$2"
  local message="$3"
  if [[ -f "${file}" ]] && grep -Fq "${expected}" "${file}"; then
    pass "${message}"
  else
    fail "${message}"
  fi
}

assert_file_contains "${ROOT}/docker-compose.yml" "ollama:" "docker-compose defines ollama service"
assert_file_contains "${ROOT}/docker-compose.yml" "ollama-init:" "docker-compose defines ollama-init service"
assert_file_contains "${ROOT}/docker-compose.yml" "TPC_OLLAMA_BASE_URL: http://ollama:11434" "app uses internal ollama URL"
assert_file_contains "${PULL_SCRIPT}" "ollama pull" "ollama-pull script pulls model"

if bash -n "${PULL_SCRIPT}"; then
  pass "ollama-pull.sh bash syntax"
else
  fail "ollama-pull.sh bash syntax"
fi

echo ""
echo "Ollama script tests: ${passed} passed, ${failed} failed"
[[ "${failed}" -eq 0 ]]
