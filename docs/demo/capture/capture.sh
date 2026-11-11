#!/usr/bin/env bash
# Record the Harold SSH demo.
#
# The whole environment lives in docs/demo/fake-host: a Docker container with
# deterministic git repositories, a fixed SSH host key, public key
# authentication only, and scripted ACP agents. The phone connects to
# 127.0.0.1:2223 through `adb reverse`, adds the host in the app, and lands in
# the chat screen. Nothing on the real host or in ~/.harold is touched.
#
# The connect act is recorded as named slices by the MCP walk in
# docs/demo/capture/mcp/src/walk.ts. It drives the app through the debug probe's
# tool surface, starts one screenrecord file per on-camera beat, brackets it with
# a sleep/wake calibration blink, converts the device marks to host time through
# paired anchors, and writes slices.json, marks.log and the mp4s.
# build_capture.py then writes capture.json for Remotion to compose. There is no
# stitched video.
#
# Usage:
#   bash docs/demo/capture/capture.sh                 # full run, whole connect act
#   bash docs/demo/capture/capture.sh --only connect_fill
#                                                     # re-record one slice
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
WORKTREE="/home/gary/sites/cat-screensaver-worktrees/cat-mode"

export PYTHONPYCACHEPREFIX="$WORK/pycache"

mkdir -p "$WORK" "$PUBLIC" "$SLICES"
: >"$LOG"
: >"$MARKS"
: >"$SLICE_MANIFEST"

log() { printf '%s %s\n' "$(date +%s.%3N)" "$*" | tee -a "$LOG"; }
die() { echo "capture.sh: $*" >&2; exit 1; }

ONLY=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --only)
      [[ $# -ge 2 ]] || die "--only needs a slice name"
      ONLY="$2"
      shift 2
      ;;
    --only=*)
      ONLY="${1#--only=}"
      shift
      ;;
    *)
      die "unknown argument: $1 (try --only <slice[,slice]>)"
      ;;
  esac
done
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

# The canonical slice list lives in one place: `mcp/src/slices.ts`. Ask that file
# for the recorded names instead of keeping a second hardcoded copy here, so a
# beat added to the plan cannot pass a stale check.
canonical_slices() {
  (cd "$SCRIPT_DIR/mcp" && bun run src/slices.ts --json)
}

verify_slices() {
  canonical_slices >"$WORK/canonical-slices.json" \
    || die "could not read the canonical slice list from mcp/src/slices.ts"
  python3 - "$SLICE_MANIFEST" "$WORK/canonical-slices.json" <<'PY'
import json
import sys

manifest_path, canonical_path = sys.argv[1], sys.argv[2]
entries = json.load(open(manifest_path))
recorded = [entry["name"] for entry in entries]
required = json.load(open(canonical_path))["camera"]

missing = [name for name in required if name not in recorded]
unexpected = [name for name in recorded if name not in required]
if missing:
    raise SystemExit(f"missing slices: {', '.join(missing)}")
if unexpected:
    raise SystemExit(f"unexpected slices: {', '.join(unexpected)}")
if recorded != required:
    raise SystemExit(
        "slices are out of storyboard order: " + ", ".join(recorded)
    )

# The driver numbers and names each file from the same ordered list, so an
# exact sequence check also proves the NNN prefix.
for position, (entry, name) in enumerate(zip(entries, required), start=1):
    if entry["index"] != position:
        raise SystemExit(
            f"slice {name} has index {entry['index']}, expected {position}"
        )
    expected = f"{position:03d}-{name}.mp4"
    if entry["file"] != expected:
        raise SystemExit(f"slice {name} names its file {entry['file']}, expected {expected}")

print(f"slices: {len(recorded)} recorded in order, {len(required)} required")
PY
}

