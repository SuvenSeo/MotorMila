#!/usr/bin/env python3
"""TEMPORARY screenshot crawl for branch android/apple-polish (delete before merge).

Visits every MotorMila screen through deep links / bottom tabs and saves a
screenshot + uiautomator dump per screen for one configuration
(language x theme x font scale). Debug builds accept the QA extras
mm_qa_theme / mm_qa_lang on MainActivity (see MainActivity.applyQaOverrides).

Usage: apple_crawl.py --apk app.apk --out qa-out --lang en --theme light [--font 1.0]
"""
import argparse, json, os, re, subprocess, time, urllib.request
import xml.etree.ElementTree as ET

PKG = "lk.motormila.app.debug"
ACT = f"{PKG}/lk.motormila.app.MainActivity"
API = "https://seo292-vehicle-platform-backend.hf.space/api/v1"
WEB = "https://motormila.pages.dev"

ap = argparse.ArgumentParser()
ap.add_argument("--apk", required=True)
ap.add_argument("--out", default="qa-out")
ap.add_argument("--lang", default="en")
ap.add_argument("--theme", default="light")
ap.add_argument("--font", default="1.0")
ap.add_argument("--subset", default="")
args = ap.parse_args()
TAG = f"{args.lang}-{args.theme}" + ("" if args.font in ("1", "1.0") else f"-font{args.font}")
OUT = os.path.join(args.out, TAG)
os.makedirs(OUT, exist_ok=True)
RESULTS = []


def sh(cmd, timeout=90):
    try:
        p = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired:
        return "TIMEOUT"


def adb(c, timeout=90):
    return sh(f"adb {c}", timeout)


def dump():
    for _ in range(3):
        out = adb("exec-out uiautomator dump /dev/tty", 40)
        m = re.search(r"<\?xml.*</hierarchy>", out, re.S)
        if m:
            try:
                return m.group(0), ET.fromstring(m.group(0))
            except ET.ParseError:
                pass
        time.sleep(1)
    return "", None


def nodes(root):
    if root is None:
        return []
    res = []
    for e in root.iter("node"):
        b = list(map(int, re.findall(r"\d+", e.get("bounds", "[0,0][0,0]"))))
        res.append({"text": e.get("text", ""), "desc": e.get("content-desc", ""),
                    "cls": e.get("class", ""), "click": e.get("clickable") == "true", "b": b})
    return res


def dismiss_noise():
    _, root = dump()
    for n in nodes(root):
        if re.fullmatch(r"Later|පසුව|பின்னர்|Not now", n["text"] or ""):
            x = (n["b"][0] + n["b"][2]) // 2
            y = (n["b"][1] + n["b"][3]) // 2
            adb(f"shell input tap {x} {y}")
            time.sleep(1)
            return True
    return False


def alive():
    return adb(f"shell pidof {PKG}").strip() != ""


def snap(name, settle=6):
    time.sleep(settle)
    dismiss_noise()
    fn = os.path.join(OUT, f"{len(RESULTS)+1:02d}_{name}.png")
    sh(f"adb exec-out screencap -p > '{fn}'")
    xml, root = dump()
    with open(fn.replace(".png", ".xml"), "w") as f:
        f.write(xml)
    ns = nodes(root)
    texts = [n["text"] or n["desc"] for n in ns if (n["text"] or n["desc"])]
    small_targets = [n for n in ns if n["click"] and n["b"][2] - n["b"][0] > 0 and
                     min(n["b"][2] - n["b"][0], n["b"][3] - n["b"][1]) < 96]  # < 48dp at xxhdpi(2.625)~126; 96px ≈ 36dp
    crash = not alive()
    RESULTS.append({"screen": name, "shot": os.path.basename(fn), "alive": not crash,
                    "n_nodes": len(ns), "n_small_targets": len(small_targets),
                    "texts": texts[:40]})
    print(f"{'OK ' if not crash else 'DEAD'} {name}: {len(ns)} nodes, small targets {len(small_targets)}", flush=True)
    if crash:
        start()


def start(extra=""):
    return adb(f"shell am start -W -n {ACT} {extra}")


def link(uri):
    adb(f"shell am start -W -a android.intent.action.VIEW -d '{uri}' {PKG}")


def tab(label_rx):
    _, root = dump()
    W, H = SIZE
    for n in nodes(root):
        lab = n["text"] or n["desc"]
        if lab and re.search(label_rx, lab, re.I) and n["b"][1] > H * 0.82:
            adb(f"shell input tap {(n['b'][0]+n['b'][2])//2} {(n['b'][1]+n['b'][3])//2}")
            return True
    return False


