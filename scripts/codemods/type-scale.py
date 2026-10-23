#!/usr/bin/env python3
"""web/premium-p0 codemod: map every arbitrary text-[N] size and legacy Tailwind
size name onto the 9-step type scale, and every tracking value onto 4 steps.
Idempotent. Run from the repo root: python3 scripts/codemods/type-scale.py"""
import re, pathlib, sys

PX = {  # px -> token
  9: "caption", 9.5: "caption", 10: "caption", 10.5: "caption", 11: "caption", 11.5: "caption", 12: "caption",
  12.5: "footnote", 13: "footnote", 13.5: "footnote", 14: "body",
  15: "body", 16: "body", 17: "callout", 18: "callout",
  19: "title3", 20: "title3", 21: "title3", 21.6: "title3", 22: "title2",
}
def token_for_px(px: float) -> str:
  if px in PX: return PX[px]
  if px < 12.25: return "caption"
  if px < 14: return "footnote"
  if px < 16.5: return "body"
  if px < 18.5: return "callout"
  if px < 22: return "title3"
  if px < 28.5: return "title2"
  if px < 37: return "title1"
  if px < 46: return "large"
  return "hero"

LEGACY = {
  "2xs": "caption", "xs": "caption", "label": "caption", "caption": "caption",
  "sm": "footnote", "base": "body", "lg": "callout", "xl": "title3",
  "2xl": "title2", "3xl": "title1", "4xl": "title1", "5xl": "large",
  "6xl": "hero", "7xl": "hero", "8xl": "hero", "9xl": "hero",
  "display-sm": "large", "display": "hero",
  "tremor-label": "caption", "tremor-default": "footnote", "tremor-title": "callout", "tremor-metric": "title1",
}
ARB = re.compile(r"(?<![\w-])text-\[(\d+(?:\.\d+)?)(px|rem)\]")
LEG = re.compile(r"(?<![\w-])text-(" + "|".join(sorted(map(re.escape, LEGACY), key=len, reverse=True)) + r")(?![\w-])")
TRACK = re.compile(r"(?<![\w-])tracking-(\[-?\d*\.?\d+em\]|tighter|tight|normal|wide|wider|widest|started)(?![\w-])")

def track(m):
  v = m.group(1)
  if v.startswith("["):
    n = float(v[1:-3])
    if n <= -0.015: return "tracking-tight"
    if n < 0.04: return "tracking-normal"
    return "tracking-caps"
  return {"tighter": "tracking-tight", "tight": "tracking-tight", "normal": "tracking-normal",
          "wide": "tracking-wide", "wider": "tracking-caps", "widest": "tracking-caps", "started": ""}[v]

def run(text: str) -> str:
  text = ARB.sub(lambda m: "text-" + token_for_px(float(m.group(1)) * (16 if m.group(2) == "rem" else 1)), text)
  text = LEG.sub(lambda m: "text-" + LEGACY[m.group(1)], text)
  text = TRACK.sub(track, text)
  return text

changed = 0
for p in pathlib.Path("src").rglob("*"):
  if p.suffix not in {".ts", ".tsx", ".css"} or "locales" in p.parts: continue
  s = p.read_text()
  n = run(s)
  if n != s:
    p.write_text(n); changed += 1
print("files changed:", changed)
