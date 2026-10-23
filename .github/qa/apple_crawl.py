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
ap.add_argument("--motion", default="0", help="1 = also capture mid-transition frames + gfxinfo frame stats")
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
    ns = nodes(root)
    # Emulator system ANR dialogs ("Pixel Launcher isn't responding") sit on top of the app and
    # swallow taps; answer "Wait" so the screenshot shows the app.
    if any(re.search(r"isn.t responding", n["text"] or "") for n in ns):
        for n in ns:
            if re.fullmatch(r"Wait", n["text"] or ""):
                x = (n["b"][0] + n["b"][2]) // 2
                y = (n["b"][1] + n["b"][3]) // 2
                adb(f"shell input tap {x} {y}")
                time.sleep(1)
                return True
    for n in ns:
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


def tap_desc(rx, limit=1, max_y_frac=0.9):
    """Tap up to `limit` nodes whose content-desc/text matches rx (top to bottom)."""
    _, root = dump()
    W, H = SIZE
    hits = [n for n in nodes(root)
            if re.search(rx, (n["desc"] or n["text"] or "")) and n["b"][3] > n["b"][1]
            and (n["b"][1] + n["b"][3]) // 2 < H * max_y_frac]
    seen, done = set(), 0
    for n in sorted(hits, key=lambda n: (n["b"][1], n["b"][0])):
        key = (n["b"][0] // 20, n["b"][1] // 20)
        if key in seen:
            continue
        seen.add(key)
        adb(f"shell input tap {(n['b'][0]+n['b'][2])//2} {(n['b'][1]+n['b'][3])//2}")
        time.sleep(1.2)
        done += 1
        if done >= limit:
            break
    return done


ADD_CMP = r"(to compare|සැසඳීමට එක් කරන්න|ஒப்பீட்டில் சேர்)$"
CMP_CTA = r"^(Compare|සසඳන්න|ஒப்பிடு) \d$"


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

# Suppress system crash/ANR dialogs from other apps (emulator launcher ANRs polluted shots).
adb("shell settings put global hide_error_dialogs 1")
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
    # Scrolling down minimises the glass tab bar; a short scroll up restores it
    # over content (content must scroll UNDER the floating bar).
    ("home_scrolled_up", "SCROLL_UP"),
    ("search", "motormila://search"),
    ("search_scrolled", "SCROLL"),
    ("search_scrolled_up", "SCROLL_UP"),
    ("filter_sheet", "FILTERS"),
    ("assistant_sheet", "ASSISTANT"),
    # Compare flow: select 3 cars on Search -> tray; tap "Compare 3" -> Compare screen.
    ("search_compare_tray", "CMP_SELECT"),
    ("search_compare_tray_scrolled", "SCROLL"),
    ("compare_from_tray", "CMP_OPEN"),
    ("compare_from_tray_scrolled", "SCROLL"),
    ("compare_removed", "CMP_REMOVE"),
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
    ("compare_4", f"{WEB}/compare?ids={','.join(map(str, ids[:4]))}" if len(ids) >= 4 else None),
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
        elif target == "SCROLL_UP":
            W, H = SIZE
            adb(f"shell input swipe {W//2} {int(H*0.45)} {W//2} {int(H*0.6)} 300")
            snap(name, 3)
        elif target == "FILTERS":
            link("motormila://search")
            time.sleep(8)
            dismiss_noise()
            tap_desc(r"^Open filters$", limit=1, max_y_frac=0.6)
            snap(name, 4)
            # Expanded sheet: scroll through every section, open a collapsed
            # one (Condition / District), and drag the price knob.
            W, H = SIZE
            adb(f"shell input swipe {W//2} {int(H*0.75)} {W//2} {int(H*0.35)} 600")
            snap(name + "_scrolled", 2)
            tap_desc(r"^(Condition|තත්ත්වය|நிலை)", limit=1, max_y_frac=0.85)
            adb(f"shell input swipe {W//2} {int(H*0.75)} {W//2} {int(H*0.35)} 600")
            snap(name + "_scrolled2", 2)
            tap_desc(r"^(District|දිස්ත්‍රික්කය|மாவட்டம்)", limit=1, max_y_frac=0.85)
            adb(f"shell input swipe {W//2} {int(H*0.75)} {W//2} {int(H*0.30)} 600")
            snap(name + "_scrolled3", 2)
            adb("shell input keyevent 4")
            time.sleep(2)
        elif target == "ASSISTANT":
            link("motormila://home")
            time.sleep(5)
            dismiss_noise()
            tap_desc(r"(Ask MotorMila AI|MotorMila AI ගෙන් අසන්න|MotorMila AI இடம் கேளுங்கள்)", limit=1, max_y_frac=1.0)
            snap(name, 5)
            adb("shell input keyevent 4")
            time.sleep(2)
        elif target == "CMP_SELECT":
            link("motormila://search")
            time.sleep(9)
            dismiss_noise()
            n = tap_desc(ADD_CMP, limit=3, max_y_frac=0.75)
            if n < 3:
                W, H = SIZE
                adb(f"shell input swipe {W//2} {int(H*0.7)} {W//2} {int(H*0.4)} 400")
                time.sleep(2)
                tap_desc(ADD_CMP, limit=3 - n, max_y_frac=0.75)
            snap(name, 3)
        elif target == "CMP_OPEN":
            tap_desc(CMP_CTA, limit=1, max_y_frac=0.95)
            snap(name, 10)
        elif target == "CMP_REMOVE":
            W, H = SIZE
            adb(f"shell input swipe {W//2} {int(H*0.3)} {W//2} {int(H*0.8)} 400")
            time.sleep(2)
            tap_desc(r"^Remove ", limit=1)
            snap(name, 4)
        elif target.startswith("TAB:"):
            link("motormila://home")
            time.sleep(3)
            dismiss_noise()
            tab(target[4:])
            snap(name)
        else:
            link(target)
            snap(name, 20 if name in ("model_hub", "district_hub") else 9 if name in ("home", "detail", "insights", "search", "compare_4") else 6)
    except Exception as e:
        print("ERR", name, e)
        RESULTS.append({"screen": name, "error": str(e)})


def gfx_scroll(name, uri, swipes=6):
    """Frame stats while flinging a list (animations ON)."""
    link(uri)
    time.sleep(9)
    dismiss_noise()
    adb(f"shell dumpsys gfxinfo {PKG} reset")
    W, H = SIZE
    for i in range(swipes):
        if i % 2 == 0:
            adb(f"shell input swipe {W//2} {int(H*0.78)} {W//2} {int(H*0.28)} 250")
        else:
            adb(f"shell input swipe {W//2} {int(H*0.35)} {W//2} {int(H*0.7)} 250")
        time.sleep(1.2)
    out = adb(f"shell dumpsys gfxinfo {PKG}")
    keep = [l.strip() for l in out.splitlines() if re.search(r"Total frames rendered|Janky frames|50th percentile|90th percentile|95th percentile|99th percentile|Number Slow", l)]
    return {"screen": name, "gfx": keep}


if args.motion == "1":
    # Animations ON for this phase only.
    for k in ("window_animation_scale", "transition_animation_scale", "animator_duration_scale"):
        adb(f"shell settings put global {k} 1")
    adb(f"shell am force-stop {PKG}")
    start()
    time.sleep(8)
    FRAMES = []
    FRAMES.append(gfx_scroll("gfx_home", "motormila://home"))
    FRAMES.append(gfx_scroll("gfx_search", "motormila://search"))
    if ids:
        FRAMES.append(gfx_scroll("gfx_detail", f"motormila://listing/{ids[0]}"))
    # Card -> Detail container transform, captured mid-flight.
    link("motormila://search")
    time.sleep(9)
    dismiss_noise()
    _, root = dump()
    W, H = SIZE
    cards = [n for n in nodes(root) if n["click"] and n["b"][1] > H * 0.3 and n["b"][3] < H * 0.8
             and (n["b"][2] - n["b"][0]) > W * 0.3]
    if cards:
        c = cards[0]
        # Tap the title/price block (lower part of the card): the card centre
        # is the photo, where the in-card Compare toggle lives.
        x, y = (c["b"][0] + c["b"][2]) // 2, int(c["b"][1] + (c["b"][3] - c["b"][1]) * 0.82)
        adb(f"shell input tap {x} {y}")
        for i in range(4):
            fn = os.path.join(OUT, f"motion_detail_{i}.png")
            sh(f"adb exec-out screencap -p > '{fn}'")
        time.sleep(4)
        sh(f"adb exec-out screencap -p > '{os.path.join(OUT, 'motion_detail_settled.png')}'")
        # Predictive-back / pop transition mid-flight.
        adb("shell input keyevent 4")
        for i in range(3):
            sh(f"adb exec-out screencap -p > '{os.path.join(OUT, f'motion_back_{i}.png')}'")
    # Screen-recorded transitions: every kind of open/close, decoded to frames
    # (8 fps) and tiled into one sheet per transition for review.
    def record(tag, action, secs=5):
        dev = f"/sdcard/mm_{tag}.mp4"
        adb(f"shell rm -f {dev}")
        rec = subprocess.Popen(f"adb shell screenrecord --bit-rate 6000000 --time-limit {secs} {dev}", shell=True)
        time.sleep(1.0)
        try:
            action()
        except Exception as e:
            print("motion action failed", tag, e)
        rec.wait(timeout=secs + 20)
        time.sleep(1.5)
        mp4 = os.path.join(OUT, f"motion_{tag}.mp4")
        sh(f"adb pull {dev} '{mp4}'", 60)
        frames_dir = os.path.join(OUT, f"motion_{tag}")
        os.makedirs(frames_dir, exist_ok=True)
        sh(f"ffmpeg -loglevel error -y -i '{mp4}' -vf fps=8,scale=360:-1 '{frames_dir}/f_%03d.png'", 120)
        sh(f"ffmpeg -loglevel error -y -i '{mp4}' -vf fps=8,scale=216:-1,tile=10x4 -frames:v 1 '{OUT}/motion_{tag}_sheet.png'", 120)
        print("recorded", tag, len(os.listdir(frames_dir)), "frames", flush=True)

    W, H = SIZE

    def tap_xy(x, y):
        adb(f"shell input tap {x} {y}")

    def card_xy():
        _, root = dump()
        cs = [n for n in nodes(root) if n["click"] and n["b"][1] > H * 0.3 and n["b"][3] < H * 0.85
              and (n["b"][2] - n["b"][0]) > W * 0.3]
        if not cs:
            return None
        c = cs[0]
        return (c["b"][0] + c["b"][2]) // 2, int(c["b"][1] + (c["b"][3] - c["b"][1]) * 0.86)

    def first_match(rx, max_y=1.0):
        _, root = dump()
        for n in nodes(root):
            lab = n["desc"] or n["text"] or ""
            if re.search(rx, lab) and (n["b"][1] + n["b"][3]) // 2 < H * max_y:
                return (n["b"][0] + n["b"][2]) // 2, (n["b"][1] + n["b"][3]) // 2
        return None

    # 1. Card -> Detail container transform, then back (button).
    link("motormila://search"); time.sleep(9); dismiss_noise()
    xy = card_xy()
    if xy:
        def a1():
            tap_xy(*xy); time.sleep(2.6); adb("shell input keyevent 4")
        record("card_detail_back", a1, 6)
    # 2. Card -> Detail, then predictive-back edge swipe (slow drag = scrub, then commit).
    time.sleep(3)
    xy = card_xy()
    if xy:
        tap_xy(*xy); time.sleep(3)
        def a2():
            adb(f"shell input swipe 2 {H//2} {int(W*0.6)} {H//2} 1400")
        record("predictive_back", a2, 5)
    # 3. Tab switches Buy -> Prices -> Tools -> Saved -> Buy.
    time.sleep(2)
    def a3():
        for rx in (r"^(Prices|මිල|விலைகள்)$", r"^(Tools|මෙවලම්|கருவிகள்)$", r"^(Saved|සුරැකි|சேமித்தவை)$", r"^(Buy|මිලදී ගන්න|வாங்க)$"):
            p = first_match(rx, 1.0)
            if p:
                tap_xy(*p)
            time.sleep(1.1)
    record("tabs", a3, 7)
    # 4. Push + pop: Settings (push slide over Tools) and back.
    link("motormila://home"); time.sleep(4)
    p = first_match(r"^(Tools|මෙවලම්|கருவிகள்)$")
    if p:
        tap_xy(*p); time.sleep(3)
    def a4():
        q = first_match(r"(Calculator|Import|Lease|Price index|Valuation|Estimate)", 0.9)
        if q:
            tap_xy(*q); time.sleep(2.2); adb("shell input keyevent 4")
    record("push_pop", a4, 6)
    # 5. Hub tile (zoom) from Home and back.
    link("motormila://home"); time.sleep(5); dismiss_noise()
    def a5():
        q = first_match(r"^(Best picks|හොඳම තේරීම්|சிறந்த தேர்வுகள்)", 0.9)
        if q:
            tap_xy(*q); time.sleep(2.2); adb("shell input keyevent 4")
    record("hub_zoom", a5, 6)
    # 6. Filters sheet open + apply.
    link("motormila://search"); time.sleep(8); dismiss_noise()
    def a6():
        q = first_match(r"^Open filters$", 0.6)
        if q:
            tap_xy(*q); time.sleep(2.0)
            r = first_match(r"^(Hybrid|හයිබ්‍රිඩ්|ஹைப்ரிட்)$", 0.9)
            if r:
                tap_xy(*r); time.sleep(1.0)
            r = first_match(r"^(Show|No matches|ප්‍රතිඵල|முடிவு)", 1.0)
            if r:
                tap_xy(*r)
    record("filter_apply", a6, 7)
    # 7. Compare: tray -> Compare (zoom from tray) and back.
    time.sleep(3)
    tap_desc(ADD_CMP, limit=2, max_y_frac=0.75)
    def a7():
        q = first_match(CMP_CTA, 0.97)
        if q:
            tap_xy(*q); time.sleep(2.4); adb("shell input keyevent 4")
    record("compare_zoom", a7, 6)
    # 8. Cold start: splash -> home.
    adb(f"shell am force-stop {PKG}"); time.sleep(1)
    def a8():
        # `am start -W` returns once the first frame is displayed; grab the
        # in-app brand splash (AVD, 900 ms) as stills too, since screenrecord
        # on the software GPU sometimes stops before the hand-off.
        start()
        for i, dt in enumerate((0.0, 0.25, 0.25, 0.4, 0.6, 1.0)):
            time.sleep(dt)
            sh(f"adb exec-out screencap -p > '{os.path.join(OUT, f'motion_splash_{i}.png')}'")
    record("splash_home", a8, 9)

    json.dump(FRAMES, open(f"{OUT}/frames.json", "w"), indent=2)
    print("FRAMES", json.dumps(FRAMES, indent=1))

sh(f"adb logcat -d -b crash > '{OUT}/crash.txt'")
sh(f"adb logcat -d > '{OUT}/logcat.txt'", 120)
json.dump({"config": TAG, "size": SIZE, "results": RESULTS}, open(f"{OUT}/results.json", "w"),
          indent=2, ensure_ascii=False)
dead = [r["screen"] for r in RESULTS if r.get("alive") is False]
print("DONE", TAG, "screens", len(RESULTS), "dead", dead)
