#!/usr/bin/env python3
"""web/premium-p0 codemod: one motion system.
- JS: legacy springSoft/springSnappy/springBouncy and the old duration/ease/spring
  keys -> the new tokens in src/lib/motion.ts
- CSS + Tailwind classes: 11 cubic-beziers and 16 duration vars -> 3 easings, 4 durations
- transition-all -> transition-ui (colour/opacity/transform/shadow only)
Idempotent."""
import re, pathlib

JS = [
  (r"\bspringSoft\b", "spring.smooth"), (r"\bspringSnappy\b", "spring.snappy"), (r"\bspringBouncy\b", "spring.expressive"),
  (r"\bspring\.gentle\b", "spring.smooth"), (r"\bspring\.bouncy\b", "spring.expressive"),
  (r"\bease\.emphasized\b", "ease.decelerate"), (r"\bease\.exit\b", "ease.accelerate"),
  (r"\bduration\.instant\b", "duration.micro"), (r"\bduration\.fast\b", "duration.short"),
  (r"\bduration\.base\b", "duration.medium"), (r"\bduration\.slow\b", "duration.long"), (r"\bduration\.page\b", "duration.medium"),
  (r"\bmotionTransition\.fast\b", "motionTween.short"), (r"\bmotionTransition\.exit\b", "motionTween.exit"),
  (r"transition as motionTransition", "tween as motionTween"),
]
BEZ = {
  "0.2,0,0,1": "standard", "0.3,0,0,1": "decelerate", "0.16,1,0.3,1": "decelerate", "0.22,1,0.36,1": "decelerate",
  "0.33,1,0.68,1": "decelerate", "0.32,0.72,0,1": "decelerate", "0.4,0,1,1": "accelerate",
  "0.34,1.56,0.64,1": "standard", "0.85,0,0.15,1": "standard",
}
VARS = {
  "--ease-out": "--ease-decelerate", "--ease-soft": "--ease-standard", "--ease-spring-gentle": "--ease-standard",
  "--ease-spring-bouncy": "--ease-standard", "--ease-spring": "--ease-standard", "--ease-emphasized": "--ease-decelerate",
  "--ease-exit": "--ease-accelerate",
  "--duration-fast": "--dur-short", "--duration-base": "--dur-medium", "--duration-slow": "--dur-long",
  "--duration-cinematic": "--dur-long", "--dur-instant": "--dur-micro", "--dur-fast": "--dur-short",
  "--dur-base": "--dur-medium", "--dur-slow": "--dur-long", "--dur-page": "--dur-medium",
}
TW_DUR = {"75": "micro", "100": "micro", "150": "short", "200": "short", "300": "medium", "500": "long", "700": "long", "1000": "long"}
TW_EASE = {"apple": "decelerate", "out": "decelerate", "in": "accelerate", "in-out": "standard", "linear": "linear", "standard": "standard"}

def bez(m):
  key = re.sub(r"\s+", "", m.group(1))
  return f"var(--ease-{BEZ[key]})" if key in BEZ else m.group(0)

def run(s: str, css: bool) -> str:
  if not css:
    for a, b in JS: s = re.sub(a, b, s)
  # arbitrary tailwind ease/duration classes first
  s = re.sub(r"(?<![\w-])ease-\[cubic-bezier\(([^)]*)\)\]", lambda m: "ease-" + BEZ.get(re.sub(r"\s+", "", m.group(1)), "standard"), s)
  s = re.sub(r"(?<![\w-])ease-\[var\(--([a-z-]+)\)\]", lambda m: "ease-" + VARS.get("--" + m.group(1), "--" + m.group(1)).replace("--ease-", ""), s)
  s = re.sub(r"(?<![\w-])duration-\[var\(--([a-z-]+)\)\]", lambda m: "duration-" + VARS.get("--" + m.group(1), "--" + m.group(1)).replace("--dur-", ""), s)
  s = re.sub(r"cubic-bezier\(([^)]*)\)", bez, s)
  for a, b in sorted(VARS.items(), key=lambda kv: -len(kv[0])):
    s = re.sub(re.escape(a) + r"(?![\w-])", b, s)
  if not css:
    s = re.sub(r"(?<![\w-])duration-(75|100|150|200|300|500|700|1000)(?![\w-])", lambda m: "duration-" + TW_DUR[m.group(1)], s)
    s = re.sub(r"(?<![\w-])ease-(apple|out|in-out|in)(?![\w-])", lambda m: "ease-" + TW_EASE[m.group(1)], s)
    s = re.sub(r"(?<![\w-])transition-all(?![\w-])", "transition-ui", s)
  else:
    s = re.sub(r"transition:\s*all\b", "transition: opacity", s)
  return s

n = 0
for p in pathlib.Path("src").rglob("*"):
  if p.suffix not in {".ts", ".tsx", ".css"} or p.name == "motion.ts": continue
  t = p.read_text(); r = run(t, p.suffix == ".css")
  if r != t: p.write_text(r); n += 1
print("files changed:", n)
