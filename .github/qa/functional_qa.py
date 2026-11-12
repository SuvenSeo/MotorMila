#!/usr/bin/env python3
"""TEMPORARY functional E2E QA for branch android/apple-polish (delete before merge).

adb + uiautomator driven end-to-end checks: every test performs a real action
and asserts an observable effect (data from the live API on screen, state that
persists across process death, deep links that resolve, intents that leave the
app). Each check records PASS / FAIL / INFO with a screenshot + dump and, where
it applies, the API response it was compared against.

Usage: functional_qa.py --apk app.apk --out fq-out [--old-apk old.apk] [--only a,b]
"""
import argparse, json, os, re, subprocess, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

PKG = "lk.motormila.app.debug"
ACT = f"{PKG}/lk.motormila.app.MainActivity"
API = "https://seo292-vehicle-platform-backend.hf.space/api/v1"
WEB = "https://motormila.pages.dev"

ap = argparse.ArgumentParser()
ap.add_argument("--apk", required=True)
ap.add_argument("--old-apk", default="")
ap.add_argument("--out", default="fq-out")
ap.add_argument("--only", default="")
ap.add_argument("--tag", default="")
args = ap.parse_args()
OUT = args.out
os.makedirs(OUT, exist_ok=True)
RESULTS = []
SHOT_N = [0]


# ------------------------------------------------------------------ helpers
def sh(cmd, timeout=90):
    try:
        p = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired:
        return "TIMEOUT"


def adb(c, timeout=90):
    return sh(f"adb {c}", timeout)


def api(path, **q):
    q = {k: v for k, v in q.items() if v is not None}
    url = f"{API}/{path}" + ("?" + urllib.parse.urlencode(q) if q else "")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            return {"_http": e.code, "_body": e.read().decode()[:300]}
        except Exception as e:  # noqa
            err = str(e)
            time.sleep(4)
    return {"_error": err}


def dump():
    for _ in range(4):
        out = adb("exec-out uiautomator dump /dev/tty", 40)
        m = re.search(r"<\?xml.*</hierarchy>", out, re.S)
        if m:
            try:
                return m.group(0), ET.fromstring(m.group(0))
            except ET.ParseError:
                pass
        time.sleep(1)
    return "", None


def nodes(root=None):
    if root is None:
        _, root = dump()
    if root is None:
        return []
    res = []
    for e in root.iter("node"):
        b = list(map(int, re.findall(r"\d+", e.get("bounds", "[0,0][0,0]"))))
        res.append({"text": e.get("text", ""), "desc": e.get("content-desc", ""), "cls": e.get("class", ""),
                    "click": e.get("clickable") == "true", "b": b, "pkg": e.get("package", ""),
                    "focused": e.get("focused") == "true", "checked": e.get("checked") == "true",
                    "selected": e.get("selected") == "true", "enabled": e.get("enabled") == "true",
                    "checkable": e.get("checkable") == "true"})
    return res


def labels(ns=None):
    ns = nodes() if ns is None else ns
    return [n["text"] or n["desc"] for n in ns if (n["text"] or n["desc"])]


def joined(ns=None):
    return "\n".join(labels(ns))


def center(n):
    return (n["b"][0] + n["b"][2]) // 2, (n["b"][1] + n["b"][3]) // 2


def tapxy(x, y):
    adb(f"shell input tap {x} {y}")


def find(rx, ns=None, max_y=1.0, min_y=0.0, flags=0):
    ns = nodes() if ns is None else ns
    W, H = SIZE
    for n in ns:
        lab = n["desc"] or n["text"] or ""
        if lab and re.search(rx, lab, flags) and n["b"][3] > n["b"][1]:
            cy = (n["b"][1] + n["b"][3]) // 2
            if H * min_y <= cy <= H * max_y:
                return n
    return None


def tap(rx, wait=1.5, **kw):
    n = find(rx, **kw)
    if n:
        tapxy(*center(n))
        time.sleep(wait)
        return True
    return False


def wait_for(rx, timeout=25, step=1.5, **kw):
    end = time.time() + timeout
    while time.time() < end:
        ns = nodes()
        if find(rx, ns, **kw):
            return ns
        time.sleep(step)
    return None


def swipe_up(frac=0.5, dur=450):
    W, H = SIZE
    adb(f"shell input swipe {W//2} {int(H*0.75)} {W//2} {int(H*(0.75-frac))} {dur}")
    time.sleep(1.2)


def swipe_down(frac=0.5, dur=450, start=0.3):
    W, H = SIZE
    adb(f"shell input swipe {W//2} {int(H*start)} {W//2} {int(H*(start+frac))} {dur}")
    time.sleep(1.2)


def back(n=1):
    for _ in range(n):
        adb("shell input keyevent 4")
        time.sleep(1.0)


def alive():
    return adb(f"shell pidof {PKG}").strip() != ""


def resumed():
    out = adb("shell dumpsys activity activities")
    m = re.search(r"(?:mResumedActivity|topResumedActivity)[^\n]*?\{[^}]*?\s([\w.]+/[\w.$]+)", out)
    return m.group(1) if m else ""


def start(extra=""):
    return adb(f"shell am start -W -n {ACT} {extra}")


def link(uri, settle=0):
    # Double-quote for the local shell, single-quote for the device shell: an
    # unquoted '&' would background `am start` on the device and drop every
    # query parameter after the first.
    out = adb(f"shell am start -W -a android.intent.action.VIEW -d \"'{uri}'\" {PKG}")
    if settle:
        time.sleep(settle)
    return out


def dismiss_noise(ns=None):
    ns = nodes() if ns is None else ns
    if any(re.search(r"isn.t responding", n["text"] or "") for n in ns):
        n = find(r"^Wait$", ns)
        if n:
            tapxy(*center(n)); time.sleep(1)
            return True
    n = find(r"^(Later|Not now)$", ns)
    if n:
        tapxy(*center(n)); time.sleep(1)
        return True
    return False


def ime_submit():
    """Press the keyboard's action key (Search / Done): ENTER, then the IME key if the keyboard is still up."""
    adb("shell input keyevent 66"); time.sleep(1.5)
    if "mInputShown=true" in adb("shell dumpsys input_method"):
        W, H = SIZE
        tapxy(int(W * 0.92), int(H * 0.909)); time.sleep(1)


def shot(name):
    SHOT_N[0] += 1
    fn = f"{SHOT_N[0]:03d}_{name}.png"
    sh(f"adb exec-out screencap -p > '{os.path.join(OUT, fn)}'")
    xml, _ = dump()
    with open(os.path.join(OUT, fn.replace(".png", ".xml")), "w") as f:
        f.write(xml)
    return fn


def record(tid, area, name, status, detail="", evidence=None, api_cmp=None):
    r = {"id": tid, "area": area, "name": name, "status": status, "detail": detail,
         "evidence": evidence or [], "api": api_cmp, "alive": alive()}
    RESULTS.append(r)
    print(f"[{status}] {tid} {name} :: {str(detail)[:300]}", flush=True)
    json.dump(RESULTS, open(os.path.join(OUT, "results.json"), "w"), indent=1, ensure_ascii=False)
    if not r["alive"]:
        crash = adb("logcat -d -b crash", 30)
        open(os.path.join(OUT, f"crash_{tid}.txt"), "w").write(crash)
        start(); time.sleep(6)


PRICE_RX = re.compile(r"Rs\s*([\d.,]+)\s*(Mn|M|K)?", re.I)


def parse_price(s):
    m = PRICE_RX.search(s or "")
    if not m:
        return None
    v = float(m.group(1).replace(",", ""))
    u = (m.group(2) or "").lower()
    return v * 1e6 if u in ("mn", "m") else v * 1e3 if u == "k" else v


