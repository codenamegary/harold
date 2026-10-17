#!/usr/bin/env bash
# Record the Harold phone demo.
#
# Boots the emulator with its back camera fed by a video file
# (-camera-back videofile:). Before boot, compose_camera.mjs pastes the live
# pairing QR over the QR panel in the staged clip and rotates the frame so the
# camera preview lands upright. The terminal is not recorded; Remotion draws
# the phone frame later and plays this capture on the screen.
#
# The walk is recorded in segments: drive_phone.py runs screenrecord only
# while something is happening on screen and leaves the pure waits (scanner
# decode, reply streaming, spinners) unrecorded. Afterwards
# stitch_segments.py concatenates the segments into phone.mp4 and rebuilds
# capture.json on the stitched timeline.
#
# Once booted, push_assets.sh copies the demo photos and cat diary onto the
# emulator, skipping files it already has. The emulator microphone reads a
# converted copy of assets/voice-input.wav through its built-in WAV audio
# driver; drive_phone.py rewinds that file at the voice scene. The wav is
# microphone input only - it never lands in the recording or the video.
#
# Before the emulator boots, seed_sessions.sh gives OpenCode the five recent
# sessions the phone's session menu shows, reusing them when they are already
# the newest. That keeps the history scene deterministic.
#
# Needs emulator 36.5+ with the VideoPlayback feature and a C compiler for
# the audio shim (see README).
#
# Artifacts:
#   docs/demo/render/public/phone.mp4
#   docs/demo/render/public/capture.json
#
# Scratch (composed feed, logs, per-segment recordings) goes to
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
SEGMENTS="$WORK/segments"
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
VOICE_INPUT="${VOICE_INPUT:-$SCRIPT_DIR/assets/voice-input.wav}"
VOICE_WAV="$SHORT_TMP/harold-qemu-in.wav"
VOICE_WAV_OUT="$SHORT_TMP/harold-qemu-out.wav"
AUDIO_SHIM_SOURCE="$SCRIPT_DIR/audio-env-shim.c"
AUDIO_SHIM="$SHORT_TMP/harold-audio-env-shim.so"

export PYTHONPYCACHEPREFIX="$WORK/pycache"

mkdir -p "$WORK" "$PUBLIC" "$SHORT_TMP" "$SEGMENTS"
: >"$LOG"
: >"$MARKS"

log() { printf '%s %s\n' "$(date +%s.%3N)" "$*" | tee -a "$LOG"; }
die() { echo "capture.sh: $*" >&2; exit 1; }

for tool in harold opencode adb node ffmpeg ffprobe python3 cc; do
  command -v "$tool" >/dev/null || die "$tool is not on PATH"
done
[[ -x "$EMULATOR" ]] || die "emulator not found at $EMULATOR (set EMULATOR)"
[[ -f "$CAMERA_SOURCE" ]] || die "camera source not found at $CAMERA_SOURCE (set CAMERA_SOURCE)"
[[ -f "$VOICE_INPUT" ]] || die "voice input not found at $VOICE_INPUT (set VOICE_INPUT)"
[[ -f "$AUDIO_SHIM_SOURCE" ]] || die "audio shim source not found at $AUDIO_SHIM_SOURCE"

# Segments from a previous run would corrupt this run's stitch; clear both
# sides before the driver starts.
rm -f "$SEGMENTS"/harold-demo-*.mp4

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

log "daemon_restart"
harold stop >/dev/null 2>&1 || true
sleep 1
harold start
log "daemon_ready"

# The phone's session menu shows the five most recent agent sessions. Seed
# them before pairing so the history scene always shows the demo titles.
log "sessions_seed_start"
SEED_LOG="$WORK/session-seed.log" bash "$SCRIPT_DIR/seed_sessions.sh" 2>&1 | tee -a "$LOG"
log "sessions_seeded"

PAIR_JSON=$(harold pair --no-wait --json | tail -n 1)
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
LD_PRELOAD="$AUDIO_SHIM" \
HAROLD_WAV_IN="$VOICE_WAV" \
HAROLD_WAV_OUT="$VOICE_WAV_OUT" \
nohup "$EMULATOR" -avd "$AVD" -allow-host-audio \
  -gpu swiftshader_indirect -no-snapshot \
  -feature VideoPlayback -camera-back "videofile:$CAMERA_FEED" >"$EMULATOR_LOG" 2>&1 &
