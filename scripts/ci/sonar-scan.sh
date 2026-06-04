#!/usr/bin/env bash
# CI wrapper around the SonarQube Cloud scan.
#
# Why this exists
# ---------------
# SonarSource's CDN (binaries.sonarsource.com) intermittently answers the
# scanner-CLI download with HTTP 403. It is infrastructure flakiness on Sonar's
# side, unrelated to our code, yet it fails the `sonar` CI job — and on `main`
# after a merge it spams failure notifications. The official
# `sonarqube-scan-action` has no built-in retry and re-downloads the CLI on
# every run, so a single bad response from the CDN sinks the whole job.
#
# Behaviour
# ---------
#   1. Download the scanner CLI, retrying up to MAX_ATTEMPTS with exponential
#      backoff. A second attempt clears almost every intermittent 403.
#   2. If *every* attempt fails to fetch the CLI (transient CDN/network error,
#      e.g. the 403), print a warning annotation and exit 0 — the job stays
#      green. We tolerate ONLY the download phase.
#   3. Once the CLI is in place, run the scan. A failure *here* is a real
#      problem (bad config, auth, analysis error) and propagates a non-zero
#      exit, so genuine issues still turn the job red.
#
# Branch/PR decoration is auto-detected by the scanner from the GitHub Actions
# environment, so no sonar.pullrequest.* parameters are needed. The
# `-linux-x64` distribution bundles its own JRE, so no system Java is required.
#
# Note: unlike the official action this does not OpenPGP-verify the binary; the
# zip is still fetched over TLS from the official host. Acceptable trade-off for
# this project — revisit if supply-chain posture tightens.
#
# The download/extract/scan steps are functions so test-sonar-scan.sh can stub
# them; main() runs only when the script is executed directly, not when sourced.

set -uo pipefail

SCANNER_VERSION="${SCANNER_VERSION:-8.0.1.6346}"
SONAR_BINARIES_URL="${SONAR_BINARIES_URL:-https://binaries.sonarsource.com/Distribution/sonar-scanner-cli}"
SONAR_HOST_URL="${SONAR_HOST_URL:-https://sonarcloud.io}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-3}"
# Attempt N waits BACKOFF_BASE * 2^(N-1) seconds. Set to 0 in tests.
BACKOFF_BASE="${BACKOFF_BASE:-2}"
WORK_DIR="${WORK_DIR:-$(mktemp -d)}"

ZIP_NAME="sonar-scanner-cli-${SCANNER_VERSION}-linux-x64.zip"
SCANNER_HOME="${WORK_DIR}/sonar-scanner-${SCANNER_VERSION}-linux-x64"

log() { printf '%s\n' "$*" >&2; }

# Download + extract the CLI. Returns 0 on success, non-zero on any
# download/extract failure so the caller can retry and ultimately tolerate.
fetch_scanner() {
  local url="${SONAR_BINARIES_URL}/${ZIP_NAME}"
  local zip="${WORK_DIR}/${ZIP_NAME}"
  local code
  # Without --fail curl returns 0 even on 403 (it writes the error body), so we
  # inspect the HTTP status code explicitly. A non-zero curl exit means a
  # network/TLS error, which is equally a transient download failure.
  code=$(curl -sSL -o "$zip" -w '%{http_code}' "$url") || {
    log "curl error fetching ${url}"
    return 1
  }
  log "Scanner download HTTP status: ${code} (${url})"
  [ "$code" = "200" ] || return 1
  unzip -q -o "$zip" -d "$WORK_DIR" || return 1
}

# Run the actual scan. SONAR_TOKEN is read from the environment by the CLI.
run_scan() {
  "${SCANNER_HOME}/bin/sonar-scanner" -Dsonar.host.url="${SONAR_HOST_URL}"
}

main() {
  local attempt=1 delay
  while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
    if fetch_scanner; then
      log "Scanner CLI ready (attempt ${attempt}/${MAX_ATTEMPTS}); running scan."
      run_scan
      return $?
    fi
    if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
      delay=$(( BACKOFF_BASE * (1 << (attempt - 1)) ))
      log "Scanner download failed (attempt ${attempt}/${MAX_ATTEMPTS}); retrying in ${delay}s..."
      sleep "$delay"
    fi
    attempt=$((attempt + 1))
  done

  # Every attempt failed to even fetch the CLI: transient CDN/network flakiness
  # (typically HTTP 403). Pass the job rather than spam failure notifications.
  printf '::warning::%s\n' "SonarQube scan skipped: could not download the scanner CLI from ${SONAR_BINARIES_URL} after ${MAX_ATTEMPTS} attempts (transient CDN error, e.g. HTTP 403). Not failing the job."
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
