#!/usr/bin/env bash
# Record the Harold phone demo.
#
# Starts the daemon, issues a pairing code, puts that QR on the emulator
# wall, and screenrecords the app while drive_phone.py walks the UI.
# The terminal is not recorded. Remotion draws the phone frame later and
# plays this capture on the screen.
#
# Artifacts:
#   docs/demo-pipeline/phone-demo.mp4
#   docs/demo/public/phone.mp4
#   docs/demo/public/capture.json
set -euo pipefail

SERIAL="${SERIAL:-emulator-5554}"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
MEDIA="$SCRIPT_DIR"
PUBLIC="$ROOT/docs/demo/public"
# Wall poster for the virtual-scene room. Repo copy keeps the folder
# self-contained; fall back to the SDK asset if it is missing.
POSTER="$MEDIA/virtualscene-poster.png"
[[ -f "$POSTER" ]] || POSTER=/usr/lib/android-sdk/emulator/resources/poster.png
MACRO_DIR=/usr/lib/android-sdk/emulator/resources/macros
LOG=$MEDIA/capture.log
MARKS=$MEDIA/marks.log
PROMPT="${PROMPT:-Summarize this repo in one sentence}"

mkdir -p "$MEDIA" "$PUBLIC"
: >"$LOG"
: >"$MARKS"

log() { printf '%s %s\n' "$(date +%s.%3N)" "$*" | tee -a "$LOG"; }

require_virtualscene() {
  local pid cmdline found=0
  for pid in $(pgrep -f 'qemu-system-x86_64' || true); do
    cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
    case "$cmdline" in
      *qemu-system-x86_64*-camera-back\ virtualscene*) found=1 ;;
    esac
  done
  if [[ "$found" -ne 1 ]]; then
    echo "capture.sh: the emulator back camera is not a virtual scene." >&2
    echo "Relaunch with -camera-back virtualscene." >&2
    exit 1
  fi
}

emu() {
  local reply
  reply=$(printf 'auth %s\n%s\nquit\n' "$TOKEN" "$1" | nc -q 2 localhost "${SERIAL#emulator-}")
  if printf '%s\n' "$reply" | grep -q '^KO'; then
    echo "emulator console failed: $1" >&2
    printf '%s\n' "$reply" >&2
    exit 1
  fi
}

require_virtualscene
command -v harold >/dev/null || { echo "capture.sh: harold is not on PATH" >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "capture.sh: ffprobe is not on PATH" >&2; exit 1; }
TOKEN=$(cat ~/.emulator_console_auth_token)

log "camera_reset"
emu "automation play ${MACRO_DIR}/Reset_position"
emu "virtualscene-image wall $POSTER"

log "daemon_restart"
harold stop >/dev/null 2>&1 || true
sleep 1
harold start
log "daemon_ready"

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
[[ -n "$CODE" ]] || { echo "no pairing code captured" >&2; exit 1; }
log "code_seen $CODE"
emu "virtualscene-image wall ${MEDIA}/qr-live.png"
log "poster_injected"

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
adb -s "$SERIAL" pull /sdcard/demo.mp4 "$MEDIA/phone-demo.mp4" >/dev/null
log "phone_pulled"
cp -f "$MEDIA/phone-demo.mp4" "$PUBLIC/phone.mp4"

python3 - "$MARKS" "$MEDIA/screen-start" "$MEDIA/phone-demo.mp4" "$PUBLIC/capture.json" <<'PY'
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
