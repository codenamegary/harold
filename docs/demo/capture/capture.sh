#!/usr/bin/env bash
# Record the Harold SSH demo.
#
# The whole environment lives in docs/demo/fake-host: a Docker container with
# deterministic git repositories, a fixed SSH host key, password authentication,
# and scripted ACP agents. The phone connects to 127.0.0.1:2223 through
# `adb reverse`, adds the host in the app, and works one feature from plan to
# draft PR against the fake agent. Nothing on the real host or in ~/.harold is
# touched.
#
# The walk is recorded as named slices: drive_phone.py starts one screenrecord
# file per action, from the tap through the wait for the UI to settle. Each
# slice and its taps are published to docs/demo/render/public/slices/, and
# build_capture.py writes capture.json for Remotion to compose. There is no
# stitched video.
#
# Artifacts:
#   docs/demo/render/public/slices/*.mp4
#   docs/demo/render/public/capture.json
#
# Scratch goes to docs/demo/work/capture/.
set -euo pipefail

export DISPLAY="${DISPLAY:-:0}"

SERIAL="${SERIAL:-emulator-5554}"
AVD="${AVD:-agent_server_api34}"
EMULATOR="${EMULATOR:-$HOME/android/emulator/emulator}"
EMULATOR_UNIT="${HAROLD_EMULATOR_UNIT:-harold-capture-${AVD//[^A-Za-z0-9:_.@-]/-}}"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEMO=$(cd "$SCRIPT_DIR/.." && pwd)
ROOT=$(cd "$DEMO/../.." && pwd)
WORK="${WORK:-$DEMO/work/capture}"
PUBLIC="$DEMO/render/public"
SLICES="$WORK/slices"
SLICE_MANIFEST="$WORK/slices.json"
EMULATOR_LOG="$WORK/emulator.log"
LOG="$WORK/capture.log"
MARKS="$WORK/marks.log"
FIXTURE_DIR="$SCRIPT_DIR/fixtures/cat-screensaver"
SPEC_SOURCE="$SCRIPT_DIR/assets/cat-mode.md"
DOCUMENT_SOURCE="$SCRIPT_DIR/assets/cat-diary.txt"

HOST_COMPOSE="$DEMO/fake-host/compose.yml"
HOST_CONTAINER="${HAROLD_DEMO_HOST_CONTAINER:-harold-demo-host}"
SSH_PORT="${HAROLD_DEMO_SSH_PORT:-2223}"
SSH_HOST="${HAROLD_DEMO_SSH_HOST:-127.0.0.1}"
SSH_USER="${HAROLD_DEMO_SSH_USER:-gary}"
SSH_PASSWORD="${HAROLD_DEMO_SSH_PASSWORD:-harold}"
WORKTREE="/home/gary/sites/cat-screensaver-worktrees/cat-mode"

export PYTHONPYCACHEPREFIX="$WORK/pycache"

mkdir -p "$WORK" "$PUBLIC" "$SLICES"
: >"$LOG"
: >"$MARKS"
: >"$SLICE_MANIFEST"

log() { printf '%s %s\n' "$(date +%s.%3N)" "$*" | tee -a "$LOG"; }
die() { echo "capture.sh: $*" >&2; exit 1; }

host_exec() {
  docker exec -u gary "$HOST_CONTAINER" bash -lc "$1"
}

adb_retry() {
  local attempt
  for attempt in $(seq 1 40); do
    if adb "$@"; then
      return 0
    fi
    sleep 1
  done
  echo "adb_retry failed after 40 attempts: adb $*" >&2
  return 1
}

wait_for_device() {
  local state=""
  for _ in $(seq 1 90); do
    state=$(adb -s "$SERIAL" get-state 2>/dev/null | tr -d '\r' || true)
    if [[ "$state" == "device" ]] && adb -s "$SERIAL" shell true >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  die "$SERIAL is not available (adb state: ${state:-none})"
}

port_open() {
  python3 - "$1" <<'PY'
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket()
sock.settimeout(0.3)
try:
    raise SystemExit(0 if sock.connect_ex(("127.0.0.1", port)) == 0 else 1)
finally:
    sock.close()
PY
}

