#!/usr/bin/env bash
# Rebuild the self-hosted Cal Sans WOFF2 subsets in public/fonts/cal-sans/ from
# the official calcom/sans v2.011 release (SIL OFL 1.1). Needs fonttools + brotli
# (pip install fonttools brotli). Metrics are untouched: the narrow Display word
# space (332/2000 em) is by design and is topped up in CSS (--display-word-spacing).
set -euo pipefail
OUT="$(cd "$(dirname "$0")/../.." && pwd)/public/fonts/cal-sans"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
curl -sSL -o "$TMP/full.zip" https://github.com/calcom/sans/releases/download/v2.011/calsans-static-full.zip
unzip -q "$TMP/full.zip" -d "$TMP"
TTF="$TMP/calsans-static-full/ttf"
# Basic Latin incl. space, Latin-1 incl. NBSP, the few Latin Ext glyphs the UI
# uses, combining marks, General Punctuation, Currency Symbols, arrows/maths.
U="U+000D,U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+2000-206F,U+20A0-20C0,U+2122,U+2190-2193,U+2212,U+2215,U+2248,U+2260,U+2264-2265"
for pair in "CalSans-SemiBold display-600" "CalSans-Bold display-700" \
            "CalSansTextUI-Regular text-400" "CalSansTextUI-Medium text-500" "CalSansTextUI-SemiBold text-600"; do
  set -- $pair
  pyftsubset "$TTF/$1.ttf" --unicodes="$U" --layout-features='kern,mark,mkmk,calt,case,ccmp,frac,liga,locl,ss01,tnum,zero' --no-hinting --flavor=woff2 \
    --output-file="$OUT/cal-sans-$2.woff2"
done
echo "Wrote $(ls "$OUT"/*.woff2 | wc -l) subsets to $OUT"
