#!/usr/bin/env bash
# PreToolUse hook on Bash — blocks `drizzle-kit generate`.
# Rationale: CLAUDE.md regola 11. The repo uses handwritten migrations after
# 0000_initial.sql; regenerating would conflict with the existing journal.
# See skill: db-migrations.

set -euo pipefail

cmd=$(jq -r '.tool_input.command // ""')

if printf '%s' "$cmd" | grep -qE 'drizzle-kit[[:space:]]+generate'; then
  echo "Blocked by .claude/hooks/block-drizzle-generate.sh:" >&2
  echo "  \`drizzle-kit generate\` is forbidden in this repo (CLAUDE.md regola 11)." >&2
  echo "  Migrations after 0000 are handwritten. See skill 'db-migrations' for the workflow." >&2
  exit 2
fi

exit 0