wait_for_ssh() {
  local attempt
  for attempt in $(seq 1 120); do
    if port_open "$SSH_PORT" \
      && docker exec -u gary "$HOST_CONTAINER" test -d "$WORKTREE" >/dev/null 2>&1 \
      && docker exec -u gary "$HOST_CONTAINER" bash -lc 'test -f "$HOME/.harold/agents.json"' >/dev/null 2>&1; then
      return
    fi
    sleep 0.5
  done
  docker logs --tail 60 "$HOST_CONTAINER" >&2 || true
  die "the demo host did not become ready on 127.0.0.1:$SSH_PORT"
}

stop_emulator() {
  local pid
  systemctl --user stop "$EMULATOR_UNIT.service" 2>/dev/null || true
  systemctl --user reset-failed "$EMULATOR_UNIT.service" 2>/dev/null || true
  for pid in $(pgrep -f "qemu-system-x86_64.*-avd $AVD" || true); do
    kill "$pid" 2>/dev/null || true
  done
  for pid in $(pgrep -f "emulator -avd $AVD" || true); do
    kill "$pid" 2>/dev/null || true
  done
  for _ in $(seq 1 30); do
    pgrep -f "qemu-system-x86_64.*-avd $AVD" >/dev/null || return 0
    sleep 1
  done
  die "the $AVD emulator did not stop; kill it and retry"
}

verify_slices() {
  python3 - "$SLICE_MANIFEST" <<'PY'
import json
import sys

manifest_path = sys.argv[1]
entries = json.load(open(manifest_path))
names = {entry["name"] for entry in entries}

required = {
    "home_idle",
    "add_host_tap",
    "setup_top",
    "setup_host",
    "setup_auth",
    "setup_password",
    "setup_test",
    "setup_trust",
    "connected",
    "session_menu_open",
    "new_session",
    "workspace_open",
    "workspace_pick",
    "agent_open",
    "agent_pick",
    "start_session",
    "session_create_wait",
    "mode_plan",
    "prompt_focus",
    "prompt_type",
    "photo_open",
    "photo_pick",
    "photo_add",
    "file_open",
    "file_pick",
    "send",
    "plan_wait",
    "plan_reply",
    "elicitation_open",
    "elicitation_pick",
    "elicitation_submit",
    "mode_build",
    "build_prompt",
    "build_send",
    "build_wait",
    "build_reply",
    "usage",
    "changes_open",
    "changes_branch",
    "changes_file",
    "changes_back",
    "worktrees_open",
    "worktrees_close",
    "pr_prompt",
    "pr_send",
    "pr_wait",
    "pr_reply",
}

missing = sorted(required - names)
if missing:
    raise SystemExit(f"missing slices: {', '.join(missing)}")

print(f"slices: {len(entries)} recorded, {len(required)} required actions present")
PY
}

verify_host_state() {
  host_exec "git -C '$WORKTREE' rev-parse --abbrev-ref HEAD | grep -qx feat/cat-mode" \
    || die "the demo worktree is not on feat/cat-mode"
  host_exec "test \"\$(git -C '$WORKTREE' rev-list --count main..HEAD)\" -ge 1" \
    || die "the demo worktree has no commit above main"
  host_exec "test -z \"\$(git -C '$WORKTREE' status --porcelain)\"" \
    || die "the demo worktree is not clean"
  host_exec "grep -q '\"draft\":true' \"\$HOME/.harold-demo/pull-request.json\"" \
    || die "the fake draft PR was not recorded"
  log "host_state_verified"
}

# --- Preflight --------------------------------------------------------------

log "preflight"
for tool in bun docker git adb node ffmpeg ffprobe python3 curl unzip systemctl systemd-run; do
  command -v "$tool" >/dev/null || die "$tool is not on PATH"
done
command -v java >/dev/null || [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]] \
  || die "java not found (set JAVA_HOME)"
[[ -x "$ROOT/apps/android/gradlew" ]] || die "android gradlew not found"
[[ -x "$EMULATOR" ]] || die "emulator not found at $EMULATOR (set EMULATOR)"
[[ -f "$SPEC_SOURCE" ]] || die "cat-mode.md not found at $SPEC_SOURCE"
[[ -f "$DOCUMENT_SOURCE" ]] || die "cat-diary.txt not found at $DOCUMENT_SOURCE"
[[ -f "$SCRIPT_DIR/assets/cats.zip" ]] || die "cats.zip not found"
[[ -f "$FIXTURE_DIR/package.json" ]] || die "cat-screensaver fixture not found"
[[ -f "$HOST_COMPOSE" ]] || die "fake host compose file not found"
docker compose version >/dev/null 2>&1 || die "docker compose is not available"
log "repo_commit $(git -C "$ROOT" rev-parse --short HEAD)"

