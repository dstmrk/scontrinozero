#!/usr/bin/env bash
# Tests for .claude/hooks/block-drizzle-generate.sh
#
# Runs the hook with synthetic Bash tool invocations and asserts the
# expected exit code (2 = block, 0 = pass). Run from repo root:
#   ./.claude/hooks/test-block-drizzle-generate.sh
#
# This is a defense-in-depth net for CLAUDE.md regola 11: a regex that
# fails to block `drizzle-kit generate` (under any runner, with extra
# whitespace, or with a `generate:<dialect>` suffix) would let a
# regenerated migration conflict with the handwritten journal.

set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
HOOK="$SCRIPT_DIR/block-drizzle-generate.sh"

if [ ! -f "$HOOK" ]; then
  echo "FAIL: hook not found: $HOOK" >&2
  exit 1
fi

failures=0

# Run the hook in a subshell with the given fake Bash command on stdin.
# Returns the hook's exit code via the global $rc. We can't use `local`
# at the top level so we use a global.
run_hook() {
  local cmd="$1"
  local payload
  payload=$(printf '%s' "$cmd" | python3 -c '
import json, sys
print(json.dumps({"tool_input": {"command": sys.stdin.read()}}))')
  printf '%s' "$payload" | bash "$HOOK" >/dev/null 2>&1
  rc=$?
}

assert_block() {
  local cmd="$1"
  run_hook "$cmd"
  if [ "$rc" -ne 2 ]; then
    echo "FAIL: expected BLOCK (exit 2) but got exit $rc for: $cmd" >&2
    failures=$((failures + 1))
  fi
}

assert_pass() {
  local cmd="$1"
  run_hook "$cmd"
  if [ "$rc" -ne 0 ]; then
    echo "FAIL: expected PASS (exit 0) but got exit $rc for: $cmd" >&2
    failures=$((failures + 1))
  fi
}

# --- PASS cases: legitimate drizzle/db operations that must not be blocked ---
assert_pass "drizzle-kit migrate"
assert_pass "drizzle-kit push"
assert_pass "drizzle-kit studio"
assert_pass "npm run db:studio"
assert_pass "npx tsx scripts/migrate.ts"
assert_pass "node scripts/check-migrations.mjs"
assert_pass "git status"

# --- BLOCK cases: any invocation of `drizzle-kit generate` ---
assert_block "drizzle-kit generate"
assert_block "npx drizzle-kit generate"
assert_block "pnpm drizzle-kit generate"
assert_block "npx drizzle-kit   generate"
assert_block "drizzle-kit generate:pg"
assert_block "cd packages/db && npx drizzle-kit generate"

# --- BLOCK cases: options between `drizzle-kit` and `generate`. A regex
# requiring adjacency lets `drizzle-kit --config=x generate` through
# (same bypass class as `git -C … push`, found 2026-07-02). ---
assert_block "npx drizzle-kit --config=drizzle.config.ts generate"
assert_block "drizzle-kit --config drizzle.config.ts generate"

# Options before a non-generate subcommand must stay allowed.
assert_pass "npx drizzle-kit --config=drizzle.config.ts push"

# --- BLOCK cases: the first-party `db:generate` script wrapper, which
# expands to `drizzle-kit generate` (package.json). Without these the suite
# gives a false green: the most likely real invocation slips through. ---
assert_block "npm run db:generate"
assert_block "npm run db:generate -- --name foo"
assert_block "pnpm db:generate"
assert_block "pnpm run db:generate"
assert_block "yarn db:generate"
assert_block "yarn run db:generate"
assert_block "bun run db:generate"

# The sibling db:* scripts must stay allowed (they are not `generate`).
assert_pass "npm run db:migrate"
assert_pass "npm run db:push"

if [ "$failures" -gt 0 ]; then
  echo "$failures test(s) failed." >&2
  exit 1
fi

echo "All block-drizzle-generate hook tests passed."
