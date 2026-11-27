#!/usr/bin/env bash
# Tests for .claude/hooks/block-direct-merge.sh
#
# Asserts that the hook blocks (exit 2) every direct merge except a clean
# Dependabot PR merged in squash with the head SHA pinned, and that
# settings.json wires it to the GitHub MCP merge tool. Run from repo root:
#   ./.claude/hooks/test-block-direct-merge.sh
#
# Defense-in-depth for CLAUDE.md regola 1: if the matcher is missing or
# mistyped, `merge_pull_request` skips the required-checks gate that
# `enable_pr_auto_merge` goes through, and the hook never fires.
#
# No network: a fake `curl` first on PATH serves the PR JSON from a fixture
# file, or fails when the fixture is absent.

set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
HOOK="$SCRIPT_DIR/block-direct-merge.sh"
SETTINGS="$SCRIPT_DIR/../settings.json"

if [ ! -x "$HOOK" ]; then
  echo "FAIL: hook not executable: $HOOK" >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
cat >"$TMP/bin/curl" <<'EOF'
#!/usr/bin/env bash
# Fake curl: records the URL, serves $FAKE_PR_JSON or fails like curl -f.
for arg in "$@"; do url="$arg"; done
printf '%s\n' "$url" >"$FAKE_CURL_LOG"
[ -n "${FAKE_PR_JSON:-}" ] && [ -f "$FAKE_PR_JSON" ] || exit 22
cat "$FAKE_PR_JSON"
EOF
chmod +x "$TMP/bin/curl"
export FAKE_CURL_LOG="$TMP/curl.log"

SHA=1d5fa54930c7d411d35d284086922fce023d9367
OTHER_SHA=82a517f9b782caeca967e333cbd5d8d462da2df8

failures=0

# pr_json <login> <type> <state> <base> <head_repo> <head_sha> <mergeable_state>
pr_json() {
  jq -n --arg login "$1" --arg type "$2" --arg state "$3" --arg base "$4" \
    --arg head_repo "$5" --arg sha "$6" --arg ms "$7" \
    '{user:{login:$login,type:$type},state:$state,base:{ref:$base},
      head:{sha:$sha,repo:{full_name:$head_repo}},mergeable_state:$ms}' \
    >"$TMP/pr.json"
  export FAKE_PR_JSON="$TMP/pr.json"
}

good_pr() { pr_json "dependabot[bot]" Bot open main o/r "$SHA" clean; }

# payload [merge_method] [sha] [owner] [pullNumber]
payload() {
  jq -cn --arg m "${1-squash}" --arg s "${2-$SHA}" --arg o "${3-o}" --arg p "${4-1}" \
    '{tool_name:"mcp__github__merge_pull_request",
      tool_input:({owner:$o,repo:"r",pullNumber:($p|tonumber? // $p)}
        + (if $m == "" then {} else {merge_method:$m} end)
        + (if $s == "" then {} else {expectedHeadSha:$s} end))}'
}

expect() {
  local want=$1 desc=$2 body=$3 rc
  printf '%s' "$body" | PATH="$TMP/bin:$PATH" bash "$HOOK" >/dev/null 2>"$TMP/stderr"
  rc=$?
  if [ "$rc" -ne "$want" ]; then
    echo "FAIL: $desc — expected exit $want, got $rc" >&2
    sed 's/^/    /' "$TMP/stderr" >&2
    failures=$((failures + 1))
  fi
}

# --- allowed: the one exception --------------------------------------------
good_pr
expect 0 "clean dependabot PR, squash, pinned SHA" "$(payload)"
if [ "$(cat "$FAKE_CURL_LOG")" != "https://api.github.com/repos/o/r/pulls/1" ]; then
  echo "FAIL: hook queried '$(cat "$FAKE_CURL_LOG")'" >&2
  failures=$((failures + 1))
fi

# --- blocked: PR state read from GitHub -------------------------------------
pr_json "dstmrk" User open main o/r "$SHA" clean
expect 2 "human author" "$(payload)"
pr_json "dependabot[bot]" User open main o/r "$SHA" clean
expect 2 "dependabot login but not a Bot account" "$(payload)"
pr_json "dependabot[bot]" Bot open main o/r "$SHA" behind
expect 2 "mergeable_state behind" "$(payload)"
pr_json "dependabot[bot]" Bot open main o/r "$SHA" unknown
expect 2 "mergeable_state unknown" "$(payload)"
pr_json "dependabot[bot]" Bot open main o/r "$SHA" blocked
expect 2 "mergeable_state blocked (checks failing)" "$(payload)"
pr_json "dependabot[bot]" Bot closed main o/r "$SHA" clean
expect 2 "closed PR" "$(payload)"
pr_json "dependabot[bot]" Bot open release o/r "$SHA" clean
expect 2 "base not main" "$(payload)"
pr_json "dependabot[bot]" Bot open main fork/r "$SHA" clean
expect 2 "head from a fork" "$(payload)"
pr_json "dependabot[bot]" Bot open main o/r "$OTHER_SHA" clean
expect 2 "head moved since the SHA was pinned" "$(payload)"

# --- blocked: the merge request itself --------------------------------------
good_pr
expect 2 "merge_method merge" "$(payload merge)"
expect 2 "merge_method rebase" "$(payload rebase)"
expect 2 "merge_method missing" "$(payload '')"
expect 2 "expectedHeadSha missing" "$(payload squash '')"
expect 2 "expectedHeadSha not a SHA" "$(payload squash main)"
expect 2 "owner with URL metacharacters" "$(payload squash "$SHA" 'o/../x')"
expect 2 "pullNumber not numeric" "$(payload squash "$SHA" o '1?x=1')"
expect 2 "non-JSON input" "not json"

# --- blocked: fail closed on the API ---------------------------------------
rm -f "$TMP/pr.json"
expect 2 "GitHub API unreachable" "$(payload)"
printf 'not json' >"$TMP/pr.json"
expect 2 "GitHub API returns garbage" "$(payload)"

# The message must point at the sanctioned path, or the agent has no way out.
pr_json "dstmrk" User open main o/r "$SHA" clean
msg=$(payload | PATH="$TMP/bin:$PATH" bash "$HOOK" 2>&1 >/dev/null)
if ! printf '%s' "$msg" | grep -q "enable_pr_auto_merge"; then
  echo "FAIL: block message does not mention enable_pr_auto_merge" >&2
  failures=$((failures + 1))
fi

# The matcher must name exactly the merge tool, and only it: auto-merge has
# to stay reachable.
matchers=$(jq -r '.hooks.PreToolUse[] | select(.hooks[].command | contains("block-direct-merge.sh")) | .matcher' "$SETTINGS")
if [ "$matchers" != "mcp__github__merge_pull_request" ]; then
  echo "FAIL: settings.json matcher for block-direct-merge.sh is '$matchers'" >&2
  failures=$((failures + 1))
fi

if [ "$failures" -gt 0 ]; then
  echo "$failures test(s) failed." >&2
  exit 1
fi

echo "All block-direct-merge hook tests passed."