# --- Fake host --------------------------------------------------------------

log "host_stop"
docker compose -f "$HOST_COMPOSE" down --remove-orphans >/dev/null 2>&1 || true
log "host_start port=$SSH_PORT"
docker compose -f "$HOST_COMPOSE" up -d --build 2>&1 | tee -a "$LOG"
wait_for_ssh
host_exec "test -d '$WORKTREE'" || die "the demo worktree is missing in the host"
host_exec "test -f \"\$HOME/.harold/workspaces.json\"" || die "workspace state is missing"
log "host_ready"

if [[ "${HOST_ONLY:-0}" == "1" ]]; then
  log "host_only"
  exit 0
fi

# --- Emulator ---------------------------------------------------------------

log "emulator_stop"
stop_emulator
log "emulator_boot"
systemctl --user stop "$EMULATOR_UNIT.service" 2>/dev/null || true
systemctl --user reset-failed "$EMULATOR_UNIT.service" 2>/dev/null || true
systemd-run --user \
  --unit="$EMULATOR_UNIT" \
  --collect \
  --property=Restart=no \
  --property=StandardOutput=append:"$EMULATOR_LOG" \
  --property=StandardError=append:"$EMULATOR_LOG" \
  --setenv=DISPLAY="${DISPLAY:-:0}" \
  --setenv=WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}" \
  --setenv=XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}" \
  --setenv=PATH="$PATH" \
  --setenv=ANDROID_HOME="${ANDROID_HOME:-}" \
  --setenv=ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}" \
  "$EMULATOR" -avd "$AVD" -wipe-data \
  -gpu swiftshader_indirect -no-snapshot \
  -feature VideoPlayback
boot=""
for _ in $(seq 1 150); do
  boot=$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
  [[ "$boot" == "1" ]] && break
  sleep 2
done
[[ "$boot" == "1" ]] || die "emulator did not finish booting (see $EMULATOR_LOG)"
wait_for_device
log "emulator_ready"

log "emulator_dark_mode"
night_output=""
for _ in $(seq 1 10); do
  night_output=$(adb -s "$SERIAL" shell cmd uimode night yes 2>&1 | tr -d '\r' || true)
  [[ "$night_output" == *"Night mode: yes"* ]] && break
  sleep 1
done
[[ "$night_output" == *"Night mode: yes"* ]] \
  || die "could not enable dark mode (got: $night_output)"
log "emulator_settings"
adb_retry -s "$SERIAL" shell settings put global hide_error_dialogs 1 >/dev/null \
  || die "could not hide system error dialogs"
adb_retry -s "$SERIAL" shell settings put global anr_show_background 0 >/dev/null 2>&1 || true

# --- Build and assets -------------------------------------------------------

ANDROID_SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$ANDROID_SDK_DIR" && -x "$EMULATOR" ]]; then
  ANDROID_SDK_DIR=$(cd "$(dirname "$EMULATOR")/.." && pwd)
fi
if [[ -z "$ANDROID_SDK_DIR" && -d "$HOME/Android/Sdk" ]]; then
  ANDROID_SDK_DIR="$HOME/Android/Sdk"
fi
[[ -n "$ANDROID_SDK_DIR" && -d "$ANDROID_SDK_DIR" ]] \
  || die "Android SDK not found (set ANDROID_HOME or create apps/android/local.properties)"
LOCAL_PROPERTIES="$ROOT/apps/android/local.properties"
existing_sdk=$(sed -n 's/^sdk\.dir=//p' "$LOCAL_PROPERTIES" 2>/dev/null | tail -n 1 || true)
if [[ -z "$existing_sdk" || ! -d "$existing_sdk" ]]; then
  printf 'sdk.dir=%s\n' "$ANDROID_SDK_DIR" >"$LOCAL_PROPERTIES"
  log "android_sdk $LOCAL_PROPERTIES"
fi

