#!/usr/bin/env bash
# PreToolUse hook on mcp__github__merge_pull_request — blocks the immediate
# merge. Rationale: CLAUDE.md regola 1. The merge goes through
# `enable_pr_auto_merge`, so GitHub (required checks on main: CI + Sonar)
# decides when it happens, not the agent.

set -euo pipefail

echo "Blocked by .claude/hooks/block-direct-merge.sh:" >&2
echo "  merge_pull_request merges now, without waiting for the required checks" >&2
echo "  (CLAUDE.md regola 1). Use enable_pr_auto_merge (squash): GitHub merges" >&2
echo "  only when every required check on main is green." >&2
echo "  If a direct merge is intentional, do it outside Claude." >&2
exit 2
