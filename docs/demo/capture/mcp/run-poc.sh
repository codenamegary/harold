#!/usr/bin/env bash
# Proof of concept: drive the real app through the MCP control plane and record
# the phone while it adds an SSH connection.
#
# Needs: a booted emulator or device on adb, docker, bun, and the fake host
# image built from docs/demo/fake-host.
#
# Env:
#   ANDROID_SERIAL=emulator-5554   which device to use
#   HAROLD_SKIP_BUILD=1            skip the gradle build and install
#   HAROLD_SKIP_HOST=1             reuse an already running fake host
#   HAROLD_PROBE_PORT=7391         must match ProbeServer.DEFAULT_PORT
#   HAROLD_DEMO_SSH_PORT=2223
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
ANDROID_DIR="$ROOT/apps/android"
FAKE_HOST_DIR="$ROOT/docs/demo/fake-host"
WORK="$ROOT/docs/demo/work/probe-poc"

PACKAGE='harold.android.debug'
PROBE_PORT="${HAROLD_PROBE_PORT:-7391}"
SSH_PORT="${HAROLD_DEMO_SSH_PORT:-2223}"
CONTAINER="${HAROLD_DEMO_CONTAINER:-harold-demo-host}"
REMOTE_VIDEO='/sdcard/harold-probe-poc.mp4'

log() { printf '\n== %s\n' "$*"; }

mkdir -p "$WORK"

log "checking adb"
if [[ -z "${ANDROID_SERIAL:-}" ]]; then
  ANDROID_SERIAL="$(adb devices | tr -d '\r' | awk 'NR>1 && $2=="device" && $1 ~ /^emulator-/ {print $1; exit}')"
fi
if [[ -z "${ANDROID_SERIAL:-}" ]]; then
  COUNT="$(adb devices | tr -d '\r' | awk 'NR>1 && $2=="device"' | wc -l)"
  if [[ "$COUNT" != "1" ]]; then
    echo "no emulator found and $COUNT physical devices attached. Set ANDROID_SERIAL explicitly." >&2
    exit 1
  fi
  ANDROID_SERIAL="$(adb devices | tr -d '\r' | awk 'NR>1 && $2=="device" {print $1; exit}')"
fi
export ANDROID_SERIAL
echo "device: $ANDROID_SERIAL"

adb_s() { adb -s "$ANDROID_SERIAL" "$@"; }

adb_s shell svc power stayon true >/dev/null 2>&1 || true
adb_s shell wm dismiss-keyguard >/dev/null 2>&1 || true

if [[ "${HAROLD_SKIP_BUILD:-0}" != "1" ]]; then
  log "building $PACKAGE"
  (cd "$ANDROID_DIR" && ./gradlew :app:assembleDebug --console=plain -q)
  log "installing on the selected device only"
  adb_s install -r -g "$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk" >/dev/null
fi

if [[ "${HAROLD_SKIP_HOST:-0}" != "1" ]]; then
  log "starting fake host"
  (cd "$FAKE_HOST_DIR" && docker compose down --remove-orphans >/dev/null 2>&1 || true)
  (cd "$FAKE_HOST_DIR" && docker compose up -d --build)
  for _ in $(seq 1 60); do
    if docker exec "$CONTAINER" pgrep -x sshd >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

log "resetting authorized keys"
docker exec "$CONTAINER" reset-authorized-keys >/dev/null

log "wiring adb reverse for the SSH host and forward for the probe"
adb_s reverse "tcp:$SSH_PORT" "tcp:$SSH_PORT"
adb_s forward "tcp:$PROBE_PORT" "tcp:$PROBE_PORT"

log "cold starting the app"
adb_s logcat -c
adb_s shell am force-stop "$PACKAGE"
adb_s shell cmd uimode night yes >/dev/null 2>&1 || true
adb_s shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null

log "reading probe token from logcat"
TOKEN=''
for _ in $(seq 1 40); do
  TOKEN="$(adb_s logcat -d -s HaroldProbe:I | grep -o 'token=[0-9a-f]*' | tail -1 | cut -d= -f2 || true)"
  if [[ -n "$TOKEN" ]]; then
    break
  fi
  sleep 0.5
done
if [[ -z "$TOKEN" ]]; then
  echo "the probe never announced a token. Is this the debug build?" >&2
  exit 1
fi
echo "probe token: ${TOKEN:0:8}..."

log "recording"
adb_s shell rm -f "$REMOTE_VIDEO" >/dev/null 2>&1 || true
adb_s shell screenrecord --bit-rate 12000000 --time-limit 180 "$REMOTE_VIDEO" &
RECORDER=$!
sleep 1

set +e
HAROLD_PROBE_URL="http://127.0.0.1:$PROBE_PORT" \
HAROLD_PROBE_TOKEN="$TOKEN" \
HAROLD_POC_OUT="$WORK" \
HAROLD_DEMO_SSH_PORT="$SSH_PORT" \
HAROLD_DEMO_CONTAINER="$CONTAINER" \
ANDROID_SERIAL="$ANDROID_SERIAL" \
bun run "$HERE/src/poc.ts"
POC_STATUS=$?
set -e

log "stopping the recorder"
adb_s shell pkill -INT screenrecord >/dev/null 2>&1 || true
wait "$RECORDER" 2>/dev/null || true
sleep 1
adb_s pull "$REMOTE_VIDEO" "$WORK/poc.mp4" >/dev/null
adb_s shell rm -f "$REMOTE_VIDEO" >/dev/null 2>&1 || true
adb_s exec-out screencap -p >"$WORK/final.png" || true

log "done"
echo "poc exit:   $POC_STATUS"
echo "video:      $WORK/poc.mp4"
echo "report:     $WORK/report.json"
echo "screenshot: $WORK/final.png"
exit "$POC_STATUS"
