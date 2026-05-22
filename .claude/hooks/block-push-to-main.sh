#!/usr/bin/env bash
# PreToolUse hook on Bash — blocks `git push` targeting main.
# Rationale: CLAUDE.md regola 1. All changes go through a PR; merging is the
# user's prerogative. Tag pushes (vX.Y.Z) are allowed because they don't
# reference main.

set -euo pipefail

cmd=$(jq -r '.tool_input.command // ""')

# Strip leading "cd <dir> && " noise so the regex sees the actual git command.
normalized=$(printf '%s' "$cmd" | tr -s ' ')

if printf '%s' "$normalized" | grep -qE 'git[[:space:]]+push([[:space:]]+[^&|;]*)?[[:space:]](main|HEAD:main)(\b|$)'; then
  echo "Blocked by .claude/hooks/block-push-to-main.sh:" >&2
  echo "  Direct push to main is forbidden (CLAUDE.md regola 1). Always go through a PR." >&2
  echo "  If this is intentional (release tag, hotfix authorized by the user), bypass via" >&2
  echo "  a manual shell outside Claude, or temporarily disable this hook." >&2
  exit 2
fi

exit 0
