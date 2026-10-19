#!/usr/bin/env bash
# Record the Harold phone demo.
#
# Boots the emulator with its back camera fed by a video file
# (-camera-back videofile:). Before boot, compose_camera.mjs pastes the live
# pairing QR over the QR panel in the staged clip and rotates the frame so the
# camera preview lands upright. The terminal is not recorded; Remotion draws
# the phone frame later and plays this capture on the screen.
#
# The walk is recorded as named slices: drive_phone.py starts one screenrecord
# file per action, from the tap through the wait for the UI to settle. Each
# slice and its taps are published to docs/demo/render/public/slices/, and
# build_capture.py writes capture.json for Remotion to compose. There is no
# stitched video, so pacing changes stay in the Remotion timeline.
#
# The emulator boots with -wipe-data, so every run starts from factory userdata:
# no prior photos, downloads, installed app, or permissions. push_assets.sh
# then copies only the demo photos and cat diary onto it. The microphone reads a
# converted copy of assets/voice-input.wav through its built-in WAV audio
# driver; drive_phone.py rewinds that file at the voice scene. The wav is
# microphone input only - it never lands in the recording or the video.
#
# Before the emulator boots, seed_sessions.sh gives OpenCode the five recent
# sessions the phone's session menu shows, reusing them when they are already
# the newest. That keeps the history scene deterministic.
#
# The capture stops any running Harold first, then starts a fresh demo home at
# ~/.harold-demo (HAROLD_DEMO_DATA_DIR) on 127.0.0.1:3847. It copies the agent
# and workspace rows from ~/.harold, clears devices and pairing codes, and
# writes a loopback settings.yml. The emulator reaches that daemon through
# adb reverse tcp:3847 tcp:3847.
#
# Needs emulator 36.5+ with the VideoPlayback feature, a C compiler for the
# audio shim, bun for the source CLI, a configured ~/.harold with agents and
# workspaces, sqlite3, and a JDK + Android SDK for the debug app build. The
# script writes apps/android/local.properties when missing and installs
# harold.android.debug from this checkout (see README).
#
# Artifacts:
#   docs/demo/render/public/slices/*.mp4
#   docs/demo/render/public/capture.json
#
# Scratch (composed feed, logs, raw slice recordings) goes to
# docs/demo/work/capture/.
set -euo pipefail

SERIAL="${SERIAL:-emulator-5554}"
AVD="${AVD:-agent_server_api34}"
EMULATOR="${EMULATOR:-$HOME/android/emulator/emulator}"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEMO=$(cd "$SCRIPT_DIR/.." && pwd)
ROOT=$(cd "$DEMO/../.." && pwd)
WORK="${WORK:-$DEMO/work/capture}"
PUBLIC="$DEMO/render/public"
SLICES="$WORK/slices"
SLICE_MANIFEST="$WORK/slices.json"
CAMERA_SOURCE="${CAMERA_SOURCE:-$SCRIPT_DIR/assets/virtual-qr-code-webcam.mp4}"
CAMERA_FILE="$WORK/camera-live.mp4"
# The emulator's videofile camera silently fails on long paths. This worktree
# path is longer than the main checkout's, so give the emulator a short copy.
SHORT_TMP="${HAROLD_TMP:-/tmp/opencode}"
CAMERA_FEED="$SHORT_TMP/harold-camera-live.mp4"
EMULATOR_LOG="$WORK/emulator.log"
LOG="$WORK/capture.log"
MARKS="$WORK/marks.log"
DEFAULT_PROMPT="Do you think my cat's behaviour is strange?"
PROMPT="${PROMPT:-$DEFAULT_PROMPT}"
SEED_MODEL="${SEED_MODEL:-deepseek/deepseek-flash}"
VOICE_INPUT="${VOICE_INPUT:-$SCRIPT_DIR/assets/voice-input.wav}"
VOICE_WAV="$SHORT_TMP/harold-qemu-in.wav"
VOICE_WAV_OUT="$SHORT_TMP/harold-qemu-out.wav"
AUDIO_SHIM_SOURCE="$SCRIPT_DIR/audio-env-shim.c"
AUDIO_SHIM="$SHORT_TMP/harold-audio-env-shim.so"
REAL_DATA_DIR="${HAROLD_DATA_DIR:-$HOME/.harold}"
REAL_DATA_DIR="${REAL_DATA_DIR/#\~/$HOME}"
DEMO_DATA_DIR="${HAROLD_DEMO_DATA_DIR:-$HOME/.harold-demo}"
DEMO_DATA_DIR="${DEMO_DATA_DIR/#\~/$HOME}"
DEMO_HOST="127.0.0.1"
DEMO_PORT="${HAROLD_DEMO_PORT:-3847}"
MAIN_ROOT=$(git -C "$ROOT" worktree list --porcelain | sed -n 's/^worktree //p' | head -n 1)
SITES_ROOT=$(dirname "$MAIN_ROOT")