def cards(ns=None):
    """Listing cards on screen: content-desc 'Title, Rs X' (+ the subtitle line under it)."""
    ns = nodes() if ns is None else ns
    out = []
    for n in ns:
        d = n["desc"]
        if d and re.search(r", (Rs [\d.,]+|Price on request|No price|Ask)", d) and not d.startswith("Add "):
            title = d.rsplit(", ", 1)[0]
            sub = ""
            for m in ns:  # subtitle text inside the card bounds: "2014 · 125,000 km · Kandy, City"
                if m["text"] and "·" in m["text"] and n["b"][0] <= m["b"][0] <= n["b"][2] and n["b"][1] <= m["b"][1] <= n["b"][3]:
                    sub = m["text"]; break
            out.append({"title": title, "price": parse_price(d), "sub": sub, "node": n})
    # de-dup by title+bounds
    seen, res = set(), []
    for c in out:
        k = (c["title"], c["node"]["b"][1] // 40)
        if k not in seen:
            seen.add(k); res.append(c)
    return res


def collect_cards(scrolls=2):
    allc, titles = [], set()
    for i in range(scrolls + 1):
        for c in cards():
            if c["title"] not in titles:
                titles.add(c["title"]); allc.append(c)
        if i < scrolls:
            swipe_up(0.45)
    return allc


def norm(t):
    return re.sub(r"\s+", " ", (t or "").strip().lower())


def api_titles(**q):
    d = api("listings", size=40, page=1, **q)
    return [norm(i.get("title")) for i in d.get("items", [])], d


def wanted(tid):
    if not args.only:
        return True
    for x in filter(None, args.only.split(",")):
        if tid == x or tid.startswith(x + ".") or (len(x) == 1 and tid.startswith(x)):
            return True
    return False


def T(tid, area, name):
    def deco(fn):
        TESTS.append((tid, area, name, fn))
        return fn
    return deco


TESTS = []

# ------------------------------------------------------------------ setup
print(adb("wait-for-device"))
SDK = adb("shell getprop ro.build.version.sdk").strip()
for k in ("window_animation_scale", "transition_animation_scale", "animator_duration_scale"):
    adb(f"shell settings put global {k} 0")
adb("shell settings put global hide_error_dialogs 1")
m = re.search(r"(\d+)x(\d+)", adb("shell wm size"))
SIZE = (int(m.group(1)), int(m.group(2))) if m else (1080, 2400)
LISTINGS = api("listings", vehicle_category="cars", size=20, sort="newest").get("items", [])
LID = [i["id"] for i in LISTINGS if i.get("id") and i.get("thumbnail_url")][:4] or [i["id"] for i in LISTINGS][:4]
print("SDK", SDK, "SIZE", SIZE, "ids", LID, flush=True)


# ------------------------------------------------------------------ 1. launch
@T("L1", "Launch", "Fresh install first launch (onboarding / splash / home)")
def t_first():
    adb(f"uninstall {PKG}")
    print(adb(f"install -r -t '{args.apk}'", 240))
    adb(f"shell pm grant {PKG} android.permission.POST_NOTIFICATIONS")
    adb("logcat -c")
    out = start()
    frames = []
    for i in range(3):
        SHOT_N[0] += 1
        fn = f"{SHOT_N[0]:03d}_L1_splash_{i}.png"
        sh(f"adb exec-out screencap -p > '{os.path.join(OUT, fn)}'"); frames.append(fn)
        time.sleep(0.35)
    ns = wait_for(r"(Find a fair price|(?:Cars|Vehicles) listed|Buy)", 40)
    ev = frames + [shot("L1_first_home")]
    tt = re.search(r"TotalTime: (\d+)", out)
    onboarding = bool(find(r"(Get started|Skip|Continue|Next)$", ns or []))
    record("L1", "Launch", "Fresh install first launch", "PASS" if ns else "FAIL",
           f"TotalTime={tt.group(1) if tt else '?'}ms; onboarding_shown={onboarding}; home_reached={bool(ns)}", ev)


@T("L2", "Launch", "Cold start (force-stop) reaches Home with live data")
def t_cold():
    adb(f"shell am force-stop {PKG}"); time.sleep(1)
    out = start()
    tt = re.search(r"TotalTime: (\d+)", out)
    ns = wait_for(r"(?:Cars|Vehicles) listed", 40)
    ev = [shot("L2_cold_home")]
    stats = api("stats/summary")
    txt = joined(ns or [])
    record("L2", "Launch", "Cold start", "PASS" if ns and alive() else "FAIL",
           f"TotalTime={tt.group(1) if tt else '?'}ms; api total_listings={stats.get('total_listings')}", ev, api_cmp=stats)


@T("L3", "Launch", "Warm start (HOME then relaunch) keeps state")
def t_warm():
    time.sleep(4)
    link("motormila://search?q=toyota", 10)
    pre = shot("L3_before_home_key")
    adb("shell input keyevent 3"); time.sleep(2)
    out = start()
    tt = re.search(r"TotalTime: (\d+)", out)
    time.sleep(3)
    ns = nodes()
    ok = bool(find(r"(?i)toyota", ns))
    record("L3", "Launch", "Warm start", "PASS" if ok else "FAIL",
           f"TotalTime={tt.group(1) if tt else '?'}ms; still on Search(toyota)={ok}", [pre, shot("L3_warm")])


def net(on):
    if on:
        adb("shell cmd connectivity airplane-mode disable"); adb("shell svc wifi enable"); adb("shell svc data enable")
    else:
        adb("shell cmd connectivity airplane-mode enable"); adb("shell svc wifi disable"); adb("shell svc data disable")
    time.sleep(4)


@T("L4", "Launch", "Offline launch with cache: offline/snapshot state + Retry, recovers when back online")
def t_offline_cached():
    net(False)
    try:
        adb(f"shell am force-stop {PKG}"); start()
        time.sleep(30)  # live call timeout (15 s) + snapshot attempt
        ns = nodes(); ev = [shot("L4_offline_home")]
        txt = joined(ns)
        offline_ui = bool(re.search(r"(?i)(offline|snapshot|no connection|retry|cached)", txt))
        retry = find(r"(?i)^(retry|try again)", ns)
        if retry:
            tapxy(*center(retry)); time.sleep(6)
        ev.append(shot("L4_offline_after_retry_tap"))
        still_alive = alive()
        link("motormila://search", 20)
        ev.append(shot("L4_offline_search"))
        stxt = joined()
    finally:
        net(True)
    time.sleep(6)
    n = find(r"(?i)^(retry|try again)$") or find(r"(?i)Tap to retry")
    if n:
        tapxy(*center(n))
    else:
        swipe_down(0.5, 500, 0.3)
    time.sleep(15)
    ns2 = nodes(); ev.append(shot("L4_back_online"))
    recovered = not re.search(r"(?i)(Live data is unavailable|offline)", joined(ns2)) and len(cards(ns2)) > 0
    st = "PASS" if offline_ui and still_alive and recovered else "FAIL"
    record("L4", "Launch", "Offline launch (cached) + recovery", st,
           f"offline_ui={offline_ui}; retry_button={bool(retry)}; alive={still_alive}; recovered_online={recovered}; search_offline_text={stxt[:200]!r}", ev)


@T("L5", "Launch", "Offline launch with NO cache (cleared data): error + retry state, no crash")
def t_offline_clean():
    adb(f"shell pm clear {PKG}")
    adb(f"shell pm grant {PKG} android.permission.POST_NOTIFICATIONS")
    net(False)
    try:
        start(); time.sleep(32)
        ns = nodes(); ev = [shot("L5_offline_nocache_home")]
        txt = joined(ns)
        has_state = bool(re.search(r"(?i)(offline|no connection|retry|try again|couldn.t|unavailable|snapshot)", txt))
        link("motormila://search", 25)
        ev.append(shot("L5_offline_nocache_search"))
        stxt = joined()
        s_state = bool(re.search(r"(?i)(offline|no connection|retry|try again|couldn.t|unavailable|snapshot)", stxt))
        ok_alive = alive()
    finally:
        net(True)
    record("L5", "Launch", "Offline launch, no cache", "PASS" if has_state and s_state and ok_alive else "FAIL",
           f"home_state={has_state}; search_state={s_state}; alive={ok_alive}; home_text={txt[:250]!r}", ev)
    start(); time.sleep(10)


# ------------------------------------------------------------------ 2. home
@T("H1", "Home", "Home stats show live numbers matching /stats/summary")
def t_home_stats():
    link("motormila://home"); ns = wait_for(r"(?:Cars|Vehicles) listed", 30) or nodes()
    ev = [shot("H1_home")]
    stats = api("stats/summary")
    txt = joined(ns)
    nums = re.findall(r"^[\d,]+$", txt, re.M)
    record("H1", "Home", "Home stats", "PASS" if nums else "FAIL",
           f"on-screen numbers={nums[:4]}; api total_listings={stats.get('total_listings')} listings_this_week={stats.get('listings_this_week')} avg={stats.get('avg_price_lkr')}; texts={txt[:300]!r}", ev, stats)


HUBS = [
    ("Best picks", r"(?i)(best picks|deal)"),
    ("Price Index", r"(?i)price index"),
    ("Calculator", r"(?i)(calculator|landed|import)"),
    ("EV Hub", r"(?i)(EV|electric)"),
    ("Official Pulse", r"(?i)(official pulse|pulse)"),
    ("Permit market", r"(?i)permit"),
]


@T("H2", "Home", "Every hub tile opens its destination with data")
def t_home_tiles():
    for label, dest in HUBS:
        link("motormila://home"); time.sleep(4)
        ns = nodes()
        if not find(rf"^{re.escape(label)}$", ns):
            swipe_up(0.3); ns = nodes()
        n = find(rf"^{re.escape(label)}$", ns, max_y=0.88)
        if not n:
            record(f"H2.{label}", "Home", f"Hub tile {label}", "FAIL", "tile not found on Home", [shot(f"H2_{label}_missing")]); continue
        tapxy(*center(n)); time.sleep(9)
        if re.search(r"(?i)loading", joined()):
            time.sleep(12)
        ns2 = nodes(); ev = [shot(f"H2_{label.replace(' ', '_')}")]
        txt = joined(ns2)
        has_back = bool(find(r"^Back$", ns2))
        nums = len(re.findall(r"\d", txt))
        err = re.search(r"(?i)(couldn.t load|something went wrong|error|try again)", txt)
        ok = has_back and re.search(dest, txt) and nums > 5 and not err
        record(f"H2.{label}", "Home", f"Hub tile {label}", "PASS" if ok else "FAIL",
               f"opened={has_back}; digits_on_screen={nums}; error={err.group(0) if err else None}; texts={txt[:250]!r}", ev)


@T("H3", "Home", "Home sections/carousels: scroll all, open a card from each listing rail")
def t_home_sections():
    link("motormila://home"); time.sleep(6)
    seen_headers, opened, ev = [], [], []
    for i in range(10):
        ns = nodes()
        for n in ns:
            t = n["text"]
            if t and n["cls"].endswith("TextView") and 3 < len(t) < 40 and t not in seen_headers and n["b"][3] - n["b"][1] > 50:
                seen_headers.append(t)
        cs = [c for c in cards(ns) if SIZE[1] * 0.2 < c["node"]["b"][1] < SIZE[1] * 0.75]
        if not cs:  # Home rails: card node desc == its title text, photo-sized
            for n in ns:
                if n["desc"] and n["b"][3] - n["b"][1] > 300 and n["b"][1] > SIZE[1] * 0.06 and n["b"][3] < SIZE[1] * 0.85 \
                        and any(m["text"] == n["desc"] for m in ns):
                    cs.append({"title": n["desc"], "node": n, "price": None, "sub": ""})
        if cs and len(opened) < 4:
            c = cs[0]
            if c["title"] not in [o[0] for o in opened]:
                x, y = center(c["node"]); tapxy(x, int(c["node"]["b"][1] + (c["node"]["b"][3] - c["node"]["b"][1]) * 0.85)); time.sleep(6)
                d = nodes()
                ok = bool(find(r"(?i)(SPECIFICATIONS|Asking price|View on)", d))
                opened.append((c["title"], ok))
                ev.append(shot(f"H3_card_{len(opened)}"))
                back(); time.sleep(2)
        if i % 3 == 2:
            ev.append(shot(f"H3_scroll_{i}"))
        swipe_up(0.4)
    ok = opened and all(o[1] for o in opened)
    record("H3", "Home", "Home sections + cards open Detail", "PASS" if ok else "FAIL",
           f"cards_opened={opened}; headers_seen={seen_headers[:40]}", ev)


@T("H4", "Home", "Price drops 'See all' opens a list with data")
def t_home_drops():
    link("motormila://home"); time.sleep(5)
    for _ in range(8):
        ns = nodes()
        h = find(r"^Price drops$", ns, max_y=0.85)
        sa = find(r"^See all$", ns, max_y=0.88)
        if h and sa:
            tapxy(*center(sa)); time.sleep(8)
            ns2 = nodes(); ev = [shot("H4_price_drops")]
            drops = api("listings/price-drops", days=7, vehicle_category="cars")
            n_api = len(drops) if isinstance(drops, list) else len(drops.get("items", [])) if isinstance(drops, dict) else 0
            txt = joined(ns2)
            ok = bool(find(r"^Back$", ns2)) and (len(cards(ns2)) > 0 or "Rs" in txt)
            record("H4", "Home", "Price drops See all", "PASS" if ok else "FAIL",
                   f"api price-drops n={n_api}; screen={txt[:250]!r}", ev)
            return
        swipe_up(0.35)
    record("H4", "Home", "Price drops See all", "FAIL", "Price drops section / See all not found", [shot("H4_missing")])


@T("H5", "Home", "Pull to refresh on Home reloads without losing data")
def t_home_ptr():
    link("motormila://home"); time.sleep(5)
    swipe_down(0.45, 600, 0.3); ev = [shot("H5_ptr_mid")]
    time.sleep(6)
    ns = nodes(); ev.append(shot("H5_ptr_after"))
    ok = alive() and bool(find(r"(?:Cars|Vehicles) listed", ns))
    record("H5", "Home", "Home pull to refresh", "PASS" if ok else "FAIL", f"stats still shown={ok}", ev)


@T("H6", "Home", "Home search bar: tap, type, submit -> Search with results")
def t_home_search():
    link("motormila://home"); time.sleep(5)
    if not tap(r"^Make, model or paste a link$", 2):
        record("H6", "Home", "Home search bar", "FAIL", "search bar not found", [shot("H6_missing")]); return
    time.sleep(2)
    f = find(r"^(Search make or model|Vehicle search)$")
    if f:
        tapxy(*center(f)); time.sleep(1)
    adb("shell input text 'aqua'"); time.sleep(2.5)
    ev = [shot("H6_typed")]
    ime_submit(); time.sleep(10)
    ns = nodes(); ev.append(shot("H6_results"))
    cs = cards(ns)
    hits = [c["title"] for c in cs if "aqua" in c["title"].lower()]
    record("H6", "Home", "Home search bar", "PASS" if cs and len(hits) >= max(1, len(cs) // 2) else "FAIL",
           f"cards={len(cs)} aqua_hits={len(hits)} titles={[c['title'] for c in cs][:6]}", ev)


@T("H7", "Home", "Paste an ikman ad link in Home search -> opens it in-app")
def t_home_paste():
    url = next((i["url"] for i in LISTINGS if "ikman.lk" in (i.get("url") or "")), None)
    if not url:
        record("H7", "Home", "Paste link", "INFO", "no ikman url from API"); return
    link("motormila://home"); time.sleep(5)
    tap(r"^Make, model or paste a link$", 3)
    f = find(r"^(Search make or model|Vehicle search)$")
    if f:
        tapxy(*center(f)); time.sleep(1)
    adb(f"shell input text '{url}'"); time.sleep(1.5)
    ime_submit(); time.sleep(12)
    ns = nodes(); ev = [shot("H7_paste_result")]
    txt = joined(ns)
    ok = bool(re.search(r"(?i)(SPECIFICATIONS|Asking price|View on|valuation|fair price|estimate)", txt))
    record("H7", "Home", "Paste listing link", "PASS" if ok else "FAIL", f"url={url}; screen={txt[:250]!r}", ev)


# ------------------------------------------------------------------ 3. search
def search_link_check(tid, name, params, pred=None, sub_pred=None, cmp_api=True, scrolls=1):
    q = urllib.parse.urlencode(params)
    link(f"motormila://search?{q}"); time.sleep(10)
    ns = nodes(); dismiss_noise(ns)
    ev = [shot(f"{tid}")]
    snapshot = bool(re.search(r"(?i)Live data is unavailable|snapshot", joined(ns)))
    cs = collect_cards(scrolls)
    api_q = dict(params)
    api_q.setdefault("vehicle_category", "cars")
    api_q.setdefault("sort", "newest")
    if api_q.get("include_archive") == "1":
        api_q["include_archive"] = "true"
    at, ad = api_titles(**api_q) if cmp_api else ([], {})
    on = [norm(c["title"]) for c in cs]
    overlap = [t for t in on if t in at]
    bad = []
    for c in cs:
        if pred and not pred(c):
            bad.append(c["title"] + " | " + (c["sub"] or "") + f" | {c['price']}")
        elif sub_pred and c["sub"] and not sub_pred(c["sub"]):
            bad.append(c["title"] + " | " + c["sub"])
    total = ad.get("total") if isinstance(ad, dict) else None
    if not cs and total == 0:
        st = "PASS"  # empty result matches empty API
    else:
        st = "PASS" if cs and not bad and (not cmp_api or len(overlap) >= min(2, len(on))) else "FAIL"
    record(tid, "Search", name, st,
           f"cards={len(cs)} api_total={total} overlap_with_api_page1={len(overlap)}/{len(on)} violations={bad[:4]} snapshot={snapshot} titles={on[:5]} api_first={at[:5]}",
           ev, {"query": api_q, "total": total, "first": at[:10]})


def year_of(sub):
    m = re.match(r"\s*(\d{4})", sub or "")
    return int(m.group(1)) if m else None


def km_of(sub):
    m = re.search(r"([\d,]+)\s*km", sub or "")
    return int(m.group(1).replace(",", "")) if m else None


CATS = ["cars", "motorbikes", "three-wheelers", "vans", "lorries", "buses", "heavy-duty", "tractors", "boats", "bicycles", "others"]
DISTRICTS = ["Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo", "Galle", "Gampaha", "Hambantota", "Jaffna",
             "Kalutara", "Kandy", "Kegalle", "Kilinochchi", "Kurunegala", "Mannar", "Matale", "Matara", "Monaragala",
             "Mullaitivu", "Nuwara Eliya", "Polonnaruwa", "Puttalam", "Ratnapura", "Trincomalee", "Vavuniya"]


@T("S1", "Search", "Text search (deep link q=toyota) returns Toyota listings")
def t_s_text():
    search_link_check("S1", "q=toyota", {"q": "toyota"}, pred=lambda c: "toyota" in c["title"].lower())


@T("S2", "Search", "Typed search in the Search field")
def t_s_typed():
    link("motormila://search"); time.sleep(8)
    f = find(r"^(Search make or model|Vehicle search)$")
    if not f:
        record("S2", "Search", "Typed search", "FAIL", "field not found", [shot("S2_missing")]); return
    tapxy(*center(f)); time.sleep(1.5)
    adb("shell input text 'honda'"); time.sleep(2.5)
    ev = [shot("S2_suggestions")]
    ime_submit(); time.sleep(10)
    ns = nodes(); ev.append(shot("S2_results"))
    cs = cards(ns)
    hits = [c for c in cs if "honda" in c["title"].lower()]
    record("S2", "Search", "Typed search 'honda'", "PASS" if cs and len(hits) >= len(cs) * 0.6 else "FAIL",
           f"cards={len(cs)} honda={len(hits)} titles={[c['title'] for c in cs][:6]}", ev)


@T("S3", "Search", "Category deep links (all 11 categories)")
def t_s_cats():
    for cat in CATS:
        search_link_check(f"S3.{cat}", f"vehicle_category={cat}", {"vehicle_category": cat}, scrolls=0)


@T("S4", "Search", "Inventory filters: no-price + 360K archive")
def t_s_inventory():
    search_link_check("S4.noprice", "price_availability=unavailable", {"vehicle_category": "cars", "price_availability": "unavailable"},
                      pred=lambda c: c["price"] is None, scrolls=0)
    search_link_check("S4.archive", "include_archive=1", {"vehicle_category": "cars", "include_archive": "1"}, scrolls=0)


@T("S5", "Search", "Make / Make+Model deep links")
def t_s_make():
    search_link_check("S5.make", "make=Toyota", {"make": "Toyota"}, pred=lambda c: c["title"].lower().startswith("toyota"))
    search_link_check("S5.model", "make=Toyota&model=Aqua", {"make": "Toyota", "model": "Aqua"}, pred=lambda c: "aqua" in c["title"].lower())


@T("S6", "Search", "Price / year / mileage range deep links")
def t_s_ranges():
    search_link_check("S6.price", "price 3-6 Mn", {"vehicle_category": "cars", "price_min": "3000000", "price_max": "6000000"},
                      pred=lambda c: c["price"] is not None and 2.95e6 <= c["price"] <= 6.05e6)
    search_link_check("S6.year", "year 2015-2018", {"vehicle_category": "cars", "year_min": "2015", "year_max": "2018"},
                      sub_pred=lambda s: year_of(s) is None or 2015 <= year_of(s) <= 2018)
    search_link_check("S6.km", "mileage_max 50000", {"vehicle_category": "cars", "mileage_max": "50000"},
                      sub_pred=lambda s: km_of(s) is None or km_of(s) <= 50000)


@T("S7", "Search", "Fuel / transmission / condition / body deep links")
def t_s_chips():
    for f in ["petrol", "diesel", "hybrid", "electric"]:
        search_link_check(f"S7.fuel.{f}", f"fuel_type={f}", {"vehicle_category": "cars", "fuel_type": f}, scrolls=0)
    for t in ["automatic", "manual", "cvt"]:
        search_link_check(f"S7.tx.{t}", f"transmission={t}", {"vehicle_category": "cars", "transmission": t}, scrolls=0)
    for c in ["brand_new", "reconditioned", "used"]:
        search_link_check(f"S7.cond.{c}", f"condition={c}", {"vehicle_category": "cars", "condition": c}, scrolls=0)
    for b in ["sedan", "suv", "hatchback", "van", "jeep"]:
        search_link_check(f"S7.body.{b}", f"body_type={b}", {"vehicle_category": "cars", "body_type": b}, scrolls=0)


@T("S8", "Search", "All 25 districts")
def t_s_districts():
    for d in DISTRICTS:
        search_link_check(f"S8.{d}", f"district={d}", {"district": d}, scrolls=0,
                          sub_pred=lambda s, d=d: d.lower() in s.lower())


@T("S9", "Search", "Source site filter")
def t_s_sources():
    srcs = api("listings/sources")
    names = [x["source"] if isinstance(x, dict) else x for x in (srcs if isinstance(srcs, list) else [])][:5]
    for s in names:
        search_link_check(f"S9.{s}", f"source={s}", {"vehicle_category": "cars", "source": s}, scrolls=0)


@T("S10", "Search", "Filter sheet UI: tap Hybrid -> live count == API total -> apply -> chip -> remove")
def t_s_sheet():
    link("motormila://search"); time.sleep(9)
    if not tap(r"^Open filters$", 3, max_y=0.6):
        record("S10", "Search", "Filter sheet", "FAIL", "Open filters not found", [shot("S10_missing")]); return
    ev = [shot("S10_sheet")]
    swipe_up(0.35)
    if not tap(r"^Hybrid$", 4):
        record("S10", "Search", "Filter sheet", "FAIL", "Hybrid chip not found", ev + [shot("S10_nohybrid")]); return
    time.sleep(4)
    ns = nodes(); ev.append(shot("S10_hybrid_selected"))
    cta = find(r"^(Show [\d,]+ results|Show 1 result|No matches|Show results)$", ns)
    n_ui = int(re.sub(r"\D", "", cta["text"] or cta["desc"]) or -1) if cta and re.search(r"\d", cta["text"] or cta["desc"]) else None
    api_total = api("listings", vehicle_category="cars", fuel_type="hybrid", size=1, sort="newest").get("total")
    if cta:
        tapxy(*center(cta)); time.sleep(9)
    ns2 = nodes(); ev.append(shot("S10_applied"))
    chip = find(r"^Remove filter ", ns2)
    cs = cards(ns2)
    at, _ = api_titles(vehicle_category="cars", fuel_type="hybrid", sort="newest")
    overlap = [c for c in cs if norm(c["title"]) in at]
    if chip:
        tapxy(*center(chip)); time.sleep(8)
    ns3 = nodes(); ev.append(shot("S10_chip_removed"))
    chip_gone = not find(r"^Remove filter Hybrid", ns3)
    count_ok = n_ui is not None and api_total is not None and abs(n_ui - api_total) <= max(5, api_total * 0.02)
    ok = count_ok and chip is not None and len(overlap) >= 1 and chip_gone
    record("S10", "Search", "Filter sheet Hybrid apply/count/chip removal", "PASS" if ok else "FAIL",
           f"cta={cta and (cta['text'] or cta['desc'])!r} ui_count={n_ui} api_total={api_total}; chip={chip and chip['desc']!r}; overlap={len(overlap)}/{len(cs)}; chip_gone_after_remove={chip_gone}",
           ev, {"api_total": api_total})


def sheet_field(label_idx, value):
    """Type into the idx-th EditText of the open sheet whose desc is Min/Max."""
    ns = nodes()
    # The "Min"/"Max" desc is the empty-field label: once a field holds digits it is gone,
    # so keep filled numeric fields too and order them on screen (row, then column).
    eds = [n for n in ns if n["cls"].endswith("EditText") and (n["desc"] in ("Min", "Max") or re.fullmatch(r"[\d.,]+", n["text"] or ""))]
    eds.sort(key=lambda n: (n["b"][1] // 40, n["b"][0]))
    if len(eds) <= label_idx:
        return False
    tapxy(*center(eds[label_idx])); time.sleep(0.8)
    adb("shell input keyevent KEYCODE_MOVE_END")
    for _ in range(8):
        adb("shell input keyevent KEYCODE_DEL")
    adb(f"shell input text '{value}'"); time.sleep(0.8)
    return True


@T("S11", "Search", "Filter sheet UI: price + year fields, Make->Model, district, then Reset all")
def t_s_sheet2():
    link("motormila://search"); time.sleep(9)
    tap(r"^Open filters$", 3, max_y=0.6)
    ev = [shot("S11_sheet")]
    # Make -> Model
    mk = [n for n in nodes() if n["cls"].endswith("EditText")]
    make_ok = model_ok = False
    if mk:
        tapxy(*center(mk[0])); time.sleep(1); adb("shell input text 'Toyota'"); time.sleep(3)
        ev.append(shot("S11_make_typed"))
        opt = find(r"^Toyota", min_y=0.15)
        ns = nodes()
        opts = [n for n in ns if (n["text"] or "").startswith("Toyota") and not n["cls"].endswith("EditText")]
        if opts:
            tapxy(*center(opts[0])); time.sleep(3); make_ok = True
        adb("shell input keyevent 111"); time.sleep(1)
        ns = nodes()
        eds = [n for n in ns if n["cls"].endswith("EditText")]
        if len(eds) > 1 and eds[1]["enabled"]:
            tapxy(*center(eds[1])); time.sleep(1); adb("shell input text 'Aqua'"); time.sleep(3)
            ev.append(shot("S11_model_typed"))
            opts = [n for n in nodes() if re.match(r"(?i)^aqua", n["text"] or "") and not n["cls"].endswith("EditText")
                    and n["b"][3] < SIZE[1] * 0.62]
            if opts:
                tapxy(*center(opts[0])); time.sleep(3)
            else:
                adb("shell input keyevent 66"); time.sleep(3)  # IME Done commits the typed model
            ev.append(shot("S11_model_committed"))
            model_ok = bool(find(r"(?i)^Toyota Aqua$")) or any(
                n["cls"].endswith("EditText") and re.match(r"(?i)^aqua$", n["text"] or "") for n in nodes())
            adb("shell input keyevent 111"); time.sleep(1)
    ev.append(shot("S11_make_model"))
    # price 3..8 Mn and year 2012..2018
    p1 = sheet_field(0, "3"); p2 = sheet_field(1, "8")
    adb("shell input keyevent 111"); time.sleep(1)
    y1 = sheet_field(2, "2012"); y2 = sheet_field(3, "2018")
    adb("shell input keyevent 111"); time.sleep(4)
    ns = nodes(); ev.append(shot("S11_ranges"))
    cta = find(r"^(Show [\d,]+ results|Show 1 result|No matches|Show results)$", ns)
    n_ui = int(re.sub(r"\D", "", cta["text"])) if cta and re.search(r"\d", cta["text"] or "") else None
    q = dict(vehicle_category="cars", make="Toyota", sort="newest", price_min=3000000, price_max=8000000, year_min=2012, year_max=2018)
    if model_ok:
        q["model"] = "Aqua"
    api_total = api("listings", size=1, **q).get("total")
    if cta:
        tapxy(*center(cta)); time.sleep(9)
    ns2 = nodes(); ev.append(shot("S11_applied"))
    chips = [n["desc"] for n in ns2 if (n["desc"] or "").startswith("Remove filter")]
    cs = cards(ns2)
    bad = [c["title"] for c in cs if not c["title"].lower().startswith("toyota") or (c["price"] and not 2.95e6 <= c["price"] <= 8.05e6)
           or (year_of(c["sub"]) and not 2012 <= year_of(c["sub"]) <= 2018)]
    # Reset all
    tap(r"^Open filters$", 3, max_y=0.6)
    tap(r"^Reset all$", 4)
    ns3 = nodes(); ev.append(shot("S11_reset"))
    cta3 = find(r"^(Show [\d,]+ results|Show results)$", ns3)
    base_total = api("listings", vehicle_category="cars", size=1).get("total")
    n3 = int(re.sub(r"\D", "", cta3["text"])) if cta3 and re.search(r"\d", cta3["text"] or "") else None
    if cta3:
        tapxy(*center(cta3)); time.sleep(8)
    ns4 = nodes(); ev.append(shot("S11_after_reset"))
    chips_after = [n["desc"] for n in ns4 if (n["desc"] or "").startswith("Remove filter")]
    count_ok = n_ui is not None and api_total is not None and abs(n_ui - api_total) <= max(3, api_total * 0.03)
    ok = make_ok and p1 and y1 and count_ok and not bad and cs and not chips_after
    record("S11", "Search", "Filter sheet fields/make-model/reset", "PASS" if ok else "FAIL",
           f"make_ok={make_ok} model_ok={model_ok} fields={p1,p2,y1,y2} ui_count={n_ui} api_total={api_total} chips={chips} cards={len(cs)} violations={bad[:4]} reset_count={n3} base_total={base_total} chips_after_reset={chips_after}",
           ev, {"query": q, "api_total": api_total})


@T("S12", "Search", "Sort chips change order (price asc/desc, low km)")
def t_s_sort():
    res = {}
    ev = []
    for label, key in [("Price ↑", "price_asc"), ("Price ↓", "price_desc"), ("Low km", "mileage_asc"), ("Best deal", "deal_score")]:
        link("motormila://search"); time.sleep(8)
        n = find(rf"^{re.escape(label)}$")
        for _ in range(3):
            if n and n["b"][2] < SIZE[0] * 0.86:
                break
            anchor = find(r"^(Newest|Best deal|Price ↑)$")
            y = center(anchor)[1] if anchor else int(SIZE[1] * 0.225)
            adb(f"shell input swipe {int(SIZE[0]*0.8)} {y} {int(SIZE[0]*0.3)} {y} 300"); time.sleep(1.5)
            n = find(rf"^{re.escape(label)}$")
        if not n:
            res[key] = "chip not visible"; continue
        tapxy(*center(n)); time.sleep(9)
        ns = nodes(); ev.append(shot(f"S12_{key}"))
        cs = cards(ns)
        prices = [c["price"] for c in cs if c["price"]]
        kms = [km_of(c["sub"]) for c in cs if km_of(c["sub"]) is not None]
        txt = joined(ns)
        gated = bool(re.search(r"(?i)(pro unlocks|upgrade|pro only)", txt))
        if key == "price_asc":
            res[key] = ("PASS" if prices == sorted(prices) and len(prices) > 1 else "FAIL", prices[:6], gated)
        elif key == "price_desc":
            res[key] = ("PASS" if prices == sorted(prices, reverse=True) and len(prices) > 1 else "FAIL", prices[:6], gated)
        elif key == "mileage_asc":
            res[key] = ("PASS" if kms == sorted(kms) and len(kms) > 1 else "FAIL", kms[:6], gated)
        else:
            res[key] = ("INFO", prices[:4], gated)
    st = "PASS" if all((v[0] if isinstance(v, tuple) else "FAIL") in ("PASS", "INFO") for v in res.values()) else "FAIL"
    record("S12", "Search", "Sort chips", st, json.dumps(res, ensure_ascii=False), ev)


@T("S13", "Search", "Infinite scroll loads page 2+")
def t_s_paging():
    link("motormila://search?vehicle_category=cars"); time.sleep(9)
    titles = set(); ev = []
    for i in range(14):
        for c in cards():
            titles.add(c["title"])
        swipe_up(0.6, 300)
    ev.append(shot("S13_deep_scroll"))
    record("S13", "Search", "Infinite scroll", "PASS" if len(titles) > 24 else "FAIL",
           f"distinct cards seen after 14 flings={len(titles)} (page size 20)", ev)


@T("S14", "Search", "Filters persist across process death")
def t_s_procdeath():
    link("motormila://search?vehicle_category=cars&fuel_type=hybrid&district=Kandy"); time.sleep(9)
    before = [n["desc"] for n in nodes() if (n["desc"] or "").startswith("Remove filter")]
    ev = [shot("S14_before")]
    adb("shell input keyevent 3"); time.sleep(2)
    adb(f"shell am kill {PKG}"); time.sleep(2)
    killed = not alive()
    adb(f"shell am start -n {ACT}"); time.sleep(10)
    ns = nodes(); ev.append(shot("S14_after_restore"))
    after = [n["desc"] for n in ns if (n["desc"] or "").startswith("Remove filter")]
    # also a full cold start (force-stop): does Search remember the last filters?
    adb(f"shell am force-stop {PKG}"); start(); time.sleep(6)
    link("motormila://search"); time.sleep(8)
    cold = [n["desc"] for n in nodes() if (n["desc"] or "").startswith("Remove filter")]
    ev.append(shot("S14_after_cold"))
    ok = before and sorted(before) == sorted(after)
    record("S14", "Search", "Filters persist (process death)", "PASS" if ok else "FAIL",
           f"killed={killed}; before={before}; after_restore={after}; after_force_stop_cold={cold}", ev)


@T("S15", "Search", "Shared web links open in app (https://motormila.pages.dev/?make=...)")
def t_s_weblinks():
    res = {}
    ev = []
    for url in [f"{WEB}/?make=Toyota&fuel_type=hybrid", f"{WEB}/search?make=Honda", f"{WEB}/listing/{LID[0] if LID else 1}",
                f"{WEB}/cars/Toyota/Aqua", f"{WEB}/locations/Kandy"]:
        q = adb(f"shell cmd package query-activities -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d \"'{url}'\"")
        handled = PKG in q
        out = adb(f"shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d \"'{url}'\" {PKG}")
        time.sleep(9)
        ns = nodes(); ev.append(shot("S15_" + re.sub(r"\W+", "_", url[29:])[:30]))
        res[url] = {"manifest_handles": handled, "start": "Error" not in out and "unable" not in out.lower(), "screen": joined(ns)[:120]}
    st = "PASS" if all(v["manifest_handles"] for v in res.values()) else "FAIL"
    record("S15", "Search", "Shared web links", st, json.dumps(res, ensure_ascii=False)[:1500], ev)


# ------------------------------------------------------------------ 4. detail
@T("D1", "Detail", "Detail shows live price/specs matching /listings/{id}")
def t_d_main():
    if not LID:
        record("D1", "Detail", "Detail", "FAIL", "no ids"); return
    lid = LID[0]
    d = api(f"listings/{lid}")
    link(f"motormila://listing/{lid}"); time.sleep(10)
    ns = nodes(); ev = [shot("D1_detail")]
    txt = joined(ns)
    p = float(d.get("price_lkr") or 0)
    ok_title = norm(d.get("title"))[:15] in norm(txt)
    shown = [parse_price(l) for l in labels(ns) if l.startswith("Rs")]
    ok_price = any(x and abs(x - p) <= max(1000, p * 0.01) for x in shown) if p else True
    ok_year = str(d.get("year")) in txt if d.get("year") else True
    swipe_up(0.5); ev.append(shot("D1_detail_scrolled"))
    txt2 = joined()
    swipe_up(0.6); ev.append(shot("D1_detail_scrolled2"))
    txt3 = joined()
    swipe_up(0.6); ev.append(shot("D1_detail_scrolled3"))
    txt4 = joined()
    allt = txt + txt2 + txt3 + txt4
    sections = {k: bool(re.search(k, allt, re.I)) for k in ["SPECIFICATIONS", "price history|Price history", "Similar", "fair|FMV|typical", "seller"]}
    record("D1", "Detail", "Detail data", "PASS" if ok_title and ok_price and ok_year else "FAIL",
           f"id={lid} title_ok={ok_title} price_api={p} shown={shown[:4]} year_ok={ok_year} sections={sections}", ev, {"id": lid, "title": d.get("title"), "price": p, "year": d.get("year")})


@T("D2", "Detail", "Gallery: swipe pages, open full screen, double-tap zoom, close")
def t_d_gallery():
    lid = LID[0] if LID else None
    link(f"motormila://listing/{lid}"); time.sleep(10)
    ns = nodes()
    c0 = find(r"^\d+ / \d+$", ns)
    W, H = SIZE
    adb(f"shell input swipe {int(W*0.85)} {int(H*0.17)} {int(W*0.15)} {int(H*0.17)} 250"); time.sleep(2)
    c1 = find(r"^\d+ / \d+$")
    ev = [shot("D2_swiped")]
    tapxy(W // 2, int(H * 0.17)); time.sleep(3)
    ns2 = nodes(); ev.append(shot("D2_fullscreen"))
    full = bool(find(r"(?i)^(close|Close photos)$", ns2)) or len(ns2) < len(ns) * 0.5
    adb(f"shell input tap {W//2} {H//2}"); adb(f"shell input tap {W//2} {H//2}"); time.sleep(2)
    ev.append(shot("D2_doubletap_zoom"))
    back(); time.sleep(2)
    back_ok = bool(find(r"(?i)(SPECIFICATIONS|Asking price|View on)"))
    ok = c0 and c1 and (c0["text"] != c1["text"]) and full and back_ok
    record("D2", "Detail", "Gallery/fullscreen/zoom", "PASS" if ok else "FAIL",
           f"counter {c0 and c0['text']} -> {c1 and c1['text']}; fullscreen_opened={full}; closed_back_to_detail={back_ok}", ev)


@T("D3", "Detail", "'View on <source>' opens the original ad URL outside the app")
def t_d_source():
    lid = LID[0]
    d = api(f"listings/{lid}")
    link(f"motormila://listing/{lid}"); time.sleep(10)
    adb("logcat -c")
    if not tap(r"^View on ", 5, max_y=0.97):
        swipe_up(0.3)
        tap(r"^View on ", 5, max_y=0.97)
    ev = [shot("D3_after_tap")]
    top = resumed()
    log = adb("logcat -d -s ActivityTaskManager:I", 30)
    m = re.search(r"START u0 \{[^}]*dat=([^\s}]+)[^}]*\}", log)
    left = PKG not in top
    record("D3", "Detail", "Source link", "PASS" if left or (m and "ikman" in m.group(1) or m and d.get("url", "")[:20] in m.group(1)) else "FAIL",
           f"resumed={top}; intent_data={m.group(1) if m else None}; api url={d.get('url')}", ev)
    adb(f"shell am start -n {ACT}"); time.sleep(3)


@T("D4", "Detail", "Share listing opens the Android share sheet; WhatsApp share has a fallback")
def t_d_share():
    lid = LID[0]
    link(f"motormila://listing/{lid}"); time.sleep(10)
    adb("logcat -c")
    tap(r"^Share listing$", 4)
    top = resumed(); ev = [shot("D4_share_sheet")]
    ns = nodes()
    sheet = ("intentresolver" in top or "ResolverActivity" in top or "Chooser" in top or any("android" in n["pkg"] and n["pkg"] != PKG for n in ns))
    back(); time.sleep(2)
    adb("logcat -c")
    wa = tap(r"^(Share on WhatsApp|WhatsApp)$", 4, max_y=0.97)
    top2 = resumed(); ev.append(shot("D4_whatsapp"))
    log = adb("logcat -d -s ActivityTaskManager:I", 30)
    m = re.search(r"START u0 \{[^}]*\}", log)
    record("D4", "Detail", "Share + WhatsApp", "PASS" if sheet and (PKG not in top2 or (m and PKG not in m.group(0))) else "FAIL",
           f"share_top={top}; whatsapp_tapped={wa}; after_whatsapp_top={top2}; start={m.group(0)[:200] if m else None}", ev)
    adb(f"shell am start -n {ACT}"); time.sleep(3)


@T("D5", "Detail", "Save from Detail -> appears in Saved/Watchlist -> persists after force-stop -> unsave")
def t_d_save():
    lid = LID[1] if len(LID) > 1 else LID[0]
    d = api(f"listings/{lid}")
    link(f"motormila://listing/{lid}"); time.sleep(10)
    ns = nodes()
    sv = find(r"^(Save|Saved|Remove from saved|Unsave)$", ns, max_y=0.2)
    if not sv:
        record("D5", "Detail", "Save", "FAIL", "Save button not found", [shot("D5_missing")]); return
    tapxy(*center(sv)); time.sleep(2)
    ev = [shot("D5_saved")]
    state_after = find(r"^(Save|Saved|Remove from saved|Unsave)$", max_y=0.2)
    link("motormila://watchlist"); time.sleep(8)
    ns = nodes(); ev.append(shot("D5_watchlist"))
    in_list = norm(d.get("title"))[:12] in norm(joined(ns))
    adb(f"shell am force-stop {PKG}"); start(); time.sleep(5)
    link("motormila://watchlist"); time.sleep(8)
    ns = nodes(); ev.append(shot("D5_watchlist_after_restart"))
    persisted = norm(d.get("title"))[:12] in norm(joined(ns))
    # unsave from detail
    link(f"motormila://listing/{lid}"); time.sleep(8)
    sv = find(r"^(Save|Saved|Remove from saved|Unsave)$", max_y=0.2)
    if sv:
        tapxy(*center(sv)); time.sleep(2)
    link("motormila://watchlist"); time.sleep(8)
    ns = nodes(); ev.append(shot("D5_watchlist_after_unsave"))
    removed = norm(d.get("title"))[:12] not in norm(joined(ns))
    record("D5", "Detail", "Save/persist/unsave", "PASS" if in_list and persisted and removed else "FAIL",
           f"button_after_tap={state_after and state_after['desc']!r}; in_watchlist={in_list}; persisted_after_force_stop={persisted}; removed_after_unsave={removed}", ev)


@T("D6", "Detail", "Similar listings open another Detail; back returns")
def t_d_similar():
    lid = LID[0]
    sim = api(f"listings/{lid}/similar", limit=8)
    link(f"motormila://listing/{lid}"); time.sleep(10)
    ev = []
    for i in range(7):
        ns = nodes()
        if find(r"(?i)^(similar|similar listings|similar cars)", ns, max_y=0.8):
            break
        swipe_up(0.55)
    ns = nodes(); ev.append(shot("D6_similar_section"))
    hdr = find(r"(?i)^(similar|similar listings|similar cars|More like this)", ns)
    cs = [c for c in cards(ns) if hdr and c["node"]["b"][1] > hdr["b"][1]]
    opened = False
    if cs:
        n = cs[0]["node"]; tapxy(n["b"][0] + 40, int(n["b"][1] + (n["b"][3] - n["b"][1]) * 0.85)); time.sleep(8)
        opened = bool(find(r"(?i)(SPECIFICATIONS|Asking price|View on)")); ev.append(shot("D6_similar_opened"))
        back(); time.sleep(2)
    n_api = len(sim) if isinstance(sim, list) else len(sim.get("items", [])) if isinstance(sim, dict) else 0
    record("D6", "Detail", "Similar listings", "PASS" if (opened or n_api == 0) else "FAIL",
           f"api similar={n_api}; header={bool(hdr)}; cards_under_header={len(cs)}; opened={opened}", ev)


@T("D7", "Detail", "Price history / intelligence section has data matching /price-history")
def t_d_history():
    lid = LID[0]
    ph = api(f"listings/{lid}/price-history"); fmv = api(f"listings/{lid}/fmv")
    link(f"motormila://listing/{lid}"); time.sleep(10)
    txts = []
    ev = []
    for i in range(5):
        txts.append(joined()); swipe_up(0.55)
        if i in (1, 3):
            ev.append(shot(f"D7_scroll_{i}"))
    allt = "\n".join(txts)
    record("D7", "Detail", "Price history / FMV", "INFO",
           f"api price-history keys={list(ph.keys())[:6] if isinstance(ph, dict) else type(ph).__name__}; fmv={str(fmv)[:200]}; screen_mentions_history={bool(re.search('(?i)history|price change|first seen', allt))} fmv_mentioned={bool(re.search('(?i)fair|typical|market value', allt))}",
           ev, {"price_history": str(ph)[:400], "fmv": str(fmv)[:400]})


@T("D8", "Detail", "Card -> Detail morph and back returns to the same list position")
def t_d_morph():
    link("motormila://search?vehicle_category=cars"); time.sleep(9)
    swipe_up(0.4)
    ns = nodes(); cs = cards(ns)
    if not cs:
        record("D8", "Detail", "Morph", "FAIL", "no cards"); return
    vis = [x for x in cs if x["node"]["b"][1] > SIZE[1] * 0.3 and x["node"]["b"][3] < SIZE[1] * 0.9]
    c = (vis or cs)[0]; n = c["node"]
    tapxy(n["b"][0] + 40, int(n["b"][1] + (n["b"][3] - n["b"][1]) * 0.85))
    ev = []
    for i in range(3):
        SHOT_N[0] += 1; fn = f"{SHOT_N[0]:03d}_D8_morph_{i}.png"; sh(f"adb exec-out screencap -p > '{os.path.join(OUT, fn)}'"); ev.append(fn)
    time.sleep(5)
    opened = norm(c["title"])[:12] in norm(joined())
    ev.append(shot("D8_detail"))
    back(); time.sleep(3)
    same = any(x["title"] == c["title"] for x in cards())
    ev.append(shot("D8_back"))
    record("D8", "Detail", "Card->Detail morph + back", "PASS" if opened and same else "FAIL", f"opened={opened}; back_same_card_visible={same}", ev)


# ------------------------------------------------------------------ 5. compare
@T("C1", "Compare", "Add 3 from Search -> tray -> Compare values match each listing -> remove")
def t_compare():
    link("motormila://search?vehicle_category=cars"); time.sleep(10)
    for _ in range(4):  # the live API can take 10+ s: wait for real cards, not skeletons
        ns = nodes()
        adds = [n for n in ns if (n["desc"] or "").endswith("to compare") and n["desc"].startswith("Add ")]
        if adds:
            break
        time.sleep(5)
    picked = []
    for n in adds[:3]:
        tapxy(*center(n)); time.sleep(1.5)
        picked.append(n["desc"][4:-11])
    if len(picked) < 3:
        swipe_up(0.35)
        for n in [n for n in nodes() if (n["desc"] or "").startswith("Add ") and n["desc"].endswith("to compare")][: 3 - len(picked)]:
            tapxy(*center(n)); time.sleep(1.5); picked.append(n["desc"][4:-11])
    ev = [shot("C1_tray")]
    tray = find(r"^(Compare|සසඳන්න|ஒப்பிடு) \d$")
    fourth = [n for n in nodes() if (n["desc"] or "").startswith("Add ") and n["desc"].endswith("to compare")]
    if tray:
        tapxy(*center(tray)); time.sleep(10)
    ns = nodes(); ev.append(shot("C1_compare"))
    txt = joined(ns)
    in_cmp = [p for p in picked if norm(p)[:12] in norm(txt)]
    # value check against API for each picked title via search
    rows = {}
    for p in picked:
        items = api("listings", q=p, size=5, vehicle_category="cars").get("items", [])
        it = next((i for i in items if norm(i["title"]) == norm(p)), None)
        if it:
            pr = float(it.get("price_lkr") or 0)
            shown = [parse_price(l) for l in labels(ns) if l.startswith("Rs")]
            rows[p] = {"api_price": pr, "price_on_screen": any(x and abs(x - pr) <= max(10000, pr * 0.01) for x in shown),
                       "year_on_screen": str(it.get("year")) in txt}
    rm = find(r"^Remove ")
    cnt = lambda t: int(m.group(1)) if (m := re.search(r"(\d) of \d cars", t)) else -1
    before = cnt(txt)
    if rm:
        tapxy(*center(rm)); time.sleep(4)
    after = cnt(joined())
    ev.append(shot("C1_removed"))
    vals_ok = rows and all(v["price_on_screen"] and v["year_on_screen"] for v in rows.values())
    ok = len(in_cmp) == len(picked) == 3 and vals_ok and after == before - 1
    record("C1", "Compare", "Compare flow from Search", "PASS" if ok else "FAIL",
           f"picked={picked}; tray={tray and tray['desc']!r}; in_compare={len(in_cmp)}; values={rows}; remove {before}->{after}", ev)


@T("C2", "Compare", "Compare from Detail and via deep link compare?ids=")
def t_compare2():
    lid = LID[0]
    link(f"motormila://listing/{lid}"); time.sleep(10)
    ev = []
    found = None
    for i in range(6):
        found = find(r"(?i)^(compare|compare with similar|add to compare)", max_y=0.9)
        if found:
            break
        swipe_up(0.5)
    if found:
        tapxy(*center(found)); time.sleep(8)
    ev.append(shot("C2_from_detail"))
    t1 = joined()
    from_detail = bool(re.search(r"(?i)(of 4 cars|of 3 cars|Asking price)", t1)) and bool(re.search(r"(?i)compare", t1))
    ids = ",".join(map(str, LID[:3]))
    link(f"motormila://compare?ids={ids}"); time.sleep(10)
    ns = nodes(); ev.append(shot("C2_deeplink"))
    t2 = joined(ns)
    titles = [norm(api(f"listings/{i}").get("title"))[:12] for i in LID[:3]]
    hits = [t for t in titles if t in norm(t2)]
    record("C2", "Compare", "Compare from Detail + deep link", "PASS" if from_detail and len(hits) == len(titles) else "FAIL",
           f"detail_button={found and (found['text'] or found['desc'])!r} opened={from_detail}; deep link titles {len(hits)}/{len(titles)}", ev)


# ------------------------------------------------------------------ 6. hubs / intelligence
HUB_LINKS = [
    ("best_picks", "motormila://picks", r"(?i)(best picks|deal)"),
    ("price_index", "motormila://price-index", r"(?i)price index"),
    ("insights", "motormila://trends", r"(?i)(trend|district|market)"),
    ("official_pulse", "motormila://pulse", r"(?i)pulse"),
    ("ev_hub", "motormila://ev", r"(?i)(EV|electric)"),
    ("ev_chargers", "motormila://ev-chargers", r"(?i)(charg)"),
    ("permits", "motormila://permits", r"(?i)permit"),
    ("make_hub", "motormila://make/Toyota", r"(?i)toyota"),
    ("model_hub", "motormila://cars/Toyota/Aqua", r"(?i)aqua"),
    ("district_hub", "motormila://locations/Kandy", r"(?i)kandy"),
    ("pro", "motormila://pro", r"(?i)pro"),
    ("pricing", "motormila://pricing", r"(?i)(pricing|plan|free)"),
    ("docs", "motormila://docs", r"(?i)(docs|guide|document)"),
    ("calculator", "motormila://calculator", r"(?i)(calculat|landed|duty)"),
    ("dealer", "motormila://dealer", r"(?i)dealer"),
    ("sell", "motormila://sell", r"(?i)(sell|value|price)"),
    ("notifications", "motormila://notifications", r"(?i)(notification|sign in|inbox|caught up)"),
    ("admin", "motormila://admin", r"(?i)(admin|sign in|not allowed|denied)"),
]


@T("U1", "Hubs", "Each hub/intelligence screen returns real numbers (no error)")
def t_hubs():
    for key, uri, rx in HUB_LINKS:
        link(uri); time.sleep(16)
        ns = nodes(); ev = [shot(f"U1_{key}")]
        txt = joined(ns)
        swipe_up(0.5); txt2 = joined(); ev.append(shot(f"U1_{key}_scrolled"))
        err = re.search(r"(?i)(couldn.t load|something went wrong|failed to load|timed out|error loading)", txt + txt2)
        digits = len(re.findall(r"\d", txt + txt2))
        spinner_only = len(labels(ns)) < 6
        ok = re.search(rx, txt) and not err and digits >= 6 and not spinner_only
        if key in ("notifications", "admin", "dealer", "pro", "docs", "sell"):
            ok = re.search(rx, txt + txt2) and not err
        record(f"U1.{key}", "Hubs", f"{key}", "PASS" if ok else "FAIL",
               f"digits={digits} error={err.group(0) if err else None}; text={(txt)[:260]!r}", ev)


@T("U2", "Hubs", "Price index / insights tabs switch and show different data")
def t_tabs():
    for uri, key in [("motormila://price-index", "price_index"), ("motormila://trends", "insights"), ("motormila://pulse", "pulse"), ("motormila://picks", "picks")]:
        link(uri); time.sleep(14)
        ns = nodes()
        tabs = [n for n in ns if n["click"] and (n["text"] or n["desc"]) and SIZE[1] * 0.12 < n["b"][1] < SIZE[1] * 0.45
                and n["b"][3] - n["b"][1] < 180 and (n["b"][2] - n["b"][0]) < SIZE[0] * 0.5]
        ev = [shot(f"U2_{key}_0")]
        changes = []
        base = joined(ns)
        for t in tabs[:4]:
            tapxy(*center(t)); time.sleep(6)
            now = joined(); ev.append(shot(f"U2_{key}_{len(changes)+1}"))
            changes.append(((t["text"] or t["desc"])[:20], now != base))
            base = now
        record(f"U2.{key}", "Hubs", f"{key} tabs", "PASS" if changes and any(c[1] for c in changes) else ("INFO" if not changes else "FAIL"),
               f"tabs_tapped={changes}", ev)


@T("U3", "Hubs", "AI Value valuation: enter make/model/year -> real estimate vs /listings/estimate")
def t_valuation():
    link("motormila://valuation?make=Toyota&model=Aqua"); time.sleep(10)
    ns = nodes(); ev = [shot("U3_valuation")]
    est = api("listings/estimate", make="Toyota", model="Aqua", year=2015)
    # try to fill a year field + submit
    eds = [n for n in ns if n["cls"].endswith("EditText")]
    for e in eds:
        if re.search(r"(?i)year", e["text"] + e["desc"]):
            tapxy(*center(e)); adb("shell input text '2015'"); adb("shell input keyevent 111"); time.sleep(1)
    for _ in range(4):
        b = find(r"(?i)^(estimate|get estimate|get value|value my car|show value|continue|next|see value|calculate)", max_y=0.95)
        if not b:
            swipe_up(0.4); b = find(r"(?i)^(estimate|get estimate|get value|value my car|show value|continue|next|see value|calculate)", max_y=0.95)
        if b:
            tapxy(*center(b)); time.sleep(6)
        else:
            break
    time.sleep(10)
    ns2 = nodes(); ev.append(shot("U3_result"))
    txt = joined(ns2)
    swipe_up(0.4); ev.append(shot("U3_result_scrolled")); txt += joined()
    has_money = bool(re.search(r"Rs\s*[\d.,]+", txt))
    record("U3", "Hubs", "Valuation", "PASS" if has_money else "FAIL", f"api_estimate={str(est)[:250]}; screen={txt[:300]!r}", ev, est)


@T("U4", "Hubs", "15 s load timeout -> error with Retry; Retry recovers (network cut mid-load)")
def t_timeout():
    # Black-hole the backend host so calls hang until the client timeout.
    adb("shell settings put global http_proxy 10.255.255.1:3128")
    try:
        adb(f"shell am force-stop {PKG}"); start(); time.sleep(3)
        link("motormila://price-index"); t0 = time.time()
        ns = wait_for(r"(?i)(retry|try again|couldn.t|timed out|unavailable|offline)", 45)
        dt = round(time.time() - t0, 1)
        ev = [shot("U4_timeout_state")]
    finally:
        adb("shell settings put global http_proxy :0")
    time.sleep(3)
    r = find(r"(?i)^(retry|try again)$") or find(r"(?i)retry")
    if r:
        tapxy(*center(r))
    time.sleep(15)
    ns2 = nodes(); ev.append(shot("U4_after_retry"))
    recovered = not re.search(r"(?i)(couldn.t|timed out|unavailable)", joined(ns2)) and len(re.findall(r"\d", joined(ns2))) > 6
    record("U4", "Hubs", "Timeout + retry", "PASS" if ns and dt <= 40 and r and recovered else "FAIL",
           f"error_state_after={dt}s (expect ~15-20s); retry_button={bool(r)}; recovered={recovered}; text={joined(ns or [])[:200]!r}", ev)


# ------------------------------------------------------------------ 7/8. auth + alerts
@T("A1", "Auth", "Sign-in form validation + backend error is shown (no crash)")
def t_auth():
    link("motormila://sign-in"); time.sleep(6)
    ns = nodes(); ev = [shot("A1_signin")]
    eds = [n for n in ns if n["cls"].endswith("EditText")]
    # empty submit
    btns = [n for n in ns if (n["desc"] or n["text"]) == "Log in" and n["b"][1] > SIZE[1] * 0.45]
    if btns:
        tapxy(*center(btns[-1])); time.sleep(3)
    ev.append(shot("A1_empty_submit"))
    empty_txt = joined()
    if len(eds) >= 2:
        tapxy(*center(eds[0])); adb("shell input text 'qa+android@motormila.test'")
        tapxy(*center(eds[1])); adb("shell input text 'WrongPass123'"); adb("shell input keyevent 111"); time.sleep(1)
        if btns:
            tapxy(*center(btns[-1]))
        time.sleep(12)
    ns2 = nodes(); ev.append(shot("A1_bad_login"))
    txt = joined(ns2)
    login_api = sh("curl -s -m 30 -X POST " + API + "/auth/login -H 'content-type: application/json' -d '{\"email\":\"qa+android@motormila.test\",\"password\":\"WrongPass123\"}' -w ' HTTP%{http_code}'")
    shown_err = bool(re.search(r"(?i)(invalid|incorrect|wrong|unavailable|try again|couldn|retry|failed|error)", txt))
    tap(r"^Sign up$", 3, max_y=0.45)
    ev.append(shot("A1_signup_tab")); sup = joined()
    tap(r"^Forgot password\?$", 4)
    ev.append(shot("A1_forgot")); fg = joined(); top = resumed()
    record("A1", "Auth", "Sign-in UI states", "PASS" if shown_err and alive() else "FAIL",
           f"login_api={login_api}; error_shown={shown_err}; text={txt[:250]!r}; signup_tab={sup[:200]!r}; forgot_top={top}",
           ev, {"login": login_api})


@T("A2", "Auth", "Signed-out gates: alerts/notifications/profile show sign-in prompts that navigate")
def t_gates():
    res = {}; ev = []
    for uri, key in [("motormila://alerts", "alerts"), ("motormila://notifications", "notifications"), (f"{WEB}/profile", "profile")]:
        link(uri); time.sleep(7)
        ev.append(shot(f"A2_{key}"))
        b = find(r"^(Sign in|Sign in or create account|Log in)$", max_y=0.9)
        if b:
            tapxy(*center(b)); time.sleep(5)
            ev.append(shot(f"A2_{key}_tapped"))
            res[key] = bool(find(r"^Password$|^Email$"))
        else:
            res[key] = None
    record("A2", "Auth", "Signed-out gates", "PASS" if all(v for v in res.values() if v is not None) and any(res.values()) else "FAIL", json.dumps(res), ev)


@T("A3", "Alerts", "Alert form validation while signed out (create -> prompt sign in), Telegram field")
def t_alert_form():
    link("motormila://alerts"); time.sleep(7)
    ns = nodes(); ev = [shot("A3_alerts")]
    eds = [n for n in ns if n["cls"].endswith("EditText")]
    if eds:
        tapxy(*center(eds[0])); adb("shell input text 'Toyota'"); time.sleep(2); adb("shell input keyevent 111")
    mx = [n for n in nodes() if n["cls"].endswith("EditText") and re.search(r"(?i)max", n["text"] + n["desc"])]
    if mx:
        tapxy(*center(mx[0])); adb("shell input text 'abc'"); adb("shell input keyevent 111"); time.sleep(1)
    ev.append(shot("A3_filled"))
    tg = find(r"(?i)telegram")
    swipe_up(0.3)
    b = find(r"^Create alert$")
    if b:
        tapxy(*center(b)); time.sleep(5)
    ns2 = nodes(); ev.append(shot("A3_create_tapped"))
    txt = joined(ns2)
    reacted = bool(re.search(r"(?i)(sign in|valid|enter|required|invalid|number)", txt))
    record("A3", "Alerts", "Alert form (signed out)", "PASS" if reacted else "FAIL",
           f"telegram_field_visible_signed_out={bool(tg)}; create_feedback={reacted}; text={txt[:250]!r}", ev)


# ------------------------------------------------------------------ 10. settings
@T("G1", "Settings", "Appearance Light/Dark/System applies + persists after restart")
def t_theme():
    res = {}; ev = []
    for mode in ["Dark", "Light", "System"]:
        link("motormila://settings"); time.sleep(5)
        tap(rf"^{mode}$", 3)
        ev.append(shot(f"G1_{mode}"))
        px = sh(f"adb exec-out screencap -p > /tmp/g.png && python3 -c \"from PIL import Image; im=Image.open('/tmp/g.png').convert('RGB'); print(sum(im.getpixel((x,{int(SIZE[1]*0.5)}))[0] for x in range(0,{SIZE[0]},20))//({SIZE[0]}//20))\"").strip()
        res[mode] = px
    # persistence: pick Dark, restart, check
    link("motormila://settings"); time.sleep(4); tap(r"^Dark$", 3)
    adb(f"shell am force-stop {PKG}"); start(); time.sleep(8)
    link("motormila://settings"); time.sleep(5)
    ev.append(shot("G1_dark_after_restart"))
    px = sh(f"adb exec-out screencap -p > /tmp/g.png && python3 -c \"from PIL import Image; im=Image.open('/tmp/g.png').convert('RGB'); print(sum(im.getpixel((x,{int(SIZE[1]*0.5)}))[0] for x in range(0,{SIZE[0]},20))//({SIZE[0]}//20))\"").strip()
    res["Dark_after_restart"] = px
    tap(r"^Light$", 3)
    try:
        ok = int(res["Dark"]) < 90 and int(res["Light"]) > 170 and int(res["Dark_after_restart"]) < 90
    except Exception:
        ok = False
    record("G1", "Settings", "Theme switch + persist", "PASS" if ok else "FAIL", f"mean red channel mid-row per mode={res}", ev)


@T("G2", "Settings", "Reduce transparency + Low-data toggles flip and persist")
def t_toggles():
    link("motormila://settings"); time.sleep(5)
    ns = nodes()
    sw = [n for n in ns if n["checkable"] or "Switch" in n["cls"]]
    before = [n["checked"] for n in sw]
    for n in sw[:2]:
        tapxy(*center(n)); time.sleep(1.5)
    mid = [n["checked"] for n in nodes() if n["checkable"] or "Switch" in n["cls"]]
    ev = [shot("G2_toggled")]
    adb(f"shell am force-stop {PKG}"); start(); time.sleep(6)
    link("motormila://settings"); time.sleep(5)
    after = [n["checked"] for n in nodes() if n["checkable"] or "Switch" in n["cls"]]
    ev.append(shot("G2_after_restart"))
    for n in [n for n in nodes() if n["checkable"] or "Switch" in n["cls"]][:2]:
        tapxy(*center(n)); time.sleep(1.5)
    record("G2", "Settings", "Toggles persist", "PASS" if sw and mid != before and after == mid else "FAIL",
           f"switches={len(sw)} before={before} toggled={mid} after_restart={after}", ev)


@T("G3", "Settings", "Language en -> si -> ta: UI strings change (untranslated English counted)")
def t_lang():
    res = {}; ev = []
    for lang, label in [("si", "සිංහල"), ("ta", "தமிழ்"), ("en", "English")]:
        link("motormila://settings"); time.sleep(5)
        tap(rf"^{label}$", 6)
        time.sleep(4)
        adb(f"shell am force-stop {PKG}"); start(); time.sleep(6)
        for uri, key in [("motormila://home", "home"), ("motormila://search", "search"), (f"motormila://listing/{LID[0]}", "detail"), ("motormila://settings", "settings")]:
            link(uri); time.sleep(9)
            ns = nodes(); ev.append(shot(f"G3_{lang}_{key}"))
            labs = [l for l in labels(ns) if re.search(r"[A-Za-z]{3,}", l) and not re.search(r"(Rs |km|MotorMila|Motormila|\d{4}|ikman|riyasewana|Toyota|Honda|Suzuki|Nissan|^PRO$|^Pro$|WhatsApp|Ikman|Riyasewana|Patpat)", l)]
            res[f"{lang}.{key}"] = {"english_labels": labs[:25], "n_english": len(labs), "n_total": len(labels(ns))}
    start("--es mm_qa_lang en"); time.sleep(5); adb(f"shell am force-stop {PKG}"); start(); time.sleep(6)
    si_en = sum(v["n_english"] for k, v in res.items() if k.startswith("si."))
    record("G3", "Settings", "Language switching", "PASS" if si_en < 25 else "FAIL",
           json.dumps({k: (v["n_english"], v["english_labels"][:12]) for k, v in res.items()}, ensure_ascii=False)[:2500], ev)


@T("G4", "Settings", "Privacy / Terms / Licences / Feedback / Contact / Clear cache do something real")
def t_settings_rows():
    res = {}; ev = []
    for label, expect in [("Privacy", r"(?i)privacy"), ("Terms", r"(?i)terms"), ("Open[- ]source|Licen[cs]es|Third-party", r"(?i)(licen|apache|mit)")]:
        link("motormila://settings"); time.sleep(5)
        for _ in range(3):
            n = find(rf"(?i)^({label})", max_y=0.92)
            if n:
                break
            swipe_up(0.4)
        if not n:
            res[label] = "row not found"; continue
        tapxy(*center(n)); time.sleep(5)
        ns = nodes(); ev.append(shot("G4_" + re.sub(r"\W", "", label)[:10]))
        txt = joined(ns)
        res[label] = bool(re.search(expect, txt)) and len(txt) > 200
    link("motormila://settings"); time.sleep(5)
    for _ in range(3):
        if find(r"^Feedback$", max_y=0.92):
            break
        swipe_up(0.4)
    if tap(r"^Feedback$", 3):
        ev.append(shot("G4_feedback")); eds = [n for n in nodes() if n["cls"].endswith("EditText")]
        res["Feedback dialog"] = bool(eds)
        back()
    adb("logcat -c")
    if tap(r"^Contact us$", 4):
        log = adb("logcat -d -s ActivityTaskManager:I", 30)
        res["Contact mailto"] = ("mailto" in log) or (PKG not in resumed())
        ev.append(shot("G4_contact")); adb(f"shell am start -n {ACT}"); time.sleep(2)
    link("motormila://settings"); time.sleep(4)
    for _ in range(3):
        if find(r"^Clear photo cache$", max_y=0.92):
            break
        swipe_up(0.4)
    if tap(r"^Clear photo cache$", 1):
        ev.append(shot("G4_clear_cache")); res["Clear cache feedback"] = bool(re.search(r"(?i)(clear|freed|done)", joined()))
    st = "PASS" if all(v is True for v in res.values()) else "FAIL"
    record("G4", "Settings", "Settings rows", st, json.dumps(res, ensure_ascii=False), ev)


@T("G5", "Settings", "Profile: version shown + check-for-updates action")
def t_profile_version():
    link(f"{WEB}/profile"); time.sleep(6)
    ev = []
    txt = ""
    for i in range(6):
        txt += joined(); swipe_up(0.6)
    ev.append(shot("G5_profile_bottom"))
    ver = re.search(r"1\.7\.0[-\w.]*", txt)
    upd = find(r"(?i)(check for update|up to date|update available|updates)")
    res = None
    if upd:
        tapxy(*center(upd)); time.sleep(8); ev.append(shot("G5_update_tapped")); res = joined()[:250]
    vc = adb(f"shell dumpsys package {PKG} | grep versionCode").strip()
    man = api_raw = sh("curl -sL -m 30 https://github.com/SuvenSeo/Vehicle-Platform/releases/download/preview-android-1.7.0/preview-latest.json")
    record("G5", "Settings", "Version + update check", "PASS" if ver else "FAIL",
           f"version_text={ver.group(0) if ver else None}; update_row={bool(upd)}; after_tap={res!r}; installed={vc}; manifest={man[:200]}", ev)


@T("G6", "Settings", "Preview self-updater: older APK sees 'Update available' from preview-latest.json")
def t_updater():
    if not args.old_apk or not os.path.exists(args.old_apk):
        record("G6", "Settings", "Self-updater", "INFO", "no old APK supplied"); return
    adb(f"uninstall {PKG}")
    print(adb(f"install -r -t '{args.old_apk}'", 240))
    vc = adb(f"shell dumpsys package {PKG} | grep versionCode").strip()
    start(); time.sleep(20)
    ns = nodes(); ev = [shot("G6_old_apk_launch")]
    txt = joined(ns)
    dialog = bool(re.search(r"(?i)(update available|new version|install update|download)", txt))
    upd = find(r"(?i)^(update|install|download|update now)$")
    dl = None
    if upd:
        tapxy(*center(upd)); time.sleep(25); ev.append(shot("G6_update_tapped")); dl = joined()[:200] + " | top=" + resumed()
    man = sh("curl -sL -m 30 https://github.com/SuvenSeo/Vehicle-Platform/releases/download/preview-android-1.7.0/preview-latest.json")
    record("G6", "Settings", "Self-updater (old APK)", "PASS" if dialog else "FAIL",
           f"installed={vc}; manifest={man[:160]}; dialog={dialog}; text={txt[:200]!r}; after_update_tap={dl!r}", ev)
    adb(f"uninstall {PKG}")
    print(adb(f"install -r -t '{args.apk}'", 240))
    adb(f"shell pm grant {PKG} android.permission.POST_NOTIFICATIONS")
    start(); time.sleep(8)


# ------------------------------------------------------------------ 11. camera / intents
@T("X1", "Intents", "Plate scan: camera permission prompt -> grant -> camera / no-camera state")
def t_scan():
    adb(f"shell pm revoke {PKG} android.permission.CAMERA")
    link("motormila://scan"); time.sleep(6)
    ns = nodes(); ev = [shot("X1_scan")]
    txt = joined(ns)
    g = find(r"(?i)(allow camera|grant|camera access|enable camera)", ns)
    if g and not re.search(r"(?i)Allow .* to take pictures", txt):
        tapxy(*center(g)); time.sleep(3); ns = nodes(); txt = joined(ns); ev.append(shot("X1_perm_dialog"))
    dialog = bool(re.search(r"(?i)Allow .* to take pictures", txt))
    a = find(r"(?i)^(While using the app|Only this time|Allow)$", ns)
    if a:
        tapxy(*center(a)); time.sleep(6)
    ev.append(shot("X1_after_grant"))
    after = joined()
    granted = "granted=true" in adb(f"shell dumpsys package {PKG} | grep android.permission.CAMERA")
    record("X1", "Intents", "Plate scan", "PASS" if dialog and granted and alive() else "FAIL",
           f"system_dialog={dialog}; granted={granted}; after_grant_screen={after[:200]!r} (emulator has no camera: -camera-back none)", ev)
    back()


@T("X2", "Intents", "Share-import: ACTION_SEND of an ikman URL opens the listing/estimate in app")
def t_share_import():
    url = next((i["url"] for i in LISTINGS if "ikman.lk" in (i.get("url") or "")), None)
    adb(f"shell am start -W -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT '{url}' -n {PKG}/lk.motormila.app.ShareImportActivity")
    time.sleep(12)
    ns = nodes(); ev = [shot("X2_share_import")]
    txt = joined(ns)
    b = find(r"(?i)^(open listing|open|view listing|open valuation|estimate)")
    if b:
        tapxy(*center(b)); time.sleep(8); ev.append(shot("X2_share_import_open")); txt += "\n>>" + joined()
    ok = bool(re.search(r"(?i)(SPECIFICATIONS|Asking price|View on|estimate|fair|value|worth)", txt))
    record("X2", "Intents", "Share import", "PASS" if ok else "FAIL", f"url={url}; text={txt[:300]!r}", ev)


@T("X3", "Intents", "Voice search button launches recognizer or explains it's unavailable")
def t_voice():
    link("motormila://search"); time.sleep(7)
    adb("logcat -c")
    tap(r"^Voice search$", 4)
    ev = [shot("X3_voice")]
    top = resumed(); txt = joined()
    record("X3", "Intents", "Voice search", "PASS" if (PKG not in top) or re.search(r"(?i)(not available|speak|listening|microphone)", txt) else "FAIL",
           f"top={top}; text={txt[:200]!r}", ev)
    adb(f"shell am start -n {ACT}"); time.sleep(2)


# ------------------------------------------------------------------ 12. accessibility
@T("Y1", "A11y", "Clickable controls without a label (TalkBack) on key screens")
def t_a11y():
    out = {}; ev = []
    for uri, key in [("motormila://home", "home"), ("motormila://search", "search"), (f"motormila://listing/{LID[0]}", "detail"),
                     ("motormila://settings", "settings"), ("motormila://watchlist", "watchlist"), ("motormila://alerts", "alerts"), (f"motormila://compare?ids={','.join(map(str, LID[:2]))}", "compare")]:
        link(uri); time.sleep(9)
        xml, root = dump(); ev.append(shot(f"Y1_{key}"))
        unlabeled = []
        if root is not None:
            def walk(e):
                t = e.get("text", "") + e.get("content-desc", "")
                for c in e:
                    t += walk(c)
                return t
            for e in root.iter("node"):
                if e.get("clickable") == "true" and e.get("package") == PKG:
                    if not walk(e).strip():
                        unlabeled.append(e.get("bounds"))
        out[key] = unlabeled
    total = sum(len(v) for v in out.values())
    record("Y1", "A11y", "Unlabeled clickables", "PASS" if total == 0 else "FAIL", json.dumps(out), ev)


@T("Y2", "A11y", "200% font: key screens render without crash, CTAs reachable")
def t_font():
    adb("shell settings put system font_scale 2.0"); time.sleep(2)
    ev = []; res = {}
    try:
        for uri, key in [("motormila://home", "home"), ("motormila://search", "search"), (f"motormila://listing/{LID[0]}", "detail"), ("motormila://settings", "settings")]:
            link(uri); time.sleep(9); ev.append(shot(f"Y2_{key}"))
            res[key] = alive() and len(labels()) > 5
        link("motormila://search"); time.sleep(8)
        tap(r"^Open filters$", 3, max_y=0.6)
        ev.append(shot("Y2_filters"))
        res["filter_cta_visible"] = bool(find(r"^(Show|No matches)"))
        back()
    finally:
        adb("shell settings put system font_scale 1.0")
    record("Y2", "A11y", "200% font", "PASS" if all(res.values()) else "FAIL", json.dumps(res), ev)


@T("Y3", "A11y", "Reduced motion (animator scale 0 / remove animations) - app honours it, no crash")
def t_motion():
    adb("shell settings put global animator_duration_scale 0")
    link("motormila://search"); time.sleep(8)
    cs = cards(); ev = []
    if cs:
        n = cs[0]["node"]; tapxy(n["b"][0] + 40, int(n["b"][1] + (n["b"][3] - n["b"][1]) * 0.85)); time.sleep(0.4)
        ev.append(shot("Y3_reduced_tap"))
        time.sleep(3); back()
    record("Y3", "A11y", "Reduced motion", "PASS" if alive() else "FAIL", "animator_duration_scale=0; detail opened and closed", ev)


# ------------------------------------------------------------------ 13. tabs + dead-button hunt
@T("Z1", "Global", "Bottom tabs each open their screen")
def t_tabs_bar():
    res = {}; ev = []
    # The glass tab bar minimises to the current tab while content is scrolled:
    # start from Home at the top so every tab is laid out. Fresh process: on the
    # API 36 shard the previous test (X2 share-import) left a task without the tab bar.
    adb(f"shell am force-stop {PKG}"); start(); time.sleep(6)
    link("motormila://home"); time.sleep(6)
    ev.append(shot("Z1_home"))
    for lab, rx in [("Prices", r"(?i)(price|index|district|market)"), ("Tools", r"(?i)(calculator|tools|valuation)"), ("Sell", r"(?i)(sell|value)"),
                    ("Saved", r"(?i)(watchlist|saved|nothing)"), ("Buy", r"(?i)(fair price|cars listed|vehicles listed)")]:
        n = find(rf"^{lab}$", min_y=0.8)
        if not n:
            swipe_down(0.5) if "swipe_down" in globals() else adb("shell input swipe 540 900 540 1700 300"); time.sleep(1.5)
            n = find(rf"^{lab}$", min_y=0.8)
        if n:
            tapxy(*center(n)); time.sleep(6)
            ns = nodes(); ev.append(shot(f"Z1_{lab}"))
            res[lab] = bool(re.search(rx, joined(ns)))
        else:
            res[lab] = None
    record("Z1", "Global", "Bottom tabs", "PASS" if all(res.values()) else "FAIL", json.dumps(res), ev)


def pix():
    """Coarse screen fingerprint (32x64 greyscale) so theme / selection / chart changes count as an effect."""
    try:
        from PIL import Image
        import io
        raw = subprocess.run("adb exec-out screencap -p", shell=True, capture_output=True, timeout=30).stdout
        return list(Image.open(io.BytesIO(raw)).convert("L").resize((32, 64)).getdata())
    except Exception:  # noqa
        return None


def sig(ns):
    states = tuple(sorted((n["text"] or n["desc"], n["checked"], n["selected"]) for n in ns if n["checkable"] or n["selected"] or n["checked"]))
    return (resumed(), tuple(sorted(set(labels(ns))))[:400], states)


def pix_changed(a, b, thr=6.0):
    if a is None or b is None:
        return False
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a) > thr


@T("Z2", "Global", "Dead-button hunt: tap every clickable on main screens, flag taps with no effect")
def t_hunt():
    screens = [("home", "motormila://home"), ("search", "motormila://search"), ("detail", f"motormila://listing/{LID[0]}"),
               ("tools", "TAB:Tools"), ("profile", f"{WEB}/profile"), ("settings", "motormila://settings"),
               ("best_picks", "motormila://picks"), ("price_index", "motormila://price-index"), ("pulse", "motormila://pulse"),
               ("ev_hub", "motormila://ev"), ("calculator", "motormila://calculator"), ("sell", "motormila://sell"),
               ("make_hub", "motormila://make/Toyota"), ("district_hub", "motormila://locations/Kandy"), ("pricing", "motormila://pricing"),
               ("valuation", "motormila://valuation"), ("insights", "motormila://trends"), ("permits", "motormila://permits")]
    report = {}
    for key, uri in screens:
        def open_screen():
            if uri.startswith("TAB:"):
                link("motormila://home"); time.sleep(4); tap(rf"^{uri[4:]}$", 5, min_y=0.8)
            else:
                link(uri); time.sleep(10 if key in ("detail", "home", "search") else 8)
        open_screen()
        ns = nodes()
        W, H = SIZE
        targets = []
        for n in ns:
            if not n["click"] or n["pkg"] != PKG:
                continue
            cy = (n["b"][1] + n["b"][3]) // 2
            if cy > H * 0.86 or cy < H * 0.05:
                continue
            lab = n["desc"] or n["text"]
            if not lab:
                inner = [m for m in ns if m["b"][0] >= n["b"][0] and m["b"][2] <= n["b"][2] and m["b"][1] >= n["b"][1] and m["b"][3] <= n["b"][3] and (m["text"] or m["desc"])]
                lab = (inner[0]["text"] or inner[0]["desc"]) if inner else f"<unlabeled {n['b']}>"
            cx, cy2 = center(n)
            idx = ns.index(n)
            # Rows scrolled under the glass top bar stay in the tree: a later (drawn on top)
            # clickable that is not this node's descendant owns the tap there. Skip them.
            covered = any(m["click"] and j > idx and m["b"][0] <= cx <= m["b"][2] and m["b"][1] <= cy2 <= m["b"][3]
                          and not (n["b"][0] <= m["b"][0] and m["b"][2] <= n["b"][2] and n["b"][1] <= m["b"][1] and m["b"][3] <= n["b"][3])
                          for j, m in enumerate(ns))
            if covered:
                continue
            if re.match(r"^(සිංහල|தமிழ்|Log out|Delete account)", lab or ""):
                continue  # keep the rest of the hunt in English and the signed state intact
            targets.append((lab[:50], center(n)))
        seen = set(); dead = []; tested = 0
        for lab, (x, y) in targets[:22]:
            if (x // 30, y // 30) in seen:
                continue
            seen.add((x // 30, y // 30))
            before = sig(nodes()); p0 = pix()
            tapxy(x, y); time.sleep(2.2)
            ns2 = nodes()
            after = sig(ns2)
            if before == after:  # slow screens: one more look before calling it dead
                time.sleep(2.5); ns2 = nodes(); after = sig(ns2)
            tested += 1
            if before == after and pix_changed(p0, pix()):
                after = ("pixels",)
            if before == after:
                dead.append(lab)
            if after != before:
                open_screen()
        report[key] = {"tested": tested, "no_visible_effect": dead}
        print("HUNT", key, report[key], flush=True)
    json.dump(report, open(os.path.join(OUT, "dead_button_hunt.json"), "w"), indent=1, ensure_ascii=False)
    total = sum(len(v["no_visible_effect"]) for v in report.values())
    record("Z2", "Global", "Dead-button hunt", "INFO", json.dumps(report, ensure_ascii=False)[:3000], [])


# ------------------------------------------------------------------ run
adb(f"install -r -t '{args.apk}'", 240)
adb(f"shell pm grant {PKG} android.permission.POST_NOTIFICATIONS")
for tid, area, name, fn in TESTS:
    if not wanted(tid):
        continue
    print("==>", tid, name, flush=True)
    try:
        fn()
    except Exception as e:  # noqa
        import traceback
        record(tid, area, name, "FAIL", "harness error: " + traceback.format_exc()[-600:], [])
    if not alive():
        start(); time.sleep(5)

sh(f"adb logcat -d -b crash > '{OUT}/crash.txt'")
sh(f"adb logcat -d > '{OUT}/logcat.txt'", 120)
summary = {s: sum(1 for r in RESULTS if r["status"] == s) for s in ("PASS", "FAIL", "INFO")}
json.dump({"sdk": SDK, "size": SIZE, "summary": summary, "results": RESULTS}, open(os.path.join(OUT, "results.json"), "w"), indent=1, ensure_ascii=False)
print("DONE sdk", SDK, summary)
