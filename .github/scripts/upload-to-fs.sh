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
#   FS_KEEP_RECENT  Optional. After upload, delete older remote files so only
#                   this many build groups remain. Groups files by timestamp
#                   prefix (YYYYMMDD-HHMMSS) when filenames match that pattern.

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

prune_remote() {
  local keep="${FS_KEEP_RECENT:-}"
  if [[ -z "$keep" || ! "$keep" =~ ^[0-9]+$ ]]; then
    return 0
  fi

  local encoded_dir
  encoded_dir="$(encode_path "$REMOTE_PATH")"
  local list_url="${FS_URL}/${encoded_dir}/?ls"
  local delete_paths
  delete_paths="$(
    curl -fsS \
      --retry 3 \
      --retry-all-errors \
      -u "${FS_USER}:${FS_PASSWORD}" \
      "$list_url" \
      | FS_KEEP_RECENT="$keep" REMOTE_PATH="$REMOTE_PATH" python3 -c '
import json
import os
import re
import sys

keep = int(os.environ["FS_KEEP_RECENT"])
remote_path = os.environ["REMOTE_PATH"].strip("/")
group_re = re.compile(r"^(\d{8}-\d{6})")

listing = json.load(sys.stdin)
names = [entry["href"] for entry in listing.get("files", []) if entry.get("href")]

groups: dict[str, list[str]] = {}
for name in names:
    match = group_re.match(name)
    key = match.group(1) if match else name
    groups.setdefault(key, []).append(name)

stale: list[str] = []
for key in sorted(groups.keys(), reverse=True)[keep:]:
    for name in groups[key]:
        stale.append(f"/{remote_path}/{name}")

print(json.dumps(stale))
'
  )"

  if [[ "$delete_paths" == "[]" ]]; then
    echo "No remote files to prune (keeping ${keep} most recent build groups)"
    return 0
  fi

  echo "Pruning older remote files (keeping ${keep} most recent build groups)"
  curl -fsS \
    --retry 3 \
    --retry-all-errors \
    -u "${FS_USER}:${FS_PASSWORD}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$delete_paths" \
    "${FS_URL}/?delete" >/dev/null
}

prune_remote

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## Uploaded to fs"
    echo ""
    echo "Remote: [\`${REMOTE_PATH}\`](${FS_URL}/${REMOTE_PATH}/)"
    if [[ -n "${FS_KEEP_RECENT:-}" ]]; then
      echo ""
      echo "Retention: ${FS_KEEP_RECENT} most recent build groups"
    fi
  } >>"$GITHUB_STEP_SUMMARY"
fi
