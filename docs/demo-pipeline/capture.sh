#!/usr/bin/env bash
# Record the Harold phone demo.
#
# Boots the emulator with its back camera fed by a video file
# (-camera-back videofile:). Before boot, compose_camera.mjs pastes the live
# pairing QR over the QR panel in the staged clip and rotates the frame so the
# camera preview lands upright. The terminal is not recorded; Remotion draws
# the phone frame later and plays this capture on the screen.
#
# Needs emulator 36.5+ with the VideoPlayback feature (see README).
#
# Artifacts:
#   docs/demo/public/phone.mp4
#   docs/demo/public/capture.json
set -euo pipefail

SERIAL="${SERIAL:-emulator-5554}"
AVD="${AVD:-agent_server_api34}"
EMULATOR="${EMULATOR:-$HOME/android/emulator/emulator}"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
MEDIA="$SCRIPT_DIR"
PUBLIC="$ROOT/docs/demo/public"
CAMERA_SOURCE="${CAMERA_SOURCE:-$MEDIA/virtual-qr-code-webcam.mp4}"
CAMERA_FILE="$MEDIA/camera-live.mp4"
EMULATOR_LOG="$MEDIA/emulator.log"
LOG="$MEDIA/capture.log"
MARKS="$MEDIA/marks.log"
PROMPT="${PROMPT:-Summarize this repo in one sentence}"

mkdir -p "$MEDIA" "$PUBLIC"
: >"$LOG"
: >"$MARKS"

log() { printf '%s %s\n' "$(date +%s.%3N)" "$*" | tee -a "$LOG"; }
die() { echo "capture.sh: $*" >&2; exit 1; }

for tool in harold adb node ffmpeg ffprobe python3; do
  command -v "$tool" >/dev/null || die "$tool is not on PATH"
done
[[ -x "$EMULATOR" ]] || die "emulator not found at $EMULATOR (set EMULATOR)"
[[ -f "$CAMERA_SOURCE" ]] || die "camera source not found at $CAMERA_SOURCE (set CAMERA_SOURCE)"

stop_emulator() {
  local pid
  for pid in $(pgrep -f "qemu-system-x86_64 .*-avd $AVD" || true); do
    kill "$pid" 2>/dev/null || true
  done
  for pid in $(pgrep -f "emulator -avd $AVD" || true); do
    kill "$pid" 2>/dev/null || true
  done
  for _ in $(seq 1 30); do
    pgrep -f "qemu-system-x86_64 .*-avd $AVD" >/dev/null || return 0
    sleep 1
  done
  die "the $AVD emulator did not stop; kill it and retry"
}

log "daemon_restart"
harold stop >/dev/null 2>&1 || true
sleep 1
harold start
log "daemon_ready"

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
  ' "$PAIR_JSON" "$MEDIA/qr-live.png"
) >"$MEDIA/pair-code.txt"
CODE=$(cat "$MEDIA/pair-code.txt")
[[ -n "$CODE" ]] || die "no pairing code captured"
log "code_seen $CODE"

log "camera_compose"
node "$SCRIPT_DIR/compose_camera.mjs" "$CAMERA_SOURCE" "$MEDIA/qr-live.png" "$CAMERA_FILE"
log "camera_composed"

log "emulator_stop"
stop_emulator
log "emulator_boot"
nohup "$EMULATOR" -avd "$AVD" -no-audio -gpu swiftshader_indirect -no-snapshot \
  -feature VideoPlayback -camera-back "videofile:$CAMERA_FILE" >"$EMULATOR_LOG" 2>&1 &
boot=""
for _ in $(seq 1 150); do
  boot=$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
  [[ "$boot" == "1" ]] && break
  sleep 2
done
[[ "$boot" == "1" ]] || die "emulator did not finish booting (see $EMULATOR_LOG)"
log "emulator_ready"

adb -s "$SERIAL" reverse tcp:3847 tcp:3847 >/dev/null
adb -s "$SERIAL" shell pm clear harold.android.debug >/dev/null
adb -s "$SERIAL" shell pm grant harold.android.debug android.permission.CAMERA
adb -s "$SERIAL" shell pm grant harold.android.debug android.permission.POST_NOTIFICATIONS

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

# The video camera buffers its first frames lazily: the first open after an
# emulator boot shows black for ~20s. Warm it before recording so the QR is
# visible as soon as the scanner opens.
SERIAL="$SERIAL" python3 "$SCRIPT_DIR/drive_phone.py" --warm 2>&1 | tee -a "$LOG"
log "camera_warm"

# Native size. --size letterboxes the display and drops the frame rate.
date +%s.%3N >"$MEDIA/screen-start"
adb -s "$SERIAL" shell screenrecord --bit-rate 12000000 --time-limit 180 /sdcard/demo.mp4 &
sleep 1
log "screenrecord_start"

set +e
SERIAL="$SERIAL" PROMPT="$PROMPT" MARKS="$MARKS" \
  python3 "$SCRIPT_DIR/drive_phone.py" 2>&1 | tee "$MEDIA/driver.log"
DRIVER_STATUS=${PIPESTATUS[0]}
set -e
log "driver_exit $DRIVER_STATUS"

sleep 1
adb -s "$SERIAL" shell pkill -INT screenrecord || true
sleep 4
adb -s "$SERIAL" pull /sdcard/demo.mp4 "$PUBLIC/phone.mp4" >/dev/null
log "phone_pulled"

python3 - "$MARKS" "$MEDIA/screen-start" "$PUBLIC/phone.mp4" "$PUBLIC/capture.json" <<'PY'
import json
import subprocess
import sys

marks_path, start_path, video_path, out_path = sys.argv[1:5]
start = float(open(start_path).read().strip())
events = []
for line in open(marks_path):
    line = line.strip()
    if not line:
        continue
    name, ts = line.split()
    events.append({"name": name, "sec": round(float(ts) - start, 3)})

probe = subprocess.check_output(
    [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height:format=duration",
        "-of",
        "json",
        video_path,
    ]
)
meta = json.loads(probe)
stream = meta["streams"][0]
duration = round(float(meta["format"]["duration"]), 3)
# Marks are wall-clock. The file can end before the last poll, so keep
# every caption inside the recording.
for event in events:
    if event["sec"] > duration - 2.5:
        event["sec"] = round(max(0, duration - 2.5), 3)
payload = {
    "durationSec": duration,
    "width": int(stream["width"]),
    "height": int(stream["height"]),
    "events": events,
}
with open(out_path, "w") as handle:
    json.dump(payload, handle, indent=2)
    handle.write("\n")
print(
    f"capture.json {payload['width']}x{payload['height']} {payload['durationSec']}s {len(events)} events"
)
PY

adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command exit >/dev/null 2>&1 || true
log "capture_complete"
exit "$DRIVER_STATUS"
