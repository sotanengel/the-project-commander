#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB="${ROOT}/scripts/lib/docker-up-open.sh"
MAIN="${ROOT}/scripts/docker-up-open.sh"

passed=0
failed=0

pass() {
  passed=$((passed + 1))
  echo "PASS: $1"
}

fail() {
  failed=$((failed + 1))
  echo "FAIL: $1" >&2
  if [[ -n "${2:-}" ]]; then
    echo "  ${2}" >&2
  fi
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

assert_file_contains() {
  local file="$1"
  local expected="$2"
  local message="$3"
  if [[ -f "${file}" ]] && grep -Fq "${expected}" "${file}"; then
    pass "${message}"
  else
    fail "${message}" "file '${file}' does not contain '${expected}'"
  fi
}

assert_file_not_exists() {
  local file="$1"
  local message="$2"
  if [[ ! -f "${file}" ]]; then
    pass "${message}"
  else
    fail "${message}" "file '${file}' exists unexpectedly"
  fi
}

setup_mock_bin() {
  local mock_bin="$1"
  mkdir -p "${mock_bin}"
  cat > "${mock_bin}/open" <<'EOF'
#!/usr/bin/env bash
echo "$1" >> "${MOCK_OPEN_LOG}"
EOF
  chmod +x "${mock_bin}/open"

  cat > "${mock_bin}/curl" <<'EOF'
#!/usr/bin/env bash
if [[ "${MOCK_CURL_MODE:-fail}" == "ok" ]]; then
  exit 0
fi
exit 22
EOF
  chmod +x "${mock_bin}/curl"

  cat > "${mock_bin}/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod +x "${mock_bin}/sleep"
}

run_test() {
  local name="$1"
  shift
  if "$@"; then
    :
  else
    fail "${name}" "test function exited with status $?"
  fi
}

test_syntax() {
  bash -n "${MAIN}"
  bash -n "${LIB}"
  bash -n "${ROOT}/scripts/dev.sh"
  pass "bash syntax check"
}

test_open_browser_with_open_command() {
  local tmpdir mock_bin log
  tmpdir="$(mktemp -d)"
  mock_bin="${tmpdir}/bin"
  log="${tmpdir}/open.log"
  setup_mock_bin "${mock_bin}"
  MOCK_OPEN_LOG="${log}" PATH="${mock_bin}:${PATH}" bash -c "
    set -euo pipefail
    source '${LIB}'
    APP_URL='http://example.test:3000'
    open_browser
  "
  assert_file_contains "${log}" "http://example.test:3000" "open_browser calls open with APP_URL"
  rm -rf "${tmpdir}"
}

test_open_browser_without_open_command() {
  local tmpdir mock_bin output
  tmpdir="$(mktemp -d)"
  mock_bin="${tmpdir}/bin"
  mkdir -p "${mock_bin}"
  output="$(
    PATH="${mock_bin}" /bin/bash -c "
      set -euo pipefail
      source '${LIB}'
      APP_URL='http://fallback.test:3000'
      open_browser
    "
  )"
  assert_eq "Open http://fallback.test:3000 in your browser" "${output}" "open_browser prints URL when open is unavailable"
  rm -rf "${tmpdir}"
}

test_open_browser_falls_back_when_open_fails() {
  local tmpdir mock_bin output
  tmpdir="$(mktemp -d)"
  mock_bin="${tmpdir}/bin"
  mkdir -p "${mock_bin}"
  cat > "${mock_bin}/open" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
  chmod +x "${mock_bin}/open"
  cat > "${mock_bin}/xdg-open" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
  chmod +x "${mock_bin}/xdg-open"
  output="$(
    PATH="${mock_bin}:/usr/bin:/bin" /bin/bash -c "
      set -euo pipefail
      source '${LIB}'
      APP_URL='http://fallback.test:3000'
      open_browser
    "
  )"
  assert_eq "Open http://fallback.test:3000 in your browser" "${output}" "open_browser prints URL when open and xdg-open fail"
  rm -rf "${tmpdir}"
}

test_wait_for_health_opens_on_success() {
  local tmpdir mock_bin log
  tmpdir="$(mktemp -d)"
  mock_bin="${tmpdir}/bin"
  log="${tmpdir}/open.log"
  setup_mock_bin "${mock_bin}"
  MOCK_OPEN_LOG="${log}" MOCK_CURL_MODE="ok" PATH="${mock_bin}:${PATH}" bash -c "
    set -euo pipefail
    source '${LIB}'
    APP_URL='http://healthy.test:3000'
    HEALTH_URL=\"\${APP_URL}/api/health\"
    wait_for_health
  "
  assert_file_contains "${log}" "http://healthy.test:3000" "wait_for_health opens browser when health succeeds"
  rm -rf "${tmpdir}"
}

test_wait_for_health_opens_on_timeout() {
  local tmpdir mock_bin log stderr_log
  tmpdir="$(mktemp -d)"
  mock_bin="${tmpdir}/bin"
  log="${tmpdir}/open.log"
  stderr_log="${tmpdir}/stderr.log"
  setup_mock_bin "${mock_bin}"
  MOCK_OPEN_LOG="${log}" MOCK_CURL_MODE="fail" PATH="${mock_bin}:${PATH}" bash -c "
    set -euo pipefail
    source '${LIB}'
    APP_URL='http://timeout.test:3000'
    HEALTH_URL=\"\${APP_URL}/api/health\"
    MAX_WAIT=2
    wait_for_health
  " 2>"${stderr_log}" && fail "wait_for_health should fail on timeout" "expected non-zero exit" || true
  assert_file_not_exists "${log}" "wait_for_health does not open browser on timeout"
  assert_file_contains "${stderr_log}" "did not become ready" "wait_for_health warns on timeout"
  rm -rf "${tmpdir}"
}