export PYTHONPYCACHEPREFIX="$WORK/pycache"

mkdir -p "$WORK" "$PUBLIC" "$SHORT_TMP" "$SLICES"
: >"$LOG"
: >"$MARKS"
: >"$SLICE_MANIFEST"

log() { printf '%s %s\n' "$(date +%s.%3N)" "$*" | tee -a "$LOG"; }
die() { echo "capture.sh: $*" >&2; exit 1; }

# Run the source CLI against the demo data dir and loopback port. The daemon
# and every CLI command must agree on these three values.
harold() {
  (cd "$ROOT" && \
    HAROLD_DATA_DIR="$DEMO_DATA_DIR" \
    HAROLD_HOST="$DEMO_HOST" \
    HAROLD_PORT="$DEMO_PORT" \
    bun run dev "$@")
}

for tool in bun opencode adb node ffmpeg ffprobe python3 cc sqlite3; do
  command -v "$tool" >/dev/null || die "$tool is not on PATH"
done
command -v java >/dev/null || [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]] \
  || die "java not found (set JAVA_HOME)"
[[ -x "$ROOT/apps/android/gradlew" ]] || die "android gradlew not found"
[[ -x "$EMULATOR" ]] || die "emulator not found at $EMULATOR (set EMULATOR)"
[[ -f "$CAMERA_SOURCE" ]] || die "camera source not found at $CAMERA_SOURCE (set CAMERA_SOURCE)"
[[ -f "$VOICE_INPUT" ]] || die "voice input not found at $VOICE_INPUT (set VOICE_INPUT)"
[[ -f "$AUDIO_SHIM_SOURCE" ]] || die "audio shim source not found at $AUDIO_SHIM_SOURCE"

# Shut Harold down before touching the demo runtime. The real home may be on a
# different port or advertised URL; the demo home may be left from a prior run.
log "daemon_shutdown"
(cd "$ROOT" && env -u HAROLD_HOST -u HAROLD_PORT \
  HAROLD_DATA_DIR="$REAL_DATA_DIR" bun run dev stop) 2>&1 | tee -a "$LOG" || true
harold stop 2>&1 | tee -a "$LOG" || true

# Android needs an SDK path in local.properties. The file is gitignored and
# absent in a fresh worktree, so derive it from the emulator the capture
# already uses and write it before Gradle runs.
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
existing_sdk=$(sed -n 's/^sdk\.dir=//p' "$LOCAL_PROPERTIES" 2>/dev/null | tail -n 1)
if [[ -z "$existing_sdk" || ! -d "$existing_sdk" ]]; then
  printf 'sdk.dir=%s\n' "$ANDROID_SDK_DIR" >"$LOCAL_PROPERTIES"
  log "android_sdk $LOCAL_PROPERTIES"
fi

