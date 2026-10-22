#!/usr/bin/env bash
# Seed one pi ACP session in the Work workspace.
#
# The phone's session history needs a session on the Work Harold so both
# Harold badges appear. pi writes one JSONL session file per conversation and
# records --name as the session title. Reuse an existing session with the same
# workspace and title so repeated captures do not stack duplicate rows.
set -euo pipefail

WORKSPACE="${1:?workspace path}"
NAME="${2:-Cat food budget}"
MODEL="${3:-deepseek/deepseek-flash}"
LOG="${WORK_SESSION_LOG:-/dev/null}"
PROMPT="${WORK_SESSION_PROMPT:-Reply with the single word meow.}"

[[ -d "$WORKSPACE" ]] || {
  echo "seed_work_session.sh: workspace not found: $WORKSPACE" >&2
  exit 1
}

# Keep the Work history deterministic. Remove pi sessions whose header cwd is
# this demo workspace, plus probe sessions left under the capture scratch.
# Other workspaces are untouched.
python3 - "$WORKSPACE" <<'PY'
import json
import pathlib
import sys

workspace = sys.argv[1]
root = pathlib.Path.home() / ".pi" / "agent" / "sessions"
if not root.is_dir():
    raise SystemExit(0)

removed = 0
for path in sorted(root.glob("*/*.jsonl")):
    try:
        with path.open(encoding="utf-8") as handle:
            header = json.loads(handle.readline())
    except (OSError, json.JSONDecodeError):
        continue
    cwd = header.get("cwd") or ""
    if cwd == workspace or cwd.startswith("/tmp/opencode/"):
        path.unlink()
        removed += 1
if removed:
    print(f"removed {removed} old pi session(s) for {workspace}")
PY

echo "seeding work session: $NAME in $WORKSPACE"
if ! (cd "$WORKSPACE" && pi --name "$NAME" -p "$PROMPT" --model "$MODEL") >>"$LOG" 2>&1; then
  echo "pi failed to seed the work session; see $LOG" >&2
  exit 1
fi

echo "work session seeded: $NAME"