test_load_env_file() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  cat > "${tmpdir}/.env" <<'EOF'
TG_AUTH_TOKEN=tg_anon_test_token
EOF
  local token
  token="$(
    bash -c "
      set -euo pipefail
      source '${LIB}'
      unset TG_AUTH_TOKEN 2>/dev/null || true
      load_env_file '${tmpdir}/.env'
      printf '%s' \"\${TG_AUTH_TOKEN:-}\"
    "
  )"
  assert_eq "tg_anon_test_token" "${token}" "load_env_file loads variables from .env"
  rm -rf "${tmpdir}"
}

test_load_env_file_missing() {
  local tmpdir token
  tmpdir="$(mktemp -d)"
  token="$(
    bash -c "
      set -euo pipefail
      source '${LIB}'
      TG_AUTH_TOKEN='unchanged'
      load_env_file '${tmpdir}/missing.env'
      printf '%s' \"\${TG_AUTH_TOKEN}\"
    "
  )"
  assert_eq "unchanged" "${token}" "load_env_file ignores missing file"
  rm -rf "${tmpdir}"
}

test_configure_runtime() {
  local app_url
  app_url="$(
    bash -c "
      set -euo pipefail
      source '${LIB}'
      configure_runtime 3005
      printf '%s' \"\${APP_URL}\"
    "
  )"
  assert_eq "http://localhost:3005" "${app_url}" "configure_runtime sets APP_URL from host port"
}

test_find_available_port_falls_back() {
  local tmpdir mock_bin port
  tmpdir="$(mktemp -d)"
  mock_bin="${tmpdir}/bin"
  mkdir -p "${mock_bin}"
  cat > "${mock_bin}/lsof" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *":3000"* ]]; then
  exit 0
fi
exit 1
EOF
  chmod +x "${mock_bin}/lsof"
  port="$(
    PATH="${mock_bin}:${PATH}" bash -c "
      set -euo pipefail
      source '${LIB}'
      find_available_port 3000 3002 2>/dev/null
    "
  )"
  assert_eq "3001" "${port}" "find_available_port selects next free port"
  rm -rf "${tmpdir}"
}

test_prepare_docker_runtime_exports_port() {
  local tmpdir mock_bin result stderr_log
  tmpdir="$(mktemp -d)"
  mock_bin="${tmpdir}/bin"
  stderr_log="${tmpdir}/stderr.log"
  mkdir -p "${mock_bin}"
  cat > "${mock_bin}/lsof" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
  chmod +x "${mock_bin}/lsof"
  result="$(
    PATH="${mock_bin}:${PATH}" bash -c "
      set -euo pipefail
      source '${LIB}'
      prepare_docker_runtime
      printf '%s|%s' \"\${TPC_HOST_PORT}\" \"\${APP_URL}\"
    " 2>"${stderr_log}"
  )"
  assert_eq "3000|http://localhost:3000" "${result}" "prepare_docker_runtime exports default port and URL"
  assert_file_contains "${stderr_log}" "URL: http://localhost:3000" "prepare_docker_runtime prints startup banner"
  rm -rf "${tmpdir}"
}

test_main_invokes_docker_compose() {
  local tmpdir mock_bin
  tmpdir="$(mktemp -d)"
  mock_bin="${tmpdir}/bin"
  mkdir -p "${mock_bin}"
  cat > "${mock_bin}/docker" <<EOF
#!/usr/bin/env bash
echo "\$@" > "${tmpdir}/docker.log"
exit 0
EOF
  chmod +x "${mock_bin}/docker"
  setup_mock_bin "${mock_bin}"
  MOCK_CURL_MODE="ok" MOCK_OPEN_LOG="${tmpdir}/open.log" TPC_HEALTH_TIMEOUT=1 PATH="${mock_bin}:${PATH}" bash -c "
    set -euo pipefail
    cd '${tmpdir}'
    bash '${MAIN}' --detach
  "
  for _ in $(seq 1 30); do
    [[ -s "${tmpdir}/open.log" ]] && break
    sleep 0.1
  done
  assert_file_contains "${tmpdir}/docker.log" "compose up --build --detach" "main runs docker compose up --build with forwarded args"
  assert_file_not_exists "${tmpdir}/.env" "main does not require .env to exist"
  rm -rf "${tmpdir}"
}

main() {
  run_test "bash syntax check" test_syntax
  run_test "open_browser with open command" test_open_browser_with_open_command
  run_test "open_browser without open command" test_open_browser_without_open_command
  run_test "open_browser when open fails" test_open_browser_falls_back_when_open_fails
  run_test "wait_for_health success" test_wait_for_health_opens_on_success
  run_test "wait_for_health timeout" test_wait_for_health_opens_on_timeout
  run_test "load_env_file" test_load_env_file
  run_test "load_env_file missing" test_load_env_file_missing
  run_test "configure_runtime" test_configure_runtime
  run_test "find_available_port fallback" test_find_available_port_falls_back
  run_test "prepare_docker_runtime" test_prepare_docker_runtime_exports_port
  run_test "main invokes docker compose" test_main_invokes_docker_compose

  echo
  echo "Script tests: ${passed} passed, ${failed} failed"
  if [[ "${failed}" -gt 0 ]]; then
    exit 1
  fi
}

main "$@"
