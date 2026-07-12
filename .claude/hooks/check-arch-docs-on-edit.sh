#!/usr/bin/env bash
# PostToolUse hook on Edit|Write — runs arch:check right after an edit to the
# meta docs (docs/architecture/, .claude/skills/, CLAUDE.md).
# Rationale: CLAUDE.md regola 26. Instead of relying on the model remembering
# to run `npm run arch:check` before closing the task, a dead path reference
# is reported as immediate feedback on the very edit that introduced it.

set -euo pipefail

file=$(jq -r '.tool_input.file_path // ""')
if [ -z "$file" ]; then
  exit 0
fi

# Only meta markdown files are guarded; anything else is out of scope.
case "$file" in
*/docs/architecture/*.md | docs/architecture/*.md) ;;
*/.claude/skills/*.md | .claude/skills/*.md) ;;
*/CLAUDE.md | CLAUDE.md) ;;
*) exit 0 ;;
esac

# Repo root = two levels above this hook (.claude/hooks/ → repo root); the
# validator resolves paths against its cwd.
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
if ! output=$(cd "$ROOT" && node scripts/check-architecture-docs.mjs 2>&1); then
  echo "arch:check failed after editing $file (CLAUDE.md regola 26):" >&2
  printf '%s\n' "$output" >&2
  echo "Fix the dead reference above before moving on." >&2
  exit 2
fi

exit 0
