#!/usr/bin/env bash
# PreToolUse hook on Bash — blocks `git push` targeting main.
# Rationale: CLAUDE.md regola 1. All changes go through a PR; merging is the
# user's prerogative. Tag pushes (vX.Y.Z) are allowed because they don't
# reference main.

set -euo pipefail

cmd=$(jq -r '.tool_input.command // ""')

# Strip leading "cd <dir> && " noise so the regex sees the actual git command.
normalized=$(printf '%s' "$cmd" | tr -s ' ')

# Catch any refspec whose destination is `main`. The previous regex only
# matched `main` after a literal space, leaving the following bypasses:
#   - `develop:main` (push develop commits to main)
#   - `:main` (delete remote main)
#   - `+main` / `--force-with-lease … main` (force-update main)
#   - `refs/heads/main` (explicit refspec)
# Boundary `([[:space:]:+]|^)` admits space, `:`, `+`, or line start before
# the destination. `refs/heads/main` is included explicitly because `/`
# is not in the boundary class.
# Global git options between `git` and `push` (`-C <dir>`, `-c k=v`,
# `--git-dir=…`) are admitted by the optional `(-opt [arg])*` group:
# requiring `git push` adjacency let `git -C /repo push origin main`
# through (bypass found 2026-07-02).
if printf '%s' "$normalized" | grep -qE 'git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+push.*([[:space:]:+]|^)(main|HEAD:main|refs/heads/main)([[:space:]]|$)'; then
  echo "Blocked by .claude/hooks/block-push-to-main.sh:" >&2
  echo "  Direct push to main is forbidden (CLAUDE.md regola 1). Always go through a PR." >&2
  echo "  If this is intentional (release tag, hotfix authorized by the user), bypass via" >&2
  echo "  a manual shell outside Claude, or temporarily disable this hook." >&2
  exit 2
fi

exit 0