# Only the connect act is recorded now, so the host checks are the ones that act
# can actually produce. It never commits and never opens a PR: those belong to
# the build act, which this cut does not capture (the old drive_phone.py walk
# asserted them at the end of a whole-session run). Keeping them here would fail
# every connect-only capture against a freshly seeded fixture.
verify_host_state() {
  host_exec "git -C '$WORKTREE' rev-parse --abbrev-ref HEAD | grep -qx feat/cat-mode" \
    || die "the demo worktree is not on feat/cat-mode"
  host_exec "test -z \"\$(git -C '$WORKTREE' status --porcelain)\"" \
    || die "the demo worktree is not clean"
  host_exec "test -f \"\$HOME/.harold/workspaces.json\"" \
    || die "the demo host lost its Harold workspace state"
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
log "authorized_keys_reset"
# The fixture starts with no keys and the app generates a new key on every
# `pm clear`, so the key set is emptied once per run. The driver authorises the
# exact key it reads out of the form before it taps `Test connection`.
docker exec "$HOST_CONTAINER" reset-authorized-keys \
  || die "could not reset the demo host authorized keys"
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

# `pm clear` also deletes the app's own external files directory, and
# push_assets.sh deploys the probe's permission-free attachment pair there, so
# the wipe has to happen before the push and never after it.
adb_retry -s "$SERIAL" shell 'rm -f /data/local/tmp/harold-demo-*.mp4' >/dev/null
adb_retry -s "$SERIAL" shell pm clear harold.android.debug >/dev/null
log "app_cleared"

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

# The per-slice sync mark sleeps and wakes the screen, so the lockscreen must
# never intercept the wake and the screen must never time out mid-slice.
adb_retry -s "$SERIAL" shell locksettings set-disabled true >/dev/null \
  || die "could not disable the emulator keyguard"
adb_retry -s "$SERIAL" shell wm dismiss-keyguard >/dev/null 2>&1 || true
adb_retry -s "$SERIAL" shell svc power stayon true >/dev/null \
  || die "could not keep the emulator screen awake"
# `svc power stayon true` only sets stay_on_while_plugged_in, and this emulator
# reports itself on battery (mIsPowered=false, mPlugType=0), so mStayOn stays
# false however long it runs. The timeout that could fake the sync mark is
# mScreenOffTimeoutSetting, so pin that to its maximum as well and assert both.
adb_retry -s "$SERIAL" shell settings put system screen_off_timeout 2147483647 >/dev/null \
  || die "could not extend the emulator screen-off timeout"
keyguard_disabled=$(adb -s "$SERIAL" shell locksettings get-disabled 2>/dev/null | tr -d '\r' || true)
[[ "$keyguard_disabled" == "true" ]] \
  || die "the emulator keyguard is not disabled (got: ${keyguard_disabled:-none})"
stay_on=$(adb -s "$SERIAL" shell settings get global stay_on_while_plugged_in 2>/dev/null | tr -d '\r' || true)
screen_off=$(adb -s "$SERIAL" shell settings get system screen_off_timeout 2>/dev/null | tr -d '\r' || true)
[[ "${stay_on:-0}" =~ ^[0-9]+$ && "${stay_on:-0}" -ne 0 ]] \
  || die "stay_on_while_plugged_in is ${stay_on:-none}; the screen could time out mid-slice"
[[ "${screen_off:-0}" =~ ^[0-9]+$ && "${screen_off:-0}" -ge 300000 ]] \
  || die "screen_off_timeout is ${screen_off:-none}; the screen could time out mid-slice"
log "emulator_sync_ready stay_on=$stay_on screen_off_timeout=$screen_off"
adb_retry -s "$SERIAL" shell pm grant harold.android.debug android.permission.CAMERA
adb_retry -s "$SERIAL" shell pm grant harold.android.debug android.permission.POST_NOTIFICATIONS
# The debug build's `attach_fixture` seam reads the demo photo out of the photo
# library the way the system picker does. The permission is declared in the debug
# manifest only; without the grant the MediaStore query throws and the probe
# refuses the attachment, which stops the plan scene. The fixture directory that
# push_assets.sh fills is the permission-free fallback for the spec.
adb_retry -s "$SERIAL" shell pm grant harold.android.debug android.permission.READ_MEDIA_IMAGES \
  || die "could not grant READ_MEDIA_IMAGES to the debug build"
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
#
# The connect act is driven by the MCP walk, so the host needs two things the
# uiautomator driver never did: the probe's loopback port forwarded, and the
# per-start token the debug APK prints to logcat.

PROBE_PORT=7391

probe_token() {
  adb -s "$SERIAL" logcat -d -s HaroldProbe:I 2>/dev/null \
    | sed -n 's/.*listening host=127\.0\.0\.1 port=[0-9]* token=\([0-9a-f][0-9a-f]*\).*/\1/p' \
    | tail -n 1
}

log "probe_forward"
adb -s "$SERIAL" forward --remove "tcp:$PROBE_PORT" >/dev/null 2>&1 || true
adb_retry -s "$SERIAL" forward "tcp:$PROBE_PORT" "tcp:$PROBE_PORT" >/dev/null \
  || die "could not forward tcp:$PROBE_PORT to the device"

PROBE_TOKEN=""
for _ in $(seq 1 60); do
  PROBE_TOKEN=$(probe_token || true)
  [[ -n "$PROBE_TOKEN" ]] && break
  sleep 1
done
[[ -n "$PROBE_TOKEN" ]] \
  || die "the probe never announced a token in logcat (tag HaroldProbe)"
log "probe_token_ready"

driver_args=()
if [[ -n "$ONLY" ]]; then
  driver_args+=(--only "$ONLY")
fi

log "driver_start${ONLY:+ only=$ONLY}"
set +eu
(
  cd "$SCRIPT_DIR/mcp" &&
    ANDROID_SERIAL="$SERIAL" \
      HAROLD_PROBE_TOKEN="$PROBE_TOKEN" \
      HAROLD_DEMO_HOST="$SSH_HOST" \
      HAROLD_DEMO_SSH_PORT="$SSH_PORT" \
      HAROLD_DEMO_SSH_USER="$SSH_USER" \
      HAROLD_DEMO_NAME="${HAROLD_DEMO_NAME:-Demo host}" \
      HAROLD_DEMO_CONTAINER="$HOST_CONTAINER" \
      HAROLD_TYPE_GAP_MS="${HAROLD_TYPE_GAP_MS:-80}" \
      bun run src/walk.ts \
        --out "$WORK" \
        --emulator-serial "$SERIAL" \
        ${driver_args[@]+"${driver_args[@]}"}
) 2>&1 | tee "$WORK/driver.log"
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

# `screenrecord` writes a frame only when the display changes, so a static slice
# arrives as a variable-frame-rate file of ~1.5 fps: on the empty form, whole
# seconds pass with no frame at all. `build_capture.py` locates each calibration
# blink with two detectors that must agree to within 80 ms, and they disagree by
# exactly the gap between the last black frame and the first frame after the
# wake. Normalising to CFR 60 here does not move a single timestamp: duplicate
# frames fill the gaps the encoder never emitted, so the drift the build measures
# is still the encoder's own. This has to happen before every build, including a
# `--only` re-record, because a full build mixes fresh and older slices.
log "slices_normalise"
while IFS= read -r file; do
  source="$SLICES/$file"
  normalised="$SLICES/.cfr-$file"
  # `</dev/null`: ffmpeg reads stdin for its interactive commands, and without
  # this it swallowed the rest of the file list out of the loop.
  ffmpeg -v error -y -i "$source" -map 0:v:0 -an \
    -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p \
    -fps_mode cfr -r 60 "$normalised" </dev/null \
    || die "could not normalise $file to CFR 60"
  mv "$normalised" "$source"
done <"$WORK/slice-files.txt"
log "slices_cfr $SLICE_COUNT at 60 fps"

if [[ -n "$ONLY" ]]; then
  # A --only run is a partial re-record: the manifest holds just those slices,
  # so the full-set check and capture.json rebuild are skipped. The re-recorded
  # files keep their storyboard NNN prefix and slot into a later full build.
  log "only_slices $SLICE_COUNT re-recorded ($ONLY)"
elif [[ "$DRIVER_STATUS" -eq 0 ]]; then
  verify_slices
  verify_host_state
  log "build_capture"
  WORK="$WORK" PUBLIC="$PUBLIC" python3 "$SCRIPT_DIR/build_capture.py" 2>&1 | tee -a "$LOG"
fi

adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command exit >/dev/null 2>&1 || true
log "capture_complete"
exit "$DRIVER_STATUS"
