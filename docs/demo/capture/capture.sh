#!/usr/bin/env bash
# Record the Harold phone demo with two paired Harold instances.
#
# The capture owns the full environment:
#   - instance 1 on 127.0.0.1:3847 with cursor and pi-acp
#   - instance 2 on 127.0.0.1:3848 with opencode
# Both use fresh data dirs, fresh DBs, and stable workspace roots outside the
# data dirs. The user's real ~/.harold daemon is never stopped.
#
# The emulator's back camera plays a staged clip with instance 1's live pairing
# QR pasted over the laptop screen. The phone pairs by camera first, then pairs
# instance 2 by typing its endpoint and code.
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
CAMERA_SOURCE="${CAMERA_SOURCE:-$SCRIPT_DIR/assets/virtual-qr-code-webcam.mp4}"
CAMERA_FILE="$WORK/camera-live.mp4"
SHORT_TMP="${HAROLD_TMP:-/tmp/opencode}"
CAMERA_FEED="$SHORT_TMP/harold-camera-live.mp4"
EMULATOR_LOG="$WORK/emulator.log"
LOG="$WORK/capture.log"
MARKS="$WORK/marks.log"
DEFAULT_PROMPT="Do you think my cat's behaviour is strange?"
PROMPT="${PROMPT:-$DEFAULT_PROMPT}"
SEED_MODEL="${SEED_MODEL:-deepseek/deepseek-flash}"
PI_MODEL="${PI_MODEL:-deepseek/deepseek-flash}"
WORK_SESSION_TITLE="${WORK_SESSION_TITLE:-Cat food budget}"
SESSION_TITLE="${SESSION_TITLE:-Cat Therapist near me}"
VOICE_INPUT="${VOICE_INPUT:-$SCRIPT_DIR/assets/voice-input.wav}"
VOICE_WAV="$SHORT_TMP/harold-qemu-in.wav"
VOICE_WAV_OUT="$SHORT_TMP/harold-qemu-out.wav"
AUDIO_SHIM_SOURCE="$SCRIPT_DIR/audio-env-shim.c"
AUDIO_SHIM="$SHORT_TMP/harold-audio-env-shim.so"

INSTANCE1_PORT="${HAROLD_INSTANCE1_PORT:-3847}"
INSTANCE2_PORT="${HAROLD_INSTANCE2_PORT:-3848}"
INSTANCE1_DATA_DIR="${HAROLD_INSTANCE1_DATA_DIR:-$HOME/.harold-demo-$INSTANCE1_PORT}"
INSTANCE2_DATA_DIR="${HAROLD_INSTANCE2_DATA_DIR:-$HOME/.harold-demo-$INSTANCE2_PORT}"
INSTANCE1_WORKSPACES="${HAROLD_INSTANCE1_WORKSPACES:-$HOME/harold-demo-workspaces/$INSTANCE1_PORT}"
INSTANCE2_WORKSPACES="${HAROLD_INSTANCE2_WORKSPACES:-$HOME/harold-demo-workspaces/$INSTANCE2_PORT}"
INSTANCE1_DATA_DIR="${INSTANCE1_DATA_DIR/#\~/$HOME}"
INSTANCE2_DATA_DIR="${INSTANCE2_DATA_DIR/#\~/$HOME}"
INSTANCE1_WORKSPACES="${INSTANCE1_WORKSPACES/#\~/$HOME}"
INSTANCE2_WORKSPACES="${INSTANCE2_WORKSPACES/#\~/$HOME}"
INSTANCE1_ENDPOINT="http://127.0.0.1:$INSTANCE1_PORT"
INSTANCE2_ENDPOINT="http://127.0.0.1:$INSTANCE2_PORT"

export PYTHONPYCACHEPREFIX="$WORK/pycache"

mkdir -p "$WORK" "$PUBLIC" "$SHORT_TMP" "$SLICES"
: >"$LOG"
: >"$MARKS"
: >"$SLICE_MANIFEST"

log() { printf '%s %s\n' "$(date +%s.%3N)" "$*" | tee -a "$LOG"; }
die() { echo "capture.sh: $*" >&2; exit 1; }

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