# Slices from a previous run would ride along in the pull and the manifest;
# clear both sides before the driver starts.
rm -f "$SLICES"/*.mp4

# The emulator's WAV audio driver reads a canonical 44.1 kHz stereo S16 file.
# Add a short lead-in and a long silence tail: the lead-in lets the voice UI
# settle before speech starts, and the tail gives Vosk time to endpoint
# before the looping file starts the phrase again.
log "voice_prepare"
ffmpeg -hide_banner -loglevel error -y -i "$VOICE_INPUT" \
  -af "adelay=1500:all=1,apad=pad_dur=30" \
  -ar 44100 -ac 2 -c:a pcm_s16le -map_metadata -1 -fflags +bitexact \
  "$VOICE_WAV"
cc -shared -fPIC -O2 -o "$AUDIO_SHIM" "$AUDIO_SHIM_SOURCE"
log "voice_prepared"

stop_emulator() {
  local pid
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

# The demo gets its own data dir so the real config cannot leak a LAN port or
# a stale device into the capture. Keep the agent/workspace rows, clear the
# device/pairing rows, and pin the daemon to loopback on the port the
# emulator reaches through adb reverse.
log "daemon_home"
[[ "$REAL_DATA_DIR" != "$DEMO_DATA_DIR" ]] \
  || die "HAROLD_DATA_DIR must differ from HAROLD_DEMO_DATA_DIR"
if command -v lsof >/dev/null && lsof -ti "tcp:$DEMO_PORT" >/dev/null 2>&1; then
  die "port $DEMO_PORT is still in use; stop that process and retry"
fi
rm -rf "$DEMO_DATA_DIR"
mkdir -p "$DEMO_DATA_DIR"
[[ -f "$REAL_DATA_DIR/harold.db" ]] \
  || die "no Harold config at $REAL_DATA_DIR/harold.db; run harold setup first"
cp "$REAL_DATA_DIR/harold.db" "$DEMO_DATA_DIR/harold.db"
if [[ -f "$REAL_DATA_DIR/harold.db-wal" ]]; then
  cp "$REAL_DATA_DIR/harold.db-wal" "$DEMO_DATA_DIR/harold.db-wal"
fi
sqlite3 "$DEMO_DATA_DIR/harold.db" \
  "PRAGMA foreign_keys=OFF;
   DELETE FROM devices;
   DELETE FROM pairing_codes;
   DELETE FROM archived_acp_sessions;
   PRAGMA foreign_keys=ON;"
cat >"$DEMO_DATA_DIR/settings.yml" <<EOF
advertisedUrl: http://$DEMO_HOST:$DEMO_PORT
advertisedUrlEnabled: true
bindHost: $DEMO_HOST
bindPort: $DEMO_PORT
logLevel: info
logPath: null
allowedRoots:
  - "$MAIN_ROOT"
  - "$SITES_ROOT"
EOF
log "daemon_start"
harold start
log "daemon_ready"

# The phone's session menu shows the five most recent agent sessions. Seed
# them before pairing so the history scene always shows the demo titles.
log "sessions_seed_start model=$SEED_MODEL"
SEED_LOG="$WORK/session-seed.log" SEED_MODEL="$SEED_MODEL" \
  bash "$SCRIPT_DIR/seed_sessions.sh" 2>&1 | tee -a "$LOG"
log "sessions_seeded"

# The emulator reaches the host through adb reverse. Pin the QR to loopback;
# the default advertised endpoint is the LAN URL used by physical phones.
PAIR_JSON=$(harold pair --no-wait --json --endpoint loopback | tail -n 1)
log "pair_issued"
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

log "emulator_stop"
stop_emulator
log "emulator_boot"
# CameraX validates that both a front and back camera exist. The AVD has
# hw.camera.front=none, so that check retries forever and the pairing scanner
# never opens. Add an unused emulated front camera so the back videofile
# camera is accepted.
#
# -wipe-data restores the initial userdata image. That removes every installed
# app, permission grant, photo, screenshot, download, and old recording, so
# the asset prep does not have to chase individual picker directories. The
# debug app is installed after this boot.
LD_PRELOAD="$AUDIO_SHIM" \
HAROLD_WAV_IN="$VOICE_WAV" \
HAROLD_WAV_OUT="$VOICE_WAV_OUT" \
nohup "$EMULATOR" -avd "$AVD" -wipe-data -allow-host-audio \
  -gpu swiftshader_indirect -no-snapshot \
  -feature VideoPlayback -camera-back "videofile:$CAMERA_FEED" \
  -camera-front emulated >"$EMULATOR_LOG" 2>&1 &
boot=""
for _ in $(seq 1 150); do
  boot=$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
  [[ "$boot" == "1" ]] && break
  sleep 2
done
[[ "$boot" == "1" ]] || die "emulator did not finish booting (see $EMULATOR_LOG)"
log "emulator_ready"

# -wipe-data resets the system UI mode to light. The demo is dark, and the app
# reads the system mode at launch, so enable night mode before installing or
# starting it.
log "emulator_dark_mode"
adb -s "$SERIAL" shell cmd uimode night yes >/dev/null
night_mode=$(adb -s "$SERIAL" shell cmd uimode night | tr -d '\r')
[[ "$night_mode" == *"yes"* ]] || die "could not enable dark mode (got: $night_mode)"

# The first boot after -wipe-data is slow enough to ANR Pixel Launcher while it
# initializes. Hide system crash/ANR dialogs so they cannot cover the app while
# the driver records the pair screen.
adb -s "$SERIAL" shell settings put global hide_error_dialogs 1 >/dev/null
adb -s "$SERIAL" shell settings put global anr_show_background 0 >/dev/null 2>&1 || true

# The server and app ship together. Build and install the debug app from this
# checkout so the recorded app speaks the same session transport as the
# source server. A stale app can pair and then sit in reconnect retries.
log "android_build"
if ! (cd "$ROOT/apps/android" && ANDROID_SERIAL="$SERIAL" ./gradlew :app:installDebug --console=plain) \
  >"$WORK/android-build.log" 2>&1; then
  tail -40 "$WORK/android-build.log" >&2
  die "android :app:installDebug failed (see $WORK/android-build.log)"
fi
log "android_installed"

SERIAL="$SERIAL" WORK="$WORK" bash "$SCRIPT_DIR/push_assets.sh" 2>&1 | tee -a "$LOG"
log "assets_ready"
adb -s "$SERIAL" shell settings put global sysui_demo_allowed 1
adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null 2>&1 || true
adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941 >/dev/null 2>&1 || true
adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false >/dev/null 2>&1 || true
adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4 >/dev/null 2>&1 || true
adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false >/dev/null 2>&1 || true

# Stale device-side slices would otherwise ride along in the pull. Slices live
# in /data/local/tmp, outside the media roots the app's pickers index.
adb -s "$SERIAL" shell 'rm -f /data/local/tmp/harold-demo-*.mp4' >/dev/null

# Reset the app once for the recorded run. The first camera open after boot
# takes ~20s; scanner_open records that startup and Remotion trims it.
adb -s "$SERIAL" shell pm clear harold.android.debug >/dev/null
adb -s "$SERIAL" shell pm grant harold.android.debug android.permission.CAMERA
adb -s "$SERIAL" shell pm grant harold.android.debug android.permission.POST_NOTIFICATIONS
adb -s "$SERIAL" shell pm grant harold.android.debug android.permission.RECORD_AUDIO
# Enable the reverse for the recorded run so the loopback QR reaches the host.
adb -s "$SERIAL" reverse "tcp:$DEMO_PORT" "tcp:$DEMO_PORT" >/dev/null
adb -s "$SERIAL" reverse --list | grep -q "tcp:$DEMO_PORT tcp:$DEMO_PORT" \
  || die "adb reverse for port $DEMO_PORT is not set"

# VoskSpeechRecognitionClient preloads the bundled model when the app process
# starts, so the recorded voice scene does not pay the unpack cost. Do not
# open a throwaway microphone stream here: force-stopping one leaves the
# emulator's WAV input unable to feed the next stream.
adb -s "$SERIAL" shell monkey -p harold.android.debug -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 4
log "app_reset"

# Slice capture: drive_phone.py records one named file per action.
set +eu
SERIAL="$SERIAL" PROMPT="$PROMPT" MARKS="$MARKS" SLICES="$SLICE_MANIFEST" \
  python3 "$SCRIPT_DIR/drive_phone.py" 2>&1 | tee "$WORK/driver.log"
DRIVER_STATUS=${PIPESTATUS[0]:-1}
set -eu
log "driver_exit $DRIVER_STATUS"

# Pull every slice under the manifest's file name, then publish the slices
# and their tap metadata. The device prefix is only a screenrecord namespace.
for remote in $(adb -s "$SERIAL" shell ls /data/local/tmp/harold-demo-\*.mp4 2>/dev/null | tr -d '\r'); do
  name="${remote##*/}"
  name="${name#harold-demo-}"
  adb -s "$SERIAL" pull "$remote" "$SLICES/$name" >/dev/null
done
SLICE_COUNT=$(ls "$SLICES"/*.mp4 2>/dev/null | wc -l)
[[ "$SLICE_COUNT" -gt 0 ]] || die "no slices pulled from $SERIAL"
log "slices_pulled $SLICE_COUNT"

log "build_capture"
WORK="$WORK" PUBLIC="$PUBLIC" python3 "$SCRIPT_DIR/build_capture.py" 2>&1 | tee -a "$LOG"

adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command exit >/dev/null 2>&1 || true
log "capture_complete"
exit "$DRIVER_STATUS"
