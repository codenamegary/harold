#!/usr/bin/env bash
# Seed the factory-reset emulator with the demo assets.
#
# capture.sh boots the AVD with -wipe-data, so the emulator starts with no
# prior photos, downloads, app data, or permissions. cats.zip is extracted
# into the capture work directory and its photos are pushed to DCIM/Camera;
# cat-diary.txt is pushed to Download. A MediaStore scan follows so the Android
# photo picker, file picker, and gallery see the deployed assets.
set -euo pipefail

SERIAL="${SERIAL:-emulator-5554}"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEMO=$(cd "$SCRIPT_DIR/.." && pwd)
WORK="${WORK:-$DEMO/work/capture}"
ASSETS="$SCRIPT_DIR/assets"
ARCHIVE="${PHOTOS_ARCHIVE:-$ASSETS/cats.zip}"
DOCUMENT="${DOCUMENT_SOURCE:-$ASSETS/cat-diary.txt}"
PHOTOS_DIR="${PHOTOS_DIR:-/sdcard/DCIM/Camera}"
DOCUMENTS_DIR="${DOCUMENTS_DIR:-/sdcard/Download}"
EXTRACT_DIR="$WORK/photos"

die() { echo "push_assets.sh: $*" >&2; exit 1; }

for tool in adb unzip; do
  command -v "$tool" >/dev/null || die "$tool is not on PATH"
done
[[ -f "$ARCHIVE" ]] || die "photo archive not found at $ARCHIVE (set PHOTOS_ARCHIVE)"
[[ -f "$DOCUMENT" ]] || die "document not found at $DOCUMENT (set DOCUMENT_SOURCE)"

# The first boot after -wipe-data can briefly drop adb while system services
# and package manager settle. Wait for the device instead of failing the run.
state=""
for _ in $(seq 1 60); do
  state=$(adb -s "$SERIAL" get-state 2>/dev/null | tr -d '\r' || true)
  [[ "$state" == "device" ]] && break
  sleep 1
done
[[ "$state" == "device" ]] || die "$SERIAL is not available (adb state: ${state:-none})"

# Single-quote a remote path for the adb shell command line.
shell_quote() {
  printf "'%s'" "${1//\'/\'\\\'\'}"
}

# Push one file unless the remote copy has the same name and size.
pushed=0
skipped=0
push_file() {
  local source=$1
  local remote_dir=$2
  local name=${source##*/}
  local remote="$remote_dir/$name"
  local local_size remote_size push_output

  local_size=$(stat -c %s "$source")
  remote_size=$(adb -s "$SERIAL" shell "stat -c %s $(shell_quote "$remote")" 2>/dev/null </dev/null |
    tr -d '\r' || true)
  if [[ "$remote_size" == "$local_size" ]]; then
    skipped=$((skipped + 1))
    return
  fi
  if ! push_output=$(adb -s "$SERIAL" push "$source" "$remote" 2>&1 </dev/null); then
    printf '%s\n' "$push_output" >&2
    die "failed to push $name"
  fi
  pushed=$((pushed + 1))
}

# Clean extract each run so entries removed or renamed in the zip do not
# linger and get pushed as extras.
[[ -n "$EXTRACT_DIR" ]] || die "empty extract path"
rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
unzip -ojq "$ARCHIVE" -d "$EXTRACT_DIR"

adb -s "$SERIAL" shell mkdir -p "$(shell_quote "$PHOTOS_DIR")" >/dev/null
adb -s "$SERIAL" shell mkdir -p "$(shell_quote "$DOCUMENTS_DIR")" >/dev/null

while IFS= read -r -d '' source; do
  push_file "$source" "$PHOTOS_DIR"
done < <(find "$EXTRACT_DIR" -type f -print0 | sort -z)
push_file "$DOCUMENT" "$DOCUMENTS_DIR"

# Rescan even when nothing was pushed: an earlier run may have copied the
# files but failed before the scan landed.
adb -s "$SERIAL" shell content call --method scan_volume --uri content://media \
  --arg external_primary >/dev/null

echo "assets: $skipped already on $SERIAL, $pushed pushed"
