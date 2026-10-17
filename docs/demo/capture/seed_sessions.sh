#!/usr/bin/env bash
# Seed OpenCode session history for the phone demo.
#
# The phone's session menu lists the five most recent agent sessions, newest
# first. Create one real OpenCode session per title below, oldest first, so
# the menu reads exactly in display order.
#
# Reuse the existing history when the five newest sessions already carry these
# titles and point at the seed workspace, so repeated capture runs do not
# stack up duplicate rows below the menu.
#
# Seed against the main checkout rather than the worktree running the capture:
# a session opened on camera must still load after that worktree is removed.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../../.." && pwd)
SEED_LOG="${SEED_LOG:-/dev/null}"

main_worktree() {
  git -C "$REPO_ROOT" worktree list --porcelain 2>/dev/null |
    sed -n 's/^worktree //p' |
    head -n 1
}

SEED_CWD="${SEED_CWD:-$(main_worktree || true)}"
SEED_CWD="${SEED_CWD:-$REPO_ROOT}"

# Display order, newest first. This is what the phone's session menu shows.
TITLES=(
  "Cat Therapist near me"
  "Does KGB use cats?"
  "Why does my cat hate me?"
  "Cat treat safe for humans?"
  "Russian for dummies"
)

# Fails unless the newest sessions are exactly these titles in this order and
# live in the seed workspace.
top_sessions_match() {
  (cd "$SEED_CWD" && opencode api GET /api/session) |
    python3 -c '
import json
import sys

cwd = sys.argv[1]
titles = sys.argv[2:]
expected = [(title, cwd) for title in titles]
sessions = json.load(sys.stdin).get("data", [])
sessions.sort(key=lambda session: session.get("time", {}).get("updated", 0), reverse=True)
actual = [
    (session.get("title"), (session.get("location") or {}).get("directory"))
    for session in sessions[: len(expected)]
]
if actual == expected:
    sys.exit(0)

print("expected the five newest sessions to be:", file=sys.stderr)
for title, directory in expected:
    print(f"  {title!r} in {directory}", file=sys.stderr)
print("found:", file=sys.stderr)
for title, directory in actual:
    print(f"  {title!r} in {directory}", file=sys.stderr)
sys.exit(1)
' "$SEED_CWD" "${TITLES[@]}"
}

echo "checking OpenCode session history in $SEED_CWD"
if top_sessions_match 2>/dev/null; then
  echo "session history already seeded"
  exit 0
fi

# Oldest first: the last session created lands at the top of the menu.
for ((index = ${#TITLES[@]} - 1; index >= 0; index--)); do
  title="${TITLES[$index]}"
  # Pass the prompt as separate words. Passed as one argument, opencode
  # records the user message wrapped in literal quotes.
  read -r -a prompt <<<"$title"
  echo "seeding session: $title"
  if ! (cd "$SEED_CWD" && opencode run --auto --title "$title" "${prompt[@]}" >>"$SEED_LOG" 2>&1); then
    echo "opencode run failed for \"$title\"; see $SEED_LOG" >&2
    exit 1
  fi
done

if ! top_sessions_match; then
  echo "seeded sessions are not the five newest; refusing to run the capture" >&2
  exit 1
fi

echo "session history seeded"