harold1() {
  (cd "$ROOT" && \
    HAROLD_DATA_DIR="$INSTANCE1_DATA_DIR" \
    HAROLD_HOST=127.0.0.1 \
    HAROLD_PORT="$INSTANCE1_PORT" \
    bun run dev "$@")
}

harold2() {
  (cd "$ROOT" && \
    HAROLD_DATA_DIR="$INSTANCE2_DATA_DIR" \
    HAROLD_HOST=127.0.0.1 \
    HAROLD_PORT="$INSTANCE2_PORT" \
    bun run dev "$@")
}

write_settings() {
  local data_dir=$1
  local port=$2
  local workspace_root=$3
  cat >"$data_dir/settings.yml" <<EOF
advertisedUrl: http://127.0.0.1:$port
advertisedUrlEnabled: true
bindHost: 127.0.0.1
bindPort: $port
logLevel: info
logPath: null
allowedRoots:
  - "$workspace_root"
EOF
}

ensure_clone() {
  local url=$1
  local path=$2
  if [[ -d "$path/.git" ]]; then
    log "git_pull $path"
    git -C "$path" pull --ff-only >>"$LOG" 2>&1 \
      || die "git pull failed in $path"
    return
  fi
  [[ ! -e "$path" ]] || die "$path exists but is not a git clone"
  log "git_clone $path"
  git clone "$url" "$path" >>"$LOG" 2>&1 \
    || die "git clone failed for $url"
}

ensure_local_repo() {
  local path=$1
  local name=$2
  mkdir -p "$path"
  if [[ ! -d "$path/.git" ]]; then
    log "git_init $path"
    git -C "$path" init -b main >>"$LOG" 2>&1
  fi
  if ! git -C "$path" rev-parse --verify HEAD >/dev/null 2>&1; then
    if [[ -z "$(find "$path" -mindepth 1 -maxdepth 1 ! -name .git -print -quit)" ]]; then
      printf '# %s\n' "$name" >"$path/README.md"
    fi
    git -C "$path" add -A >>"$LOG" 2>&1
    git -C "$path" \
      -c user.name="Harold Demo" \
      -c user.email="harold-demo@example.invalid" \
      commit -m "Initial commit" >>"$LOG" 2>&1 \
      || die "could not create the initial commit in $path"
  fi
}

register_workspace() {
  local command=$1
  local path=$2
  "$command" workspace add "$path" >>"$LOG" 2>&1 \
    || die "workspace add failed for $path"
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

wait_for_status() {
  local name=$1
  local endpoint=$2
  for _ in $(seq 1 80); do
    if curl -sf "$endpoint/v1/status" >/dev/null 2>&1; then
      return
    fi
    sleep 0.5
  done
  die "$name did not answer $endpoint/v1/status"
}

stop_demo_daemon() {
  local data_dir=$1
  log "daemon_stop $data_dir"
  (cd "$ROOT" && env -u HAROLD_HOST -u HAROLD_PORT \
    HAROLD_DATA_DIR="$data_dir" bun run dev stop) 2>&1 | tee -a "$LOG" || true
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

exact = {
    "pair_idle",
    "pair_tap",
    "scanner_open",
    "scan_wait",
    "first_name",
    "first_confirm",
    "paired",
    "pair_another_open",
    "pair_another_manual",
    "pair_another_details",
    "pair_another_claim",
    "pair_another_name",
    "pair_another_confirm",
    "pair_another_done",
    "session_menu_open",
    "session_see_all",
    "session_pick",
    "session_chat",
    "session_menu_reopen",
    "new_session",
    "workspace_open_work",
    "workspace_pick_work",
    "agent_open_work",
    "agent_pick_work",
    "workspace_open_couch",
    "workspace_pick_couch",
    "agent_open_couch",
    "agent_pick_couch",
    "continue",
    "session_create_wait",
    "model_open",
    "model_search",
    "model_pick",
    "mode_plan",
    "mode_build",
    "slash_open",
    "slash_close",
    "prompt_focus",
    "prompt_type",
    "photo_open",
    "photo_pick",
    "photo_add",
    "file_open",
    "file_pick",
    "send",
    "reply_wait",
    "reply",
    "voice_open",
    "voice_expand",
    "voice_transcript",
    "voice_send",
    "voice_reply_wait",
    "voice_reply",
}

missing = sorted(exact - names)
if missing:
    raise SystemExit(f"missing slices: {', '.join(missing)}")
if not any(name.startswith("effort_") for name in names):
    raise SystemExit("missing effort_* slices")

print(f"slices: {len(entries)} recorded, {len(exact)} required actions present")
PY
}

# --- Preflight --------------------------------------------------------------

log "preflight"
for tool in bun opencode adb node ffmpeg ffprobe python3 cc sqlite3 git curl pi agent systemctl systemd-run; do
  command -v "$tool" >/dev/null || die "$tool is not on PATH"
done
command -v java >/dev/null || [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]] \
  || die "java not found (set JAVA_HOME)"
