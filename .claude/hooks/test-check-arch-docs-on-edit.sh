#!/usr/bin/env bash
# Tests for .claude/hooks/check-arch-docs-on-edit.sh
#
# Builds self-contained fixture repos (hook + validator script + meta docs)
# and asserts the expected exit code (2 = block with feedback, 0 = pass).
# Run from repo root:
#   ./.claude/hooks/test-check-arch-docs-on-edit.sh
#
# Defense-in-depth net for CLAUDE.md regola 26: a hook that stops flagging a
# dead path after an edit to CLAUDE.md / docs/architecture/ / .claude/skills/
# (or starts running the validator on unrelated files) must fail CI.

set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
HOOK_SRC="$SCRIPT_DIR/check-arch-docs-on-edit.sh"

if [ ! -x "$HOOK_SRC" ]; then
  echo "FAIL: hook not executable: $HOOK_SRC" >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# make_fixture <name> <INDEX.md content> <CLAUDE.md content> [REVIEW.md content]
# Creates $TMP/<name> with the hook, the real validator script and the given
# meta docs. The hook resolves the repo root from its own location, so the
# fixture is a fully isolated mini-repo.
# REVIEW.md is written too: the validator reads it to check the uniqueness of
# the finding numbers, and reports its absence as an error — a fixture without
# it would fail for a reason the test is not about.
make_fixture() {
  local name="$1" index_md="$2" claude_md="$3" review_md="${4:-### 1. Una voce sola}"
  local root="$TMP/$name"
  mkdir -p "$root/.claude/hooks" "$root/scripts" "$root/docs/architecture"
  cp "$HOOK_SRC" "$root/.claude/hooks/"
  cp "$REPO_ROOT/scripts/check-architecture-docs.mjs" "$root/scripts/"
  printf '%s\n' "$index_md" >"$root/docs/architecture/INDEX.md"
  printf '%s\n' "$claude_md" >"$root/CLAUDE.md"
  printf '%s\n' "$review_md" >"$root/REVIEW.md"
}

make_fixture ok "Nothing referenced here." "No paths here either."
make_fixture bad-index "Vedi \`src/lib/ghost.ts\`." "No paths here."
make_fixture bad-claude "Nothing referenced here." "Regola: usa \`src/lib/ghost.ts\`."
make_fixture bad-review "Nothing referenced here." "No paths here either." \
  "### 96. Prima voce

### 96. Seconda voce"

failures=0

# Run a fixture's hook copy with the given fake Edit/Write file_path.
run_hook() {
  local fixture="$1" file_path="$2"
  local payload
  payload=$(printf '%s' "$file_path" | python3 -c '
import json, sys
print(json.dumps({"tool_input": {"file_path": sys.stdin.read()}}))')
  printf '%s' "$payload" | bash "$TMP/$fixture/.claude/hooks/check-arch-docs-on-edit.sh" >/dev/null 2>&1
  rc=$?
}

assert_block() {
  local fixture="$1" file_path="$2"
  run_hook "$fixture" "$file_path"
  if [ "$rc" -ne 2 ]; then
    echo "FAIL: expected BLOCK (exit 2) but got exit $rc for: $file_path (fixture $fixture)" >&2
    failures=$((failures + 1))
  fi
}

assert_pass() {
  local fixture="$1" file_path="$2"
  run_hook "$fixture" "$file_path"
  if [ "$rc" -ne 0 ]; then
    echo "FAIL: expected PASS (exit 0) but got exit $rc for: $file_path (fixture $fixture)" >&2
    failures=$((failures + 1))
  fi
}

# --- PASS cases: non-meta files never trigger the validator (the bad
# fixtures would fail it), healthy meta docs pass it ---
assert_pass bad-index "/repo/src/lib/plans.ts"
assert_pass bad-index "/repo/tests/unit/foo.test.ts"
assert_pass bad-index "/repo/docs/api-spec.md"
assert_pass bad-index "/repo/README.md"
assert_pass bad-index ""
assert_pass ok "$TMP/ok/docs/architecture/INDEX.md"
assert_pass ok "$TMP/ok/CLAUDE.md"
assert_pass ok "$TMP/ok/.claude/skills/testing-patterns/SKILL.md"
assert_pass ok "$TMP/ok/REVIEW.md"

# --- BLOCK cases: an edit to any meta doc while a dead reference exists ---
assert_block bad-index "$TMP/bad-index/docs/architecture/INDEX.md"
assert_block bad-index "docs/architecture/INDEX.md"
assert_block bad-index "$TMP/bad-index/.claude/skills/testing-patterns/SKILL.md"
assert_block bad-claude "$TMP/bad-claude/CLAUDE.md"
assert_block bad-claude "CLAUDE.md"

# --- BLOCK cases: due voci REVIEW.md con lo stesso numero ---
assert_block bad-review "$TMP/bad-review/REVIEW.md"
assert_block bad-review "REVIEW.md"
# Il validatore e' globale: la collisione blocca anche l'edit a un altro meta doc.
assert_block bad-review "$TMP/bad-review/CLAUDE.md"

if [ "$failures" -gt 0 ]; then
  echo "$failures test(s) failed." >&2
  exit 1
fi

echo "All check-arch-docs-on-edit hook tests passed."
