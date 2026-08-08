#!/usr/bin/env bash
# Upload HTML coverage to Google Drive, mirroring folder structure under a dated subfolder.
# Requires: rclone, curl, unzip
#
# Env:
#   GDRIVE_CREDENTIALS  Service account JSON (plain or base64)
#   GDRIVE_FOLDER_ID    Parent Drive folder id
#   GDRIVE_OWNER        Workspace user to impersonate (domain-wide delegation)
#   COVERAGE_HTML       Local HTML report root (default: coverage/html)

set -euo pipefail

: "${GDRIVE_CREDENTIALS:?GDRIVE_CREDENTIALS is required}"
: "${GDRIVE_FOLDER_ID:?GDRIVE_FOLDER_ID is required}"
: "${GDRIVE_OWNER:?GDRIVE_OWNER is required}"

COVERAGE_HTML="${COVERAGE_HTML:-coverage/html}"

if [[ ! -d "$COVERAGE_HTML" ]]; then
  echo "Coverage HTML directory not found: $COVERAGE_HTML" >&2
  exit 1
fi

stamp="$(date -u +%Y%m%d-%H%M%S)"
folder_name="${stamp}-web-coverage"

cred_file="$(mktemp)"
rclone_dir=""
rclone_bin=""
cleanup() {
  rm -f "$cred_file"
  if [[ -n "$rclone_dir" ]]; then
    rm -rf "$rclone_dir"
  fi
}
trap cleanup EXIT

if [[ "$GDRIVE_CREDENTIALS" == \{* ]]; then
  printf '%s' "$GDRIVE_CREDENTIALS" >"$cred_file"
else
  printf '%s' "$GDRIVE_CREDENTIALS" | base64 --decode >"$cred_file"
fi

if ! command -v rclone >/dev/null 2>&1; then
  rclone_version="1.69.3"
  rclone_dir="$(mktemp -d)"
  rclone_zip="$rclone_dir/rclone.zip"
  curl -fsSL \
    "https://downloads.rclone.org/v${rclone_version}/rclone-v${rclone_version}-linux-amd64.zip" \
    -o "$rclone_zip"
  unzip -q "$rclone_zip" -d "$rclone_dir"
  rclone_bin="$rclone_dir/rclone-v${rclone_version}-linux-amd64/rclone"
  chmod +x "$rclone_bin"
else
  rclone_bin="$(command -v rclone)"
fi

export RCLONE_CONFIG_GDRIVE_TYPE=drive
export RCLONE_CONFIG_GDRIVE_SCOPE=drive
export RCLONE_CONFIG_GDRIVE_SERVICE_ACCOUNT_FILE="$cred_file"
export RCLONE_CONFIG_GDRIVE_IMPERSONATE="$GDRIVE_OWNER"
export RCLONE_CONFIG_GDRIVE_ROOT_FOLDER_ID="$GDRIVE_FOLDER_ID"

echo "Uploading $COVERAGE_HTML -> Drive/${folder_name}/"

"$rclone_bin" copy "$COVERAGE_HTML" "gdrive:${folder_name}" \
  --create-empty-src-dirs \
  --transfers 8 \
  --checkers 8

echo "Uploaded coverage to Google Drive folder: ${folder_name}"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## Google Drive coverage"
    echo ""
    echo "Folder: \`${folder_name}\`"
  } >>"$GITHUB_STEP_SUMMARY"
fi
