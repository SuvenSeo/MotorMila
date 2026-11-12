#!/usr/bin/env python3
"""web/premium-p0 codemod: raw Tailwind palette classes -> semantic tokens that
flip with light/dark (styles/tokens.css). Deliberately left alone: text-white
and bg/from/via/to-black (type and scrims over photos), and charts' runtime
palettes (safelisted). Idempotent. Usage: python3 scripts/codemods/color-tokens.py [paths…]"""
import re, sys, pathlib

GOOD = "emerald|green|teal|lime"
HIGH = "rose|red|pink"
CAUTION = "amber|yellow|orange"
INFO = "sky|blue|indigo|cyan|violet|purple"
NEUTRAL = "zinc|gray|slate|neutral|stone"
PROPS = "bg|text|border|ring|from|via|to|fill|stroke|outline|divide|decoration|placeholder"
ALPHA = r"(/(?:\[[0-9.]+\]|[0-9]+))?"
RX = re.compile(rf"(?<![\w-])({PROPS})-({GOOD}|{HIGH}|{CAUTION}|{INFO}|{NEUTRAL}|white)(?:-([0-9]{{2,3}}))?{ALPHA}(?![\w/-])")

def family(c):
  for name, fam in (("good", GOOD), ("high", HIGH), ("caution", CAUTION), ("info", INFO), ("neutral", NEUTRAL)):
    if re.fullmatch(fam, c): return name
  return c

def deal(prop, tone, shade, alpha):
  if prop in ("text", "fill", "stroke", "decoration", "placeholder"):
    if tone == "info": return f"{prop}-primary" + (alpha or "")
    return f"{prop}-deal-{tone}-text" + (alpha or "")
  if tone == "info": return f"{prop}-primary" + (alpha or "")
  return f"{prop}-deal-{tone}" + (alpha or "")

def neutral(prop, shade, alpha):
  s = int(shade or 500)
  if prop in ("text", "fill", "stroke", "placeholder", "decoration"):
    if s <= 200: return f"{prop}-foreground" + (alpha or "/90")
    if s <= 500: return f"{prop}-muted-foreground" + (alpha or "")
    return f"{prop}-foreground" + (alpha or "")
  if prop == "bg":
    if s <= 100: return "bg-muted" + (alpha or "")
    if s <= 300: return "bg-secondary" + (alpha or "")
    if s <= 600: return "bg-muted-foreground" + (alpha or "")  # data swatches / dots
    return "bg-card" + (alpha or "")
  return f"{prop}-border"

def white(prop, alpha):
  if prop in ("text", "fill", "stroke", "from", "via", "to"): return None  # photo type / gradients stay
  if prop in ("border", "divide", "ring", "outline"):
    return f"{prop}-border" if prop != "ring" else "ring-border"
  return f"{prop}-foreground" + (alpha or "")

def sub(m):
  prop, color, shade, alpha = m.group(1), m.group(2), m.group(3), m.group(4)
  if color == "white":
    r = white(prop, alpha)
    return r or m.group(0)
  tone = family(color)
  if tone == "neutral": return neutral(prop, shade, alpha)
  return deal(prop, tone, shade, alpha)

def run(s):
  s = RX.sub(sub, s)
  # `x dark:x` after mapping -> `x`
  s = re.sub(r"(?<![\w:-])([a-z][\w/\[\].-]*) dark:\1(?=[\s\"'`}])", r"\1", s)
  s = re.sub(r"(?<![\w:-])dark:([a-z][\w/\[\].-]*) \1(?=[\s\"'`}])", r"\1", s)
  return s

targets = sys.argv[1:] or ["src"]
n = 0
for t in targets:
  for p in (pathlib.Path(t).rglob("*.tsx") if pathlib.Path(t).is_dir() else [pathlib.Path(t)]):
    if "charts" in p.parts or "test" in p.parts: continue
    s = p.read_text(); r = run(s)
    if r != s: p.write_text(r); n += 1
print("files changed:", n)
