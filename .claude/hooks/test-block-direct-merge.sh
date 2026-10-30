#!/usr/bin/env bash
# Tests for .claude/hooks/block-direct-merge.sh
#
# Asserts that the hook blocks (exit 2) and that settings.json wires it to
# the GitHub MCP merge tool. Run from repo root:
#   ./.claude/hooks/test-block-direct-merge.sh
#
# Defense-in-depth for CLAUDE.md regola 1: if the matcher is missing or
# mistyped, `merge_pull_request` skips the required-checks gate that
# `enable_pr_auto_merge` goes through, and the hook never fires.

set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
HOOK="$SCRIPT_DIR/block-direct-merge.sh"
SETTINGS="$SCRIPT_DIR/../settings.json"

if [ ! -x "$HOOK" ]; then
  echo "FAIL: hook not executable: $HOOK" >&2
  exit 1
fi

failures=0

payload='{"tool_name":"mcp__github__merge_pull_request","tool_input":{"owner":"o","repo":"r","pullNumber":1}}'
printf '%s' "$payload" | bash "$HOOK" >/dev/null 2>&1
rc=$?
if [ "$rc" -ne 2 ]; then
  echo "FAIL: expected BLOCK (exit 2) but got exit $rc" >&2
  failures=$((failures + 1))
fi

# The message must point at the sanctioned path, or the agent has no way out.
msg=$(printf '%s' "$payload" | bash "$HOOK" 2>&1 >/dev/null)
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
