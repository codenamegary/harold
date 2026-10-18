#!/usr/bin/env bash
# Seed OpenCode session history for the phone demo.
#
# The phone's session menu lists the five most recent agent sessions, newest
# first. Create one real OpenCode session per title below, then pin their
# update times in display order so the menu reads exactly as declared.
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
OPENCODE_DB=$(cd "$SEED_CWD" && opencode debug paths | awk '$1 == "db" { print $2 }')
[[ -n "$OPENCODE_DB" && -f "$OPENCODE_DB" ]] || {
  echo "could not find the OpenCode database (opencode debug paths)" >&2
  exit 1
}

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

print(f"expected the {len(expected)} newest sessions to be:", file=sys.stderr)
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

# The session IDs come from the JSON stream, not a title lookup: older runs
# reuse the same titles, and a lookup could reorder the wrong row.
declare -A SESSION_IDS
for ((index = ${#TITLES[@]} - 1; index >= 0; index--)); do
  title="${TITLES[$index]}"
  # Pass the prompt as separate words. Passed as one argument, opencode
  # records the user message wrapped in literal quotes.
  read -r -a prompt <<<"$title"
  echo "seeding session: $title"
  if ! output=$(cd "$SEED_CWD" && opencode run --auto --format json --title "$title" \
    "${prompt[@]}" 2>>"$SEED_LOG"); then
    echo "opencode run failed for \"$title\"; see $SEED_LOG" >&2
    exit 1
  fi
  printf '%s\n' "$output" >>"$SEED_LOG"
  session_id=$(printf '%s\n' "$output" | python3 -c '
import json
import sys

session_id = ""
for line in sys.stdin.read().splitlines():
    line = line.strip()
    if not line:
        continue
    try:
        message = json.loads(line)
    except json.JSONDecodeError:
        continue
    if message.get("sessionID"):
        session_id = message["sessionID"]
        break
print(session_id)
')
  [[ -n "$session_id" ]] || {
    echo "opencode run did not report a session id for \"$title\"" >&2
    exit 1
  }
  SESSION_IDS["$title"]="$session_id"
done

# OpenCode's run timestamps can land a few milliseconds out of order. Pin them
# in display order and ten minutes ahead: composing and booting take a few
# minutes, and another active agent session must not jump the menu while the
# emulator comes up.
pairs=()
for title in "${TITLES[@]}"; do
  pairs+=("$title" "${SESSION_IDS[$title]}")
done
python3 - "$OPENCODE_DB" "${pairs[@]}" <<'PY'
import sqlite3
import sys
import time

db = sys.argv[1]
pairs = list(zip(sys.argv[2::2], sys.argv[3::2]))
try:
    connection = sqlite3.connect(db, timeout=30)
    current = connection.execute("select max(time_updated) from session_v2").fetchone()[0] or 0
    base = max(current, int(time.time() * 1000)) + 600_000 + len(pairs)
    for index, (title, session_id) in enumerate(pairs):
        connection.execute(
            "update session_v2 set time_updated = ? where id = ?",
            (base - index, session_id),
        )
        print(f"ordered session: {title}")
    connection.commit()
    connection.close()
except sqlite3.Error as error:
    raise SystemExit(f"could not order seeded sessions: {error}")
PY

if ! top_sessions_match; then
  echo "seeded sessions are not the five newest; refusing to run the capture" >&2
  exit 1
fi

echo "session history seeded"
