#!/usr/bin/env bash
# Tests for scripts/ci/sonar-scan.sh
#
# Verifies the retry/tolerate decision without touching the network, by sourcing
# the script and stubbing its fetch_scanner / run_scan functions. Run from repo
# root:
#   ./scripts/ci/test-sonar-scan.sh
#
# Defense-in-depth: if the tolerate logic regressed to swallow *scan* failures
# we'd silently lose the quality gate; if it regressed to fail on a download
# 403 we'd be back to notification spam. Both must be caught here.

# Scenario strings below are literal code handed to `eval`; single quotes are
# intentional so nothing expands before then.
# shellcheck disable=SC2016
set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
SCAN="$SCRIPT_DIR/sonar-scan.sh"

if [ ! -f "$SCAN" ]; then
  echo "FAIL: script not found: $SCAN" >&2
  exit 1
fi

failures=0

# Source the script in a clean subshell, apply a scenario (which overrides
# fetch_scanner / run_scan), run main, and capture combined output via $out and
# exit code via $rc. BACKOFF_BASE=0 keeps retries instant.
run_main() {
  local scenario="$1"
  out=$( {
    BACKOFF_BASE=0 MAX_ATTEMPTS=3
    export BACKOFF_BASE MAX_ATTEMPTS
    # shellcheck disable=SC1090
    source "$SCAN"
    eval "$scenario"
    main
  } 2>&1 )
  rc=$?
}

assert_rc() {
  local label="$1" want="$2"
  if [ "$rc" -ne "$want" ]; then
    echo "FAIL [$label]: expected exit $want but got $rc" >&2
    echo "       output: $out" >&2
    failures=$((failures + 1))
  fi
}

assert_contains() {
  local label="$1" needle="$2"
  case "$out" in
    *"$needle"*) ;;
    *)
      echo "FAIL [$label]: output missing '$needle'" >&2
      echo "       output: $out" >&2
      failures=$((failures + 1))
      ;;
  esac
}

assert_not_contains() {
  local label="$1" needle="$2"
  case "$out" in
    *"$needle"*)
      echo "FAIL [$label]: output unexpectedly contains '$needle'" >&2
      echo "       output: $out" >&2
      failures=$((failures + 1))
      ;;
  esac
}

# 1. Download fails on every attempt -> tolerate (exit 0, warning, no scan).
run_main '
fetch_scanner() { return 1; }
run_scan() { echo "SCAN RAN"; return 0; }
'
assert_rc "persistent 403 tolerated" 0
assert_contains "persistent 403 tolerated" "::warning::"
assert_not_contains "persistent 403 tolerated" "SCAN RAN"

# 2. Download flaky (fails twice, succeeds on attempt 3) -> scan runs, passes.
run_main '
fetch_scanner() {
  FETCH_TRIES=$(( ${FETCH_TRIES:-0} + 1 ))
  [ "$FETCH_TRIES" -ge 3 ]
}
run_scan() { echo "SCAN RAN"; return 0; }
'
assert_rc "flaky download recovers" 0
assert_contains "flaky download recovers" "SCAN RAN"
assert_not_contains "flaky download recovers" "::warning::"

# 3. Download OK but the scan itself fails -> real failure, job red.
run_main '
fetch_scanner() { return 0; }
run_scan() { echo "SCAN RAN"; return 7; }
'
assert_rc "real scan failure propagates" 7
assert_contains "real scan failure propagates" "SCAN RAN"
assert_not_contains "real scan failure propagates" "::warning::"

# 4. Happy path: download OK on first attempt, scan passes.
run_main '
fetch_scanner() { return 0; }
run_scan() { echo "SCAN RAN"; return 0; }
'
assert_rc "happy path" 0
assert_contains "happy path" "SCAN RAN"

# 5. Warm cache (actions/cache hit): CLI already extracted -> scan runs,
#    NO download attempted.
run_main '
scanner_cached() { return 0; }
fetch_scanner() { echo "FETCH RAN"; return 0; }
run_scan() { echo "SCAN RAN"; return 0; }
'
assert_rc "cache hit skips download" 0
assert_contains "cache hit skips download" "SCAN RAN"
assert_not_contains "cache hit skips download" "FETCH RAN"

# 6. Warm cache but the scan fails -> real failure still propagates,
#    no tolerate warning.
run_main '
scanner_cached() { return 0; }
fetch_scanner() { echo "FETCH RAN"; return 0; }
run_scan() { echo "SCAN RAN"; return 7; }
'
assert_rc "cache hit scan failure propagates" 7
assert_not_contains "cache hit scan failure propagates" "::warning::"

# 7. Cold cache (explicit miss) -> download path runs, then scan.
run_main '
scanner_cached() { return 1; }
fetch_scanner() { echo "FETCH RAN"; return 0; }
run_scan() { echo "SCAN RAN"; return 0; }
'
assert_rc "cache miss downloads then scans" 0
assert_contains "cache miss downloads then scans" "FETCH RAN"
assert_contains "cache miss downloads then scans" "SCAN RAN"

# 8. Real-FS scanner_cached: a stale/partial extraction (binary present but
#    not executable) must read as a miss; an executable binary as a hit.
tmp=$(mktemp -d)
out=$( {
  WORK_DIR="$tmp"
  export WORK_DIR
  # shellcheck disable=SC1090
  source "$SCAN"
  mkdir -p "${SCANNER_HOME}/bin"
  : > "${SCANNER_HOME}/bin/sonar-scanner"
  scanner_cached && echo "RESULT=HIT" || echo "RESULT=MISS"
  chmod +x "${SCANNER_HOME}/bin/sonar-scanner"
  scanner_cached && echo "RESULT=HIT" || echo "RESULT=MISS"
} 2>&1 )
case "$out" in
  *"RESULT=MISS"*"RESULT=HIT"*) ;;
  *)
    echo "FAIL [stale cache detection]: expected MISS then HIT, got: $out" >&2
    failures=$((failures + 1))
    ;;
esac
rm -rf "$tmp"

if [ "$failures" -gt 0 ]; then
  echo "$failures test(s) failed." >&2
  exit 1
fi

echo "All sonar-scan wrapper tests passed."
