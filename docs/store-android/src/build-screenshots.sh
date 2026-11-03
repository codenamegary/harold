#!/usr/bin/env bash
# Rebuild the Google Play phone screenshots from the committed demo slices.
#
# The demo records a 1080x2400 (9:20) phone. Play asks for 9:16, so each frame
# is scaled to 850x1888 and placed on a 1080x1920 ink card. Everything the app
# rendered is kept; only the surrounding canvas is added.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
store="$root/docs/store-android"
slices="$root/docs/demo/render/public/slices"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

labels=(pairing sessions plan answer build changes worktrees ship)
clips=(
  007-paired
  008-session_menu_open
  024-plan_reply
  026-elicitation_pick
  033-usage
  036-changes_file
  038-worktrees_open
  043-pr_reply
)
times=(1.8 7.6 4.68 3.2 0.52 6.6 5.7 2.18)

convert -size 850x1888 xc:none -fill white \
  -draw "roundrectangle 0,0 849,1887 26,26" "$tmp/mask.png"

for i in "${!labels[@]}"; do
  number="$(printf '%02d' "$((i + 1))")"
  label="${labels[$i]}"
  clip="${clips[$i]}"
  time="${times[$i]}"
  out="$store/phone-$number-$label.png"

  ffmpeg -v error -ss "$time" -i "$slices/$clip.mp4" -frames:v 1 -y "$tmp/frame.png"
  convert "$tmp/frame.png" -resize 850x1888\! "$tmp/mask.png" \
    -alpha off -compose CopyOpacity -composite "$tmp/card.png"
  convert "$tmp/card.png" -fill none -stroke '#242A35' -strokewidth 1 \
    -draw "roundrectangle 0.5,0.5 849.5,1887.5 26,26" "$tmp/card-border.png"
  convert -size 1080x1920 xc:'#080A0D' "$tmp/card-border.png" \
    -geometry +115+16 -composite -depth 8 -define png:color-type=2 \
    "PNG24:$out"

  printf '%s  %s\n' "$(basename "$out")" "$(identify -format '%wx%h %b' "$out")"
done
