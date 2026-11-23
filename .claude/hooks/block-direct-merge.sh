#!/usr/bin/env bash
# PreToolUse hook on mcp__github__merge_pull_request — blocks the immediate
# merge. Rationale: CLAUDE.md regola 1. The merge goes through
# `enable_pr_auto_merge`, so GitHub (required checks on main: CI)
# decides when it happens, not the agent.
#
# One exception: a Dependabot PR that is already `clean`. Auto-merge cannot
# be enabled on a PR whose checks have finished, so without this path a green
# Dependabot PR could only be merged by hand. The hook lets the merge through
# only after re-reading the PR from the public GitHub API and finding ALL of:
#   - author dependabot[bot] (type Bot), PR open, base main, head branch in
#     the same repository (not a fork)
#   - mergeable_state == "clean": GitHub's own verdict that every required
#     check is green and the branch is mergeable
#   - merge_method "squash" (the repo is squash-only)
#   - expectedHeadSha equal to the head that was checked, so a commit pushed
#     after the check makes GitHub refuse the merge
# Anything else, including an API error, blocks (fail closed).

set -euo pipefail

block() {
  echo "Blocked by .claude/hooks/block-direct-merge.sh:" >&2
  echo "  $1" >&2
  echo "  merge_pull_request merges now, without waiting for the required checks" >&2
  echo "  (CLAUDE.md regola 1). Use enable_pr_auto_merge (squash): GitHub merges" >&2
  echo "  only when every required check on main is green." >&2
  echo "  Exception: a Dependabot PR in mergeable_state 'clean', merged with" >&2
  echo "  merge_method 'squash' and expectedHeadSha set to its head SHA." >&2
  echo "  If a direct merge is intentional, do it outside Claude." >&2
  exit 2
}

input=$(cat)

owner=$(printf '%s' "$input" | jq -r '.tool_input.owner // empty' 2>/dev/null) || block "unreadable tool input"
repo=$(printf '%s' "$input" | jq -r '.tool_input.repo // empty' 2>/dev/null) || block "unreadable tool input"
pull=$(printf '%s' "$input" | jq -r '.tool_input.pullNumber // empty' 2>/dev/null) || block "unreadable tool input"
method=$(printf '%s' "$input" | jq -r '.tool_input.merge_method // empty' 2>/dev/null) || block "unreadable tool input"
sha=$(printf '%s' "$input" | jq -r '.tool_input.expectedHeadSha // empty' 2>/dev/null) || block "unreadable tool input"

# Validate before the values go into a URL.
name_re='^[A-Za-z0-9_.-]+$'
[[ "$owner" =~ $name_re && "$repo" =~ $name_re ]] || block "invalid owner/repo"
[[ "$pull" =~ ^[0-9]+$ ]] || block "invalid pullNumber"
[ "$method" = "squash" ] || block "merge_method must be 'squash' (got '${method:-unset}')"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || block "expectedHeadSha must be the PR head SHA (40 hex chars)"

pr=$(curl -fsS -m 10 -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/$owner/$repo/pulls/$pull" 2>/dev/null) \
  || block "could not read PR #$pull from the GitHub API"

verdict=$(printf '%s' "$pr" | jq -r --arg full "$owner/$repo" --arg sha "$sha" '
  if .user.login != "dependabot[bot]" or .user.type != "Bot" then "author is not dependabot[bot]"
  elif .state != "open" then "PR is not open"
  elif .base.ref != "main" then "base branch is not main"
  elif .head.repo.full_name != $full then "head branch is not in this repository"
  elif .head.sha != $sha then "expectedHeadSha does not match the PR head"
  elif .mergeable_state != "clean" then "mergeable_state is \(.mergeable_state | tostring), not clean (retry if unknown)"
  else "ok" end' 2>/dev/null) || block "unreadable GitHub API response"

[ "$verdict" = "ok" ] || block "$verdict"

echo "block-direct-merge.sh: allowing clean Dependabot PR #$pull at $sha" >&2
exit 0
