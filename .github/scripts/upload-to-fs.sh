#!/usr/bin/env bash
# Upload files or a directory tree to fs.codenamegary.com (copyparty).
#
# Env:
#   FS_URL       Base URL (default: https://fs.codenamegary.com)
#   FS_USER      Copyparty username
#   FS_PASSWORD  Copyparty password
#   LOCAL_PATH   File or directory to upload
#   REMOTE_PATH  Destination path under the server root (no leading slash)
#                Directory uploads preserve relative paths under REMOTE_PATH.

set -euo pipefail

: "${FS_USER:?FS_USER is required}"
: "${FS_PASSWORD:?FS_PASSWORD is required}"
: "${LOCAL_PATH:?LOCAL_PATH is required}"
: "${REMOTE_PATH:?REMOTE_PATH is required}"

FS_URL="${FS_URL:-https://fs.codenamegary.com}"
if [[ -z "$FS_URL" ]]; then
  FS_URL="https://fs.codenamegary.com"
fi
FS_URL="${FS_URL%/}"
REMOTE_PATH="${REMOTE_PATH#/}"
REMOTE_PATH="${REMOTE_PATH%/}"

if [[ ! -e "$LOCAL_PATH" ]]; then
  echo "LOCAL_PATH not found: $LOCAL_PATH" >&2
  exit 1
fi

encode_path() {
  python3 -c '
import sys
from urllib.parse import quote
parts = [p for p in sys.argv[1].split("/") if p]
print("/".join(quote(p, safe="") for p in parts))
' "$1"
}

upload_file() {
  local src="$1"
  local dest_rel="$2"
  local encoded
  encoded="$(encode_path "$dest_rel")"
  local url="${FS_URL}/${encoded}"

  echo "PUT ${dest_rel}"
  curl -fsS \
    --retry 3 \
    --retry-all-errors \
    -u "${FS_USER}:${FS_PASSWORD}" \
    -T "$src" \
    "$url" >/dev/null
}

if [[ -f "$LOCAL_PATH" ]]; then
  name="$(basename "$LOCAL_PATH")"
  upload_file "$LOCAL_PATH" "${REMOTE_PATH}/${name}"
elif [[ -d "$LOCAL_PATH" ]]; then
  local_root="$(cd "$LOCAL_PATH" && pwd)"
  while IFS= read -r -d "" src; do
    rel="${src#"$local_root"/}"
    upload_file "$src" "${REMOTE_PATH}/${rel}"
  done < <(find "$local_root" -type f -print0 | sort -z)
else
  echo "LOCAL_PATH must be a file or directory: $LOCAL_PATH" >&2
  exit 1
fi

echo "Uploaded to ${FS_URL}/${REMOTE_PATH}/"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## Uploaded to fs"
    echo ""
    echo "Remote: [\`${REMOTE_PATH}\`](${FS_URL}/${REMOTE_PATH}/)"
  } >>"$GITHUB_STEP_SUMMARY"
fi
