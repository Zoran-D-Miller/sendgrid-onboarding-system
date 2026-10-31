#!/usr/bin/env bash
# Full-page screenshots of rendered previews at desktop and mobile widths.
# Uses Playwright's CLI driving the locally installed Chrome (--channel chrome),
# so no browser download is needed. Run `npm run render` first.
#
# Usage: scripts/screenshots.sh [preview-glob]   (default: all previews)

set -euo pipefail
cd "$(dirname "$0")/.."

OUT=docs/screenshots
mkdir -p "$OUT"

for file in previews/${1:-*}.html; do
  name=$(basename "$file" .html)
  # 640px = a typical desktop reading pane; 375px = iPhone width.
  for size in "desktop:640,900" "mobile:375,812"; do
    label=${size%%:*}
    viewport=${size#*:}
    npx -y playwright@1.48.2 screenshot --channel chrome --full-page \
      --viewport-size "$viewport" "file://$PWD/$file" "$OUT/$name--$label.png" >/dev/null
    echo "saved $OUT/$name--$label.png"
  done
done
