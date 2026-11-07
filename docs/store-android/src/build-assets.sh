#!/usr/bin/env bash
# Rebuild the Play icon and the feature graphic.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
store="$root/docs/store-android"
src="$store/src"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

chrome="${CHROME:-$(command -v google-chrome-stable || command -v google-chrome || true)}"
if [[ -z "$chrome" ]]; then
  echo "Chrome is required to render the feature graphic. Set CHROME to a Chrome binary." >&2
  exit 1
fi

# The Play icon must be an opaque square. Play applies the launcher mask.
convert -background none "$src/app-icon.svg" -resize 512x512 \
  -alpha remove -alpha off -depth 8 -define png:color-type=2 \
  "PNG24:$store/app-icon-512x512.png"

# The feature graphic uses the Geist fonts checked in beside the HTML.
"$chrome" --headless=new --disable-gpu --hide-scrollbars --no-sandbox \
  --user-data-dir="$tmp/chrome" --force-device-scale-factor=1 \
  --window-size=1024,500 --virtual-time-budget=3000 \
  --screenshot="$store/feature-graphic-1024x500.png" \
  "file://$src/feature-graphic.html" >/dev/null 2>&1

printf '\n'
identify -format '%f  %wx%h  %b\n' \
  "$store/app-icon-512x512.png" \
  "$store/feature-graphic-1024x500.png"