rm -f "$SLICES"/*.mp4

log "android_build"
if ! (cd "$ROOT/apps/android" && ANDROID_SERIAL="$SERIAL" ./gradlew :app:installDebug --console=plain) \
  >"$WORK/android-build.log" 2>&1; then
  tail -40 "$WORK/android-build.log" >&2
  die "android :app:installDebug failed (see $WORK/android-build.log)"
fi
log "android_installed"

SERIAL="$SERIAL" WORK="$WORK" \
  SPEC_SOURCE="$SPEC_SOURCE" DIARY_SOURCE="$DOCUMENT_SOURCE" \
  bash "$SCRIPT_DIR/push_assets.sh" 2>&1 | tee -a "$LOG"
log "assets_ready"
adb_retry -s "$SERIAL" shell settings put global sysui_demo_allowed 1 >/dev/null
adb_retry -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null 2>&1 || true
adb_retry -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941 >/dev/null 2>&1 || true
adb_retry -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false >/dev/null 2>&1 || true
adb_retry -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4 >/dev/null 2>&1 || true
adb_retry -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false >/dev/null 2>&1 || true

adb_retry -s "$SERIAL" shell 'rm -f /data/local/tmp/harold-demo-*.mp4' >/dev/null
adb_retry -s "$SERIAL" shell pm clear harold.android.debug >/dev/null
adb_retry -s "$SERIAL" shell pm grant harold.android.debug android.permission.CAMERA
adb_retry -s "$SERIAL" shell pm grant harold.android.debug android.permission.POST_NOTIFICATIONS
adb_retry -s "$SERIAL" reverse "tcp:$SSH_PORT" "tcp:$SSH_PORT" >/dev/null
adb -s "$SERIAL" reverse --list | grep -q "tcp:$SSH_PORT tcp:$SSH_PORT" \
  || die "adb reverse for port $SSH_PORT is not set"

adb_retry -s "$SERIAL" shell monkey -p harold.android.debug -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 4
log "app_reset"

if [[ "${SETUP_ONLY:-0}" == "1" ]]; then
  log "setup_only"
  exit 0
fi

# --- Driver -----------------------------------------------------------------

log "driver_start"
set +eu
SERIAL="$SERIAL" \
  MARKS="$MARKS" \
  SLICES="$SLICE_MANIFEST" \
  SSH_HOST="$SSH_HOST" \
  SSH_PORT="$SSH_PORT" \
  SSH_USER="$SSH_USER" \
  SSH_PASSWORD="$SSH_PASSWORD" \
  HOST_CONTAINER="$HOST_CONTAINER" \
  WORKTREE="$WORKTREE" \
  python3 "$SCRIPT_DIR/drive_phone.py" 2>&1 | tee "$WORK/driver.log"
DRIVER_STATUS=${PIPESTATUS[0]:-1}
set -eu
log "driver_exit $DRIVER_STATUS"

if [[ "${SKIP_RECORD:-0}" == "1" ]]; then
  log "skip_record"
  exit "$DRIVER_STATUS"
fi

# Wait for the last screenrecord to finalize before pulling.
for _ in $(seq 1 30); do
  running=$(adb -s "$SERIAL" shell pidof screenrecord 2>/dev/null | tr -d '\r' || true)
  [[ -z "$running" ]] && break
  sleep 1
done
sleep 2

python3 - "$SLICE_MANIFEST" >"$WORK/slice-files.txt" <<'PY'
import json
import sys

for entry in json.load(open(sys.argv[1])):
    print(entry["file"])
PY

while IFS= read -r file; do
  remote="/data/local/tmp/harold-demo-$file"
  pulled=0
  for _ in $(seq 1 5); do
    if adb -s "$SERIAL" pull "$remote" "$SLICES/$file" </dev/null >/dev/null 2>&1 \
      && [[ -s "$SLICES/$file" ]]; then
      pulled=1
      break
    fi
    sleep 1
  done
  [[ "$pulled" == "1" ]] || die "could not pull slice $file from $SERIAL"
done <"$WORK/slice-files.txt"

SLICE_COUNT=$(find "$SLICES" -maxdepth 1 -name '*.mp4' | wc -l)
[[ "$SLICE_COUNT" -gt 0 ]] || die "no slices pulled from $SERIAL"
log "slices_pulled $SLICE_COUNT"

if [[ "$DRIVER_STATUS" -eq 0 ]]; then
  verify_slices
  verify_host_state
  log "build_capture"
  WORK="$WORK" PUBLIC="$PUBLIC" python3 "$SCRIPT_DIR/build_capture.py" 2>&1 | tee -a "$LOG"
fi

adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command exit >/dev/null 2>&1 || true
log "capture_complete"
exit "$DRIVER_STATUS"
