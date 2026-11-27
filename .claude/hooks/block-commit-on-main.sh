#!/usr/bin/env bash
# PreToolUse hook on Bash — blocks `git commit` while the current branch is main.
# Rationale: CLAUDE.md regola 1. block-push-to-main.sh alone leaves a dirty
# state: a commit created on main can't be pushed and has to be surgically
# moved to a branch afterwards. Blocking at commit time keeps main clean.

set -euo pipefail

payload=$(cat)
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')
# Il branch si legge dal cwd della sessione, non dalla directory da cui parte
# l'hook: Claude Code lo lancia dalla root del progetto, che per una sessione
# in worktree è il checkout principale (su main). Leggerlo da lì bloccava
# ogni commit fatto da un worktree. Cwd assente o sparito → directory corrente.
session_cwd=$(printf '%s' "$payload" | jq -r '.cwd // ""')
[ -d "$session_cwd" ] || session_cwd=.

# Strip repeated whitespace so the regex sees the actual git command.
normalized=$(printf '%s' "$cmd" | tr -s ' ')

# Detect a `commit` git subcommand, tolerating global options between `git`
# and the subcommand (`-C <dir>`, `-c k=v`, `--git-dir=…`) — same pattern as
# block-push-to-main.sh (bypass class found 2026-07-02).
if printf '%s' "$normalized" | grep -qE 'git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+commit([[:space:]]|$)'; then
  # Empty output = detached HEAD (rebase, bisect) → not "on main", allow.
  branch=$(git -C "$session_cwd" branch --show-current 2>/dev/null || true)
  if [ "$branch" = "main" ]; then
    echo "Blocked by .claude/hooks/block-commit-on-main.sh:" >&2
    echo "  Committing directly on main is forbidden (CLAUDE.md regola 1)." >&2
    echo "  Create a feature branch first: git checkout -b <branch-name>" >&2
    exit 2
  fi
fi

exit 0
