#!/usr/bin/env bash
# PreToolUse hook on Bash — blocks `drizzle-kit generate`.
# Rationale: CLAUDE.md regola 11. The repo uses handwritten migrations after
# 0000_initial.sql; regenerating would conflict with the existing journal.
# See skill: db-migrations.

set -euo pipefail

cmd=$(jq -r '.tool_input.command // ""')

# Catch both the raw binary invocation (`drizzle-kit generate`, also
# `generate:<dialect>`) and the first-party npm/pnpm/yarn/bun script wrapper
# `db:generate` (package.json), which expands to `drizzle-kit generate` but
# would otherwise slip past a regex that only sees the wrapper command.
# Options between binary and subcommand (`--config=x`, `--config x`) are
# admitted by the optional `(-opt [arg])*` group: requiring adjacency let
# `drizzle-kit --config=x generate` through (same bypass class as
# `git -C … push`, found 2026-07-02).
if printf '%s' "$cmd" | grep -qE 'drizzle-kit([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+generate|(npm|pnpm|yarn|bun)([[:space:]]+run)?[[:space:]]+db:generate'; then
  echo "Blocked by .claude/hooks/block-drizzle-generate.sh:" >&2
  echo "  \`drizzle-kit generate\` (and the \`db:generate\` script) is forbidden in this repo (CLAUDE.md regola 11)." >&2
  echo "  Migrations after 0000 are handwritten. See skill 'db-migrations' for the workflow." >&2
  exit 2
fi

exit 0