def listing_ids():
    for attempt in range(4):
        try:
            with urllib.request.urlopen(f"{API}/listings?vehicle_category=cars&limit=4", timeout=60) as r:
                items = json.load(r).get("items", [])
            ids = [i["id"] for i in items if i.get("id")]
            if ids:
                return ids
        except Exception as e:
            print("listing ids failed", attempt, e)
        time.sleep(10)
    return []


# ------------------------------------------------------------------ setup
print(adb("wait-for-device"))
for k in ("window_animation_scale", "transition_animation_scale", "animator_duration_scale"):
    adb(f"shell settings put global {k} 0")
adb(f"shell settings put system font_scale {args.font}")
print(adb(f"install -r -t '{args.apk}'", 240))
m = re.search(r"(\d+)x(\d+)", adb("shell wm size"))
SIZE = (int(m.group(1)), int(m.group(2))) if m else (1080, 2400)
adb("shell pm grant %s android.permission.POST_NOTIFICATIONS" % PKG)
adb("logcat -c")

# First launch with no extras: shows the out-of-box default theme.
adb(f"shell am force-stop {PKG}")
start()
snap("00_first_launch_default", 10)
# Apply the configuration (language change recreates the activity).
start(f"--es mm_qa_theme {args.theme} --es mm_qa_lang {args.lang}")
time.sleep(6)
adb(f"shell am force-stop {PKG}")
start()
time.sleep(8)

ids = listing_ids()
SCREENS = [
    ("home", "motormila://home"),
    ("home_scrolled", "SCROLL"),
    ("search", "motormila://search"),
    ("search_toyota", "motormila://search?q=toyota"),
    ("watchlist", "motormila://watchlist"),
    ("insights", f"{WEB}/trends"),
    ("profile", f"{WEB}/profile"),
    ("tools", "TAB:^(Tools|මෙවලම්|கருவிகள்)$"),
    ("sell", f"{WEB}/sell"),
    ("detail", f"motormila://listing/{ids[0]}" if ids else None),
    ("detail_scrolled", "SCROLL" if ids else None),
    ("compare", f"{WEB}/compare?ids={','.join(map(str, ids[:2]))}" if len(ids) >= 2 else f"{WEB}/compare"),
    ("valuation", f"{WEB}/valuation"),
    ("alerts", f"{WEB}/alerts"),
    ("notifications", f"{WEB}/notifications"),
    ("pro", f"{WEB}/pro"),
    ("pricing", f"{WEB}/pricing"),
    ("dealer", f"{WEB}/dealer"),
    ("settings", f"{WEB}/settings"),
    ("ev_hub", f"{WEB}/ev-hub"),
    ("ev_chargers", f"{WEB}/ev-chargers"),
    ("official_pulse", f"{WEB}/official-pulse"),
    ("best_picks", f"{WEB}/best-picks"),
    ("make_hub", "motormila://make/Toyota"),
    ("model_hub", f"{WEB}/cars/Toyota/Aqua"),
    ("district_hub", f"{WEB}/locations/Colombo"),
    ("calculator", f"{WEB}/calculator"),
    ("price_index", f"{WEB}/price-index"),
    ("permits", f"{WEB}/permits"),
    ("docs", f"{WEB}/docs"),
    ("sign_in", f"{WEB}/sign-in"),
    ("sign_up", f"{WEB}/sign-up"),
    ("privacy", f"{WEB}/privacy"),
    ("terms", f"{WEB}/terms"),
    ("admin", f"{WEB}/admin"),
]
subset = set(filter(None, args.subset.split(",")))
for name, target in SCREENS:
    if subset and name not in subset:
        continue
    if target is None:
        continue
    try:
        if target == "SCROLL":
            W, H = SIZE
            adb(f"shell input swipe {W//2} {int(H*0.8)} {W//2} {int(H*0.25)} 500")
            snap(name, 3)
        elif target.startswith("TAB:"):
            link("motormila://home")
            time.sleep(3)
            tab(target[4:])
            snap(name)
        else:
            link(target)
            snap(name, 9 if name in ("home", "detail", "insights", "search") else 6)
    except Exception as e:
        print("ERR", name, e)
        RESULTS.append({"screen": name, "error": str(e)})

sh(f"adb logcat -d -b crash > '{OUT}/crash.txt'")
sh(f"adb logcat -d > '{OUT}/logcat.txt'", 120)
json.dump({"config": TAG, "size": SIZE, "results": RESULTS}, open(f"{OUT}/results.json", "w"),
          indent=2, ensure_ascii=False)
dead = [r["screen"] for r in RESULTS if r.get("alive") is False]
print("DONE", TAG, "screens", len(RESULTS), "dead", dead)
