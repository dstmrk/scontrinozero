#!/usr/bin/env bash
# Tests for .claude/hooks/block-commit-on-main.sh
#
# Runs the hook with synthetic Bash tool invocations from git repos on
# different branches and asserts the expected exit code (2 = block,
# 0 = pass). Run from repo root:
#   ./.claude/hooks/test-block-commit-on-main.sh
#
# Defense-in-depth net for CLAUDE.md regola 1: a hook that stops blocking
# `git commit` on main (or starts blocking commits on feature branches)
# must fail CI, not pass silently.

set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
HOOK="$SCRIPT_DIR/block-commit-on-main.sh"

if [ ! -x "$HOOK" ]; then
  echo "FAIL: hook not executable: $HOOK" >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

git init -q -b main "$TMP/on-main"
git init -q -b main "$TMP/on-feature"
git -C "$TMP/on-feature" checkout -q -b feature
mkdir -p "$TMP/non-repo"

failures=0

# Run the hook with the given fake Bash command, from the given directory.
# Optional third arg: the payload's session `cwd`. Claude Code launches the
# hook from the project root, which for a worktree session is the main
# checkout (on main): the branch must come from the session cwd.
run_hook() {
  local cmd="$1"
  local dir="$2"
  local session_cwd="${3:-}"
  local payload
  payload=$(printf '%s' "$cmd" | SESSION_CWD="$session_cwd" python3 -c '
import json, os, sys
p = {"tool_input": {"command": sys.stdin.read()}}
if os.environ["SESSION_CWD"]:
    p["cwd"] = os.environ["SESSION_CWD"]
print(json.dumps(p))')
  printf '%s' "$payload" | (cd "$dir" && bash "$HOOK") >/dev/null 2>&1
  rc=$?
}

assert_block() {
  local cmd="$1" dir="$2" session_cwd="${3:-}"
  run_hook "$cmd" "$dir" "$session_cwd"
  if [ "$rc" -ne 2 ]; then
    echo "FAIL: expected BLOCK (exit 2) but got exit $rc for: $cmd (in $dir)" >&2
    failures=$((failures + 1))
  fi
}

assert_pass() {
  local cmd="$1" dir="$2" session_cwd="${3:-}"
  run_hook "$cmd" "$dir" "$session_cwd"
  if [ "$rc" -ne 0 ]; then
    echo "FAIL: expected PASS (exit 0) but got exit $rc for: $cmd (in $dir)" >&2
    failures=$((failures + 1))
  fi
}

# --- PASS cases: commits on a feature branch, non-commit git commands on
# main, and commit-looking commands outside a git repo (no branch → allow) ---
assert_pass "git commit -m 'feat: x'" "$TMP/on-feature"
assert_pass "git add -A && git commit -m 'feat: x'" "$TMP/on-feature"
assert_pass "git -C . commit --amend --no-edit" "$TMP/on-feature"
assert_pass "git status" "$TMP/on-main"
assert_pass "git log --grep commit" "$TMP/on-main"
assert_pass "git checkout -b feature" "$TMP/on-main"
assert_pass "npm run lint" "$TMP/on-main"
assert_pass "git commit -m 'x'" "$TMP/non-repo"
# Worktree session: hook launched from the main checkout, session on a branch.
assert_pass "git commit -m 'feat: x'" "$TMP/on-main" "$TMP/on-feature"

# --- BLOCK cases: any commit while the current branch is main ---
assert_block "git commit -m 'feat: x'" "$TMP/on-main"
assert_block "git commit --amend --no-edit" "$TMP/on-main"
assert_block "git add -A && git commit -m 'feat: x'" "$TMP/on-main"
assert_block "git -C . commit -m 'feat: x'" "$TMP/on-main"
assert_block "git -c user.name=x commit -m 'feat: x'" "$TMP/on-main"
# The session cwd decides, not the directory the hook was launched from.
assert_block "git commit -m 'feat: x'" "$TMP/on-feature" "$TMP/on-main"
# A session cwd that no longer exists falls back to the launch directory.
assert_block "git commit -m 'feat: x'" "$TMP/on-main" "$TMP/gone"

if [ "$failures" -gt 0 ]; then
  echo "$failures test(s) failed." >&2
  exit 1
fi

echo "All block-commit-on-main hook tests passed."
