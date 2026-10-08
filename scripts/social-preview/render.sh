#!/bin/sh
# Renders social-preview.html to docs/social-preview.png (1280 × 640) with headless Chromium.
# Usage: sh scripts/social-preview/render.sh
# CHROMIUM=/path/to/chromium picks the binary, CHROMIUM_FLAGS adds flags (e.g. --no-sandbox as root).
# If the image ends in a white strip, use Chromium's headless_shell: it renders the exact window size.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out="$here/../../docs/social-preview.png"
# shellcheck disable=SC2086
"${CHROMIUM:-chromium}" ${CHROMIUM_FLAGS:-} --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1280,640 --virtual-time-budget=2000 \
  --screenshot="$out" "file://$here/social-preview.html"
echo "written $out"
