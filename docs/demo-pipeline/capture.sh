#!/usr/bin/env bash
# One-shot capture orchestrator for the Harold README demo video.
#
#   terminal (VHS, one tmux pane)  +  phone (adb screenrecord, driven by
#   drive_phone.py)  run on the same wall clock. This script records both,
#   injects the live pairing QR into the emulator's virtual-scene wall poster,
#   and writes timing marks used later to cut the combined video.
set -euo pipefail

SERIAL=emulator-5554
MEDIA=$(pwd)
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MACRO_DIR=/usr/lib/android-sdk/emulator/resources/macros
TMUX_SESSION=harold-demo
LOG=$MEDIA/capture.log
MARKS=$MEDIA/marks.log
PROMPT="${PROMPT:-Summarize this repo in one sentence}"

mkdir -p "$MEDIA"
: >"$LOG"
: >"$MARKS"

log() { printf '%s %s\n' "$(date +%s.%3N)" "$*" | tee -a "$LOG"; }

log "media $MEDIA"

# The emulated camera paints a fixed room. virtualscene-image and the walk
# macros only change what the scanner sees when the back camera is virtualscene.
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
TOKEN=$(cat ~/.emulator_console_auth_token)
log "camera_reset"
emu "automation play ${MACRO_DIR}/Reset_position"

log "reset_begin"
harold stop >/dev/null 2>&1 || true
sleep 1
adb -s "$SERIAL" reverse tcp:3847 tcp:3847 >/dev/null
adb -s "$SERIAL" shell pm clear harold.android.debug >/dev/null
adb -s "$SERIAL" shell pm grant harold.android.debug android.permission.CAMERA
adb -s "$SERIAL" shell pm grant harold.android.debug android.permission.POST_NOTIFICATIONS

# Clean status bar for the recording.
adb -s "$SERIAL" shell settings put global sysui_demo_allowed 1
adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null 2>&1 || true
adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941 >/dev/null 2>&1 || true
adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false >/dev/null 2>&1 || true
adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4 >/dev/null 2>&1 || true
adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false >/dev/null 2>&1 || true

# Poster starts as the default image. The live QR replaces it once the terminal issues a code.
emu "virtualscene-image wall /usr/lib/android-sdk/emulator/resources/poster.png"

# App cold-starts on the unpaired shell screen.
adb -s "$SERIAL" shell am force-stop harold.android.debug
adb -s "$SERIAL" shell monkey -p harold.android.debug -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 4
log "app_ready"

# Single-pane tmux session: visually a plain terminal, but capture-pane lets
# the controller read the pairing code out of band.
# Killing the last session also stops the tmux server; give it a beat so the
# next new-session starts a fresh server instead of racing the dying one.
tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true
sleep 1
for _ in 1 2 3; do
  tmux -f "$SCRIPT_DIR/tmux-harold.conf" new-session -d -s "$TMUX_SESSION" -c "$HOME" 2>/dev/null && break
  sleep 0.5
done
tmux select-pane -t "$TMUX_SESSION:0.0"
log "tmux_ready"

# Both recordings start together.
adb -s "$SERIAL" shell screenrecord --size 860x1280 --bit-rate 8000000 --time-limit 180 /sdcard/demo.mp4 &
SCREENRECORD_WRAPPER=$!
sleep 2
log "screenrecord_start"
# VHS output paths are relative to its cwd; keep artifacts in the media dir.
(cd "$MEDIA" && vhs "$SCRIPT_DIR/terminal-pair.tape" >"$MEDIA/vhs.log" 2>&1) &
VHS_PID=$!
log "vhs_start"

# Wait for the pairing code to show up in the right pane, then swap the poster.
CODE=""
for _ in $(seq 1 240); do
  CONTENT=$(tmux capture-pane -pJ -S -3000 -t "$TMUX_SESSION:0.0" 2>/dev/null || true)
  CODE=$(printf '%s\n' "$CONTENT" | grep -oE '\b[A-Z0-9]{3}-[A-Z0-9]{3}\b' | head -1 || true)
  [[ -n "$CODE" ]] && break
  sleep 0.5
done
[[ -n "$CODE" ]] || { echo "no pairing code captured" >&2; exit 1; }
log "code_seen $CODE"
node -e "require('qrcode').toFile('$MEDIA/qr-live.png','harold://pair?v=1&endpoint=http%3A%2F%2F127.0.0.1%3A3847&code=$CODE',{width:1024,margin:4}).then(()=>{})"
emu "virtualscene-image wall ${MEDIA}/qr-live.png"
log "poster_injected"

# Phone: open the scanner, walk the camera onto the wall poster, pair, send a prompt.
sleep 1
SERIAL="$SERIAL" PROMPT="$PROMPT" MARKS="$MARKS" \
  python3 "$SCRIPT_DIR/drive_phone.py" 2>&1 | tee "$MEDIA/driver.log"

# Stop the recording and pull it.
sleep 1
adb -s "$SERIAL" shell pkill -INT screenrecord || true
sleep 4
adb -s "$SERIAL" pull /sdcard/demo.mp4 "$MEDIA/phone-demo.mp4" >/dev/null
log "phone_pulled"

# Let the terminal recording finish, then tidy up.
wait "$VHS_PID" || true
log "vhs_done"

adb -s "$SERIAL" shell am broadcast -a com.android.systemui.demo -e command exit >/dev/null 2>&1 || true
tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true
log "capture_complete"
