#!/usr/bin/env bash
# Seed OpenCode session history for the phone demo.
#
# The phone's session menu lists the five most recent agent sessions, newest
# first. Create one real OpenCode session per title below, then pin their
# update times in display order so the menu reads exactly as declared.
#
# The demo workspace history is purged before seeding, so repeated captures
# cannot stack duplicate rows below the menu. The main checkout history is
# left alone unless SEED_PURGE=1 is explicit.
#
# Seed against the demo workspace rather than the worktree running the capture:
# a session opened on camera must still load after that worktree is removed.
#
# Every seeded session is pinned to SEED_MODEL (default
# deepseek/deepseek-flash) so the phone composer shows the intended provider
# and model on both fresh and reused history.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../../.." && pwd)
SEED_LOG="${SEED_LOG:-/dev/null}"
SEED_MODEL="${SEED_MODEL:-deepseek/deepseek-flash}"
if ! SEED_MODEL_JSON=$(python3 - "$SEED_MODEL" <<'PY'
import json
import sys

spec = sys.argv[1]
target, has_variant, variant = spec.partition("#")
provider, has_separator, model = target.partition("/")
if not has_separator or not provider or not model or (has_variant and not variant):
    raise SystemExit(f"SEED_MODEL must be provider/model[#variant], got {spec!r}")

payload = {"id": model, "providerID": provider}
if has_variant:
    payload["variant"] = variant
print(json.dumps(payload, separators=(",", ":")))
PY
); then
  echo "invalid SEED_MODEL; use provider/model[#variant]" >&2
  exit 1
fi

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

# The demo workspace is disposable. Purge its OpenCode history so the full
# Sessions screen cannot show sessions from earlier capture runs. The main
# checkout is left alone unless SEED_PURGE=1 is explicit.
if [[ "$SEED_CWD" == "$HOME/harold-demo-workspaces/"* || "${SEED_PURGE:-0}" == "1" ]]; then
  echo "purging OpenCode sessions in $SEED_CWD"
  (cd "$SEED_CWD" && opencode session list) |
    awk -F'\t' 'NF { print $1 }' |
    while IFS= read -r session_id; do
      [[ -n "$session_id" ]] || continue
      (cd "$SEED_CWD" && opencode session delete "$session_id") >>"$SEED_LOG" 2>&1 || true
    done
fi

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

# The session row carries the model the composer reads. Update the five menu
# rows in place so an already-seeded history picks up a changed SEED_MODEL
# without creating duplicate sessions.
set_seeded_models() {
  python3 - "$OPENCODE_DB" "$SEED_CWD" "$SEED_MODEL_JSON" "${TITLES[@]}" <<'PY'
import sqlite3
import sys

db, cwd, model_json, *titles = sys.argv[1:]
connection = sqlite3.connect(db, timeout=30)
rows = connection.execute(
    "select id, title from session_v2 where directory = ? "
    "order by time_updated desc limit ?",
    (cwd, len(titles)),
).fetchall()
if [title for _, title in rows] != titles:
    raise SystemExit(
        "the newest sessions do not match the seed titles; refusing to set the model"
    )
connection.executemany(
    "update session_v2 set model = ? where id = ?",
    [(model_json, session_id) for session_id, _ in rows],
)
connection.commit()
placeholders = ",".join("?" for _ in rows)
models = [
    row[0]
    for row in connection.execute(
        f"select model from session_v2 where id in ({placeholders})",
        [session_id for session_id, _ in rows],
    )
]
if any(model != model_json for model in models):
    raise SystemExit("could not set the seed session model")
connection.close()
print(f"seeded sessions use {model_json}")
PY
}

echo "checking OpenCode session history in $SEED_CWD"
if top_sessions_match 2>/dev/null; then
  set_seeded_models
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
  if ! output=$(cd "$SEED_CWD" && opencode run --auto --model "$SEED_MODEL" \
    --format json --title "$title" "${prompt[@]}" 2>>"$SEED_LOG"); then
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

set_seeded_models

if ! top_sessions_match; then
  echo "seeded sessions are not the five newest; refusing to run the capture" >&2
  exit 1
fi

echo "session history seeded with $SEED_MODEL"
