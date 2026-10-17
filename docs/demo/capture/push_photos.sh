#!/usr/bin/env bash
# Seed the emulator camera roll with the demo photos.
#
# cats.zip is extracted into the capture work directory, then each photo is
# pushed to DCIM/Camera only when the emulator does not already hold a file
# with the same name and size. A MediaStore scan follows so the Android photo
# picker and gallery can see the files. Safe to run on every capture: existing
# photos are skipped, so repeated runs do not stack up copies.
set -euo pipefail

SERIAL="${SERIAL:-emulator-5554}"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEMO=$(cd "$SCRIPT_DIR/.." && pwd)
WORK="${WORK:-$DEMO/work/capture}"
ARCHIVE="${PHOTOS_ARCHIVE:-$SCRIPT_DIR/assets/cats.zip}"
REMOTE_DIR="${PHOTOS_DIR:-/sdcard/DCIM/Camera}"
EXTRACT_DIR="$WORK/photos"

die() { echo "push_photos.sh: $*" >&2; exit 1; }

for tool in adb unzip; do
  command -v "$tool" >/dev/null || die "$tool is not on PATH"
done
[[ -f "$ARCHIVE" ]] || die "photo archive not found at $ARCHIVE (set PHOTOS_ARCHIVE)"
adb -s "$SERIAL" get-state >/dev/null 2>&1 || die "$SERIAL is not available"

# Clean extract each run so entries removed or renamed in the zip do not
# linger and get pushed as extras.
[[ -n "$EXTRACT_DIR" ]] || die "empty extract path"
rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
unzip -ojq "$ARCHIVE" -d "$EXTRACT_DIR"

# Single-quote a remote path for the adb shell command line.
shell_quote() {
  printf "'%s'" "${1//\'/\'\\\'\'}"
}

adb -s "$SERIAL" shell mkdir -p "$(shell_quote "$REMOTE_DIR")" >/dev/null

pushed=0
skipped=0
while IFS= read -r -d '' source; do
  name=${source##*/}
  remote="$REMOTE_DIR/$name"
  local_size=$(stat -c %s "$source")
  remote_size=$(adb -s "$SERIAL" shell "stat -c %s $(shell_quote "$remote")" 2>/dev/null </dev/null |
    tr -d '\r' || true)
  if [[ "$remote_size" == "$local_size" ]]; then
    skipped=$((skipped + 1))
    continue
  fi
  if ! push_output=$(adb -s "$SERIAL" push "$source" "$remote" 2>&1 </dev/null); then
    printf '%s\n' "$push_output" >&2
    die "failed to push $name"
  fi
  pushed=$((pushed + 1))
done < <(find "$EXTRACT_DIR" -type f -print0 | sort -z)

# Rescan even when nothing was pushed: an earlier run may have copied the
# files but failed before the scan landed.
adb -s "$SERIAL" shell content call --method scan_volume --uri content://media \
  --arg external_primary >/dev/null

echo "photos: $skipped already on $SERIAL, $pushed pushed to $REMOTE_DIR"