[[ -x "$ROOT/apps/android/gradlew" ]] || die "android gradlew not found"
[[ -x "$EMULATOR" ]] || die "emulator not found at $EMULATOR (set EMULATOR)"
[[ -f "$CAMERA_SOURCE" ]] || die "camera source not found at $CAMERA_SOURCE (set CAMERA_SOURCE)"
[[ -f "$VOICE_INPUT" ]] || die "voice input not found at $VOICE_INPUT (set VOICE_INPUT)"
[[ -f "$AUDIO_SHIM_SOURCE" ]] || die "audio shim source not found at $AUDIO_SHIM_SOURCE"
[[ -f "$SCRIPT_DIR/assets/cats.zip" ]] || die "cats.zip not found"
[[ -f "$SCRIPT_DIR/assets/cat-diary.txt" ]] || die "cat-diary.txt not found"
(cd "$ROOT" && node -e 'require("qrcode")') >/dev/null 2>&1 \
  || die "node module qrcode is not available in $ROOT"
[[ "$INSTANCE1_WORKSPACES" != "$INSTANCE1_DATA_DIR"/* ]] \
  || die "instance 1 workspace root must be outside the data dir"
[[ "$INSTANCE2_WORKSPACES" != "$INSTANCE2_DATA_DIR"/* ]] \
  || die "instance 2 workspace root must be outside the data dir"

agent status >/dev/null 2>&1 || die "Cursor agent is not authenticated"
pi auth check --model "$PI_MODEL" >/dev/null 2>&1 || die "pi is not ready for $PI_MODEL"
opencode auth list >/dev/null 2>&1 || die "OpenCode is not authenticated"
GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10" \
  git ls-remote git@github.com:codenamegary/harold.git HEAD >/dev/null 2>&1 \
  || die "cannot reach git@github.com:codenamegary/harold.git"
GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10" \
  git ls-remote git@personal:codenamegary/yuekbox.git HEAD >/dev/null 2>&1 \
  || die "cannot reach git@personal:codenamegary/yuekbox.git"
log "repo_commit $(git -C "$ROOT" rev-parse --short HEAD)"

# Stop only the demo instances. The real ~/.harold daemon is left alone.
stop_demo_daemon "$INSTANCE1_DATA_DIR"
stop_demo_daemon "$INSTANCE2_DATA_DIR"
if port_open "$INSTANCE1_PORT"; then
  die "port $INSTANCE1_PORT is still in use; stop that process and retry"
fi
if port_open "$INSTANCE2_PORT"; then
  die "port $INSTANCE2_PORT is still in use; stop that process and retry"
fi

log "instance1_prepare host=127.0.0.1 port=$INSTANCE1_PORT data=$INSTANCE1_DATA_DIR workspaces=$INSTANCE1_WORKSPACES"
log "instance2_prepare host=127.0.0.1 port=$INSTANCE2_PORT data=$INSTANCE2_DATA_DIR workspaces=$INSTANCE2_WORKSPACES"
rm -rf "$INSTANCE1_DATA_DIR" "$INSTANCE2_DATA_DIR"
mkdir -p "$INSTANCE1_DATA_DIR" "$INSTANCE2_DATA_DIR"
mkdir -p "$INSTANCE1_WORKSPACES" "$INSTANCE2_WORKSPACES"
write_settings "$INSTANCE1_DATA_DIR" "$INSTANCE1_PORT" "$INSTANCE1_WORKSPACES"
write_settings "$INSTANCE2_DATA_DIR" "$INSTANCE2_PORT" "$INSTANCE2_WORKSPACES"

# --- Workspaces and agents --------------------------------------------------

ensure_clone "git@github.com:codenamegary/harold.git" "$INSTANCE1_WORKSPACES/harold"
ensure_local_repo "$INSTANCE1_WORKSPACES/cat-screensaver" "cat-screensaver"
ensure_local_repo "$INSTANCE1_WORKSPACES/fish-screensaver-for-cats" "fish-screensaver-for-cats"
ensure_local_repo "$INSTANCE1_WORKSPACES/meow" "meow"

ensure_clone "git@personal:codenamegary/yuekbox.git" "$INSTANCE2_WORKSPACES/yuekbox"
ensure_local_repo "$INSTANCE2_WORKSPACES/pet-me-human" "pet-me-human"
ensure_local_repo "$INSTANCE2_WORKSPACES/thesis-research" "thesis-research"
ensure_local_repo "$INSTANCE2_WORKSPACES/qbert-nextgen" "qbert-nextgen"
ensure_local_repo "$INSTANCE2_WORKSPACES/elt-meeting-agenda" "elt-meeting-agenda"

harold1 agent enable cursor
harold1 agent enable pi-acp
harold2 agent enable opencode

register_workspace harold1 "$INSTANCE1_WORKSPACES/harold"
register_workspace harold1 "$INSTANCE1_WORKSPACES/cat-screensaver"
register_workspace harold1 "$INSTANCE1_WORKSPACES/fish-screensaver-for-cats"
register_workspace harold1 "$INSTANCE1_WORKSPACES/meow"
register_workspace harold2 "$INSTANCE2_WORKSPACES/yuekbox"
register_workspace harold2 "$INSTANCE2_WORKSPACES/pet-me-human"
register_workspace harold2 "$INSTANCE2_WORKSPACES/thesis-research"
register_workspace harold2 "$INSTANCE2_WORKSPACES/qbert-nextgen"
register_workspace harold2 "$INSTANCE2_WORKSPACES/elt-meeting-agenda"

# One pi ACP session on the Work Harold. This is the second badge in the
# session history. It is older than the five pinned OpenCode sessions.
log "work_session_seed"
WORK_SESSION_LOG="$WORK/work-session-seed.log" \
  bash "$SCRIPT_DIR/seed_work_session.sh" \
  "$INSTANCE1_WORKSPACES/harold" "$WORK_SESSION_TITLE" "$PI_MODEL" 2>&1 | tee -a "$LOG"

# Five OpenCode sessions on the Couch Harold, in the yuekbox workspace.
log "sessions_seed_start model=$SEED_MODEL cwd=$INSTANCE2_WORKSPACES/yuekbox"
SEED_LOG="$WORK/session-seed.log" SEED_MODEL="$SEED_MODEL" \
  SEED_CWD="$INSTANCE2_WORKSPACES/yuekbox" \
  bash "$SCRIPT_DIR/seed_sessions.sh" 2>&1 | tee -a "$LOG"
log "sessions_seeded"

# --- Daemons ----------------------------------------------------------------

log "daemon_start_instance1"
harold1 start
log "daemon_start_instance2"
harold2 start
wait_for_status "instance 1" "$INSTANCE1_ENDPOINT"
wait_for_status "instance 2" "$INSTANCE2_ENDPOINT"
log "daemons_ready"

# Instance 1's QR is baked into the camera clip. Instance 2's code is issued by
# drive_phone.py immediately before the manual pairing beat.
log "pair_issue_instance1"
PAIR_JSON=$(harold1 pair --no-wait --json --endpoint loopback | tail -n 1)
(
  cd "$ROOT"
  node -e '
    const qr = require("qrcode");
    const pairing = JSON.parse(process.argv[1]);
    if (!pairing.code || !pairing.qrUri) {
      console.error("pair json missing code or qrUri");
      process.exit(1);
    }
    qr.toFile(process.argv[2], pairing.qrUri, { width: 1024, margin: 4 }).then(() => {
      process.stdout.write(pairing.code);
    });
  ' "$PAIR_JSON" "$WORK/qr-live.png"
) >"$WORK/pair-code.txt"
CODE=$(cat "$WORK/pair-code.txt")
[[ -n "$CODE" ]] || die "no pairing code captured"
log "code_seen $CODE"

log "camera_compose"
node "$SCRIPT_DIR/compose_camera.mjs" "$CAMERA_SOURCE" "$WORK/qr-live.png" "$CAMERA_FILE"
cp "$CAMERA_FILE" "$CAMERA_FEED"
log "camera_composed"

# --- Emulator ---------------------------------------------------------------

log "voice_prepare"
ffmpeg -hide_banner -loglevel error -y -i "$VOICE_INPUT" \
  -af "adelay=1500:all=1,apad=pad_dur=30" \
  -ar 44100 -ac 2 -c:a pcm_s16le -map_metadata -1 -fflags +bitexact \
  "$VOICE_WAV"
cc -shared -fPIC -O2 -o "$AUDIO_SHIM" "$AUDIO_SHIM_SOURCE"
log "voice_prepared"

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
  --setenv=LD_PRELOAD="$AUDIO_SHIM" \
  --setenv=HAROLD_WAV_IN="$VOICE_WAV" \
  --setenv=HAROLD_WAV_OUT="$VOICE_WAV_OUT" \
  "$EMULATOR" -avd "$AVD" -wipe-data -allow-host-audio \
  -gpu swiftshader_indirect -no-snapshot \
  -feature VideoPlayback -camera-back "videofile:$CAMERA_FEED" \
  -camera-front emulated
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

SERIAL="$SERIAL" WORK="$WORK" bash "$SCRIPT_DIR/push_assets.sh" 2>&1 | tee -a "$LOG"
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
adb_retry -s "$SERIAL" shell pm grant harold.android.debug android.permission.RECORD_AUDIO
adb_retry -s "$SERIAL" reverse "tcp:$INSTANCE1_PORT" "tcp:$INSTANCE1_PORT" >/dev/null
adb_retry -s "$SERIAL" reverse "tcp:$INSTANCE2_PORT" "tcp:$INSTANCE2_PORT" >/dev/null
adb -s "$SERIAL" reverse --list | grep -q "tcp:$INSTANCE1_PORT tcp:$INSTANCE1_PORT" \
  || die "adb reverse for port $INSTANCE1_PORT is not set"
adb -s "$SERIAL" reverse --list | grep -q "tcp:$INSTANCE2_PORT tcp:$INSTANCE2_PORT" \
  || die "adb reverse for port $INSTANCE2_PORT is not set"

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
PROMPT="$PROMPT" \
MARKS="$MARKS" \
SLICES="$SLICE_MANIFEST" \
HAROLD_ROOT="$ROOT" \
INSTANCE2_DATA_DIR="$INSTANCE2_DATA_DIR" \
INSTANCE2_PORT="$INSTANCE2_PORT" \
INSTANCE2_ENDPOINT="$INSTANCE2_ENDPOINT" \
SESSION_TITLE="$SESSION_TITLE" \
  python3 "$SCRIPT_DIR/drive_phone.py" 2>&1 | tee "$WORK/driver.log"
DRIVER_STATUS=${PIPESTATUS[0]:-1}
set -eu
log "driver_exit $DRIVER_STATUS"

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
  log "build_capture"
  WORK="$WORK" PUBLIC="$PUBLIC" python3 "$SCRIPT_DIR/build_capture.py" 2>&1 | tee -a "$LOG"
fi

adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command exit >/dev/null 2>&1 || true
log "capture_complete"
exit "$DRIVER_STATUS"