boot=""
for _ in $(seq 1 150); do
  boot=$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
  [[ "$boot" == "1" ]] && break
  sleep 2
done
[[ "$boot" == "1" ]] || die "emulator did not finish booting (see $EMULATOR_LOG)"
log "emulator_ready"

adb -s "$SERIAL" reverse tcp:3847 tcp:3847 >/dev/null
SERIAL="$SERIAL" WORK="$WORK" bash "$SCRIPT_DIR/push_assets.sh" 2>&1 | tee -a "$LOG"
log "assets_ready"
adb -s "$SERIAL" shell pm clear harold.android.debug >/dev/null
adb -s "$SERIAL" shell pm grant harold.android.debug android.permission.CAMERA
adb -s "$SERIAL" shell pm grant harold.android.debug android.permission.POST_NOTIFICATIONS
adb -s "$SERIAL" shell pm grant harold.android.debug android.permission.RECORD_AUDIO

adb -s "$SERIAL" shell settings put global sysui_demo_allowed 1
adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null 2>&1 || true
adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941 >/dev/null 2>&1 || true
adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false >/dev/null 2>&1 || true
adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4 >/dev/null 2>&1 || true
adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false >/dev/null 2>&1 || true

adb -s "$SERIAL" shell am force-stop harold.android.debug
adb -s "$SERIAL" shell monkey -p harold.android.debug -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 4
log "app_ready"

# Stale device-side segments would otherwise ride along in the pull.
adb -s "$SERIAL" shell 'rm -f /sdcard/harold-demo-*.mp4' >/dev/null

# The video camera buffers its first frames lazily: the first open after an
# emulator boot shows black for ~20s. Warm it before recording so the QR is
# visible as soon as the scanner opens. The feed shows the live QR only
# after 40s of playback, so the 25s warm pass scans inert footage: it burns
# no pairing code and triggers no decode-failure retries.
SERIAL="$SERIAL" python3 "$SCRIPT_DIR/drive_phone.py" --warm 2>&1 | tee -a "$LOG"
log "camera_warm"

# Reset the app so the recorded run pairs on camera, with the camera
# already warm.
adb -s "$SERIAL" shell pm clear harold.android.debug >/dev/null
adb -s "$SERIAL" shell pm grant harold.android.debug android.permission.CAMERA
adb -s "$SERIAL" shell pm grant harold.android.debug android.permission.POST_NOTIFICATIONS
adb -s "$SERIAL" shell pm grant harold.android.debug android.permission.RECORD_AUDIO

# VoskSpeechRecognitionClient preloads the bundled model when the app process
# starts, so the recorded voice scene does not pay the unpack cost. Do not
# open a throwaway microphone stream here: force-stopping one leaves the
# emulator's WAV input unable to feed the next stream.
adb -s "$SERIAL" shell monkey -p harold.android.debug -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 4
log "app_reset"

# Segmented capture: drive_phone.py starts and stops screenrecord around
# each scene, so nothing ever records a bare wait.
set +e
SERIAL="$SERIAL" PROMPT="$PROMPT" MARKS="$MARKS" \
  python3 "$SCRIPT_DIR/drive_phone.py" 2>&1 | tee "$WORK/driver.log"
DRIVER_STATUS=${PIPESTATUS[0]}
set -e
log "driver_exit $DRIVER_STATUS"

# Pull every segment the driver recorded, then stitch them into phone.mp4
# and rebuild capture.json on the stitched timeline.
for remote in $(adb -s "$SERIAL" shell ls /sdcard/harold-demo-\*.mp4 2>/dev/null | tr -d '\r'); do
  adb -s "$SERIAL" pull "$remote" "$SEGMENTS/" >/dev/null
done
SEG_COUNT=$(ls "$SEGMENTS"/harold-demo-*.mp4 2>/dev/null | wc -l)
[[ "$SEG_COUNT" -gt 0 ]] || die "no segments pulled from $SERIAL"
log "segments_pulled $SEG_COUNT"

log "stitch"
python3 "$SCRIPT_DIR/stitch_segments.py" 2>&1 | tee -a "$LOG"

adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command exit >/dev/null 2>&1 || true
log "capture_complete"
exit "$DRIVER_STATUS"
