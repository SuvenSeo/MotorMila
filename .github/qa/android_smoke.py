#!/usr/bin/env python3
"""TEMPORARY QA smoke journey for MotorMila Android (adb + uiautomator dump + screencap).

Runs against whatever backend the APK was built for (directDebug defaults to the
LIVE production HF backend). Each step: up to 3 attempts; screenshot + UI dump per
attempt; results in results.json / results.md; full logcat + crash buffer saved.
Never creates accounts. Sign-in is attempted only if QA_LOGIN_EMAIL/QA_LOGIN_PASSWORD
are present in the environment (they are not wired in this workflow).
"""
import argparse, json, os, re, subprocess, sys, time, traceback
import xml.etree.ElementTree as ET

PKG = "lk.motormila.app.debug"
ACT = f"{PKG}/lk.motormila.app.MainActivity"
PRICE_MN = re.compile(r"Rs\s?[\d.,]+\s?Mn")
PRICE_ANY = re.compile(r"Rs\s?[\d.,]+")

ap = argparse.ArgumentParser()
ap.add_argument("--apk", required=True)
ap.add_argument("--out", default="qa-out")
ap.add_argument("--api", default="?")
args = ap.parse_args()
OUT = args.out
os.makedirs(f"{OUT}/shots", exist_ok=True)
os.makedirs(f"{OUT}/dumps", exist_ok=True)
RESULTS = []
SHOT_N = [0]


def sh(cmd, timeout=90, check=False):
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
    if check and p.returncode != 0:
        raise RuntimeError(f"cmd failed: {cmd}\n{p.stdout}\n{p.stderr}")
    return (p.stdout or "") + (p.stderr or "")


def adb(c, timeout=90):
    return sh(f"adb {c}", timeout=timeout)


def shot(name):
    SHOT_N[0] += 1
    fn = f"{OUT}/shots/{SHOT_N[0]:03d}_{re.sub(r'[^A-Za-z0-9_-]+', '_', name)}.png"
    sh(f"adb exec-out screencap -p > '{fn}'")
    return fn


class Node:
    def __init__(self, e):
        self.text = e.get("text", "") or ""
        self.desc = e.get("content-desc", "") or ""
        self.cls = e.get("class", "")
        self.pkg = e.get("package", "")
        self.clickable = e.get("clickable") == "true"
        b = re.findall(r"\d+", e.get("bounds", "[0,0][0,0]"))
        self.x1, self.y1, self.x2, self.y2 = map(int, b)
        self.res = e.get("resource-id", "")

    @property
    def label(self):
        return f"{self.text} | {self.desc}"

    def center(self):
        return (self.x1 + self.x2) // 2, (self.y1 + self.y2) // 2


def dump(tag=None):
    for _ in range(3):
        out = adb("exec-out uiautomator dump /dev/tty", timeout=40)
        m = re.search(r"<\?xml.*</hierarchy>", out, re.S)
        if m:
            xml = m.group(0)
            if tag:
                with open(f"{OUT}/dumps/{SHOT_N[0]:03d}_{tag}.xml", "w") as f:
                    f.write(xml)
            try:
                root = ET.fromstring(xml)
                return [Node(e) for e in root.iter("node")]
            except ET.ParseError:
                pass
        time.sleep(1)
    return []


def find(nodes, pat, where="both", flags=re.I):
    rx = re.compile(pat, flags)
    res = []
    for n in nodes:
        fields = [n.text] if where == "text" else [n.desc] if where == "desc" else [n.text, n.desc]
        if any(f and rx.search(f) for f in fields):
            res.append(n)
    return res


def wait_for(pat, timeout=45, where="both"):
    t0 = time.time()
    nodes = []
    while time.time() - t0 < timeout:
        nodes = dump()
        hit = find(nodes, pat, where)
        if hit:
            return hit, nodes
        dismiss_noise(nodes)
        time.sleep(2)
    return [], nodes


def tap(n):
    x, y = n.center()
    adb(f"shell input tap {x} {y}")
    time.sleep(1.5)


def tap_text(pat, timeout=20, where="both"):
    hit, _ = wait_for(pat, timeout, where)
    if not hit:
        raise AssertionError(f"no node matching /{pat}/")
    tap(hit[0])
    return hit[0]


def dismiss_noise(nodes=None):
    """Dismiss the self-update dialog (direct flavor) if it shows up. Never touches permission dialogs."""
    nodes = nodes if nodes is not None else dump()
    for n in find(nodes, r"^Later$", "text"):
        tap(n)
        return True
    return False


def swipe_up(frac=0.5):
    adb(f"shell input swipe {W//2} {int(H*0.75)} {W//2} {int(H*(0.75-frac))} 400")
    time.sleep(1.5)


def scroll_find(pat, where="both", max_swipes=8, wait_first=30):
    hit, nodes = wait_for(pat, wait_first, where)
    n = 0
    while not hit and n < max_swipes:
        swipe_up(0.45)
        nodes = dump()
        hit = find(nodes, pat, where)
        n += 1
    return hit, nodes


def bottom_tab(label):
    for _ in range(3):
        nodes = dump()
        h = [n for n in find(nodes, f"^{label}$", "both") if n.y1 > H * 0.85]
        if h:
            tap(h[0])
            time.sleep(2)
            return True
        if not foreground_is_app():
            start_app()
            time.sleep(4)
            continue
        adb("shell input keyevent 4")
        time.sleep(1.5)
        if not foreground_is_app():
            start_app()
            time.sleep(4)
    raise AssertionError(f"bottom tab {label} not found")


def alive():
    return adb(f"shell pidof {PKG}").strip() != ""


def foreground_is_app():
    out = adb("shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' ")
    return PKG in out


def deeplink(uri):
    adb(f"shell am start -W -a android.intent.action.VIEW -d '{uri}' {PKG}")
    time.sleep(3)


def start_app():
    return adb(f"shell am start -W -n {ACT}")


def mark(step):
    adb(f"shell log -t MM_QA 'STEP {step}'")


def step(name, fn, attempts=3):
    errs = []
    for i in range(1, attempts + 1):
        mark(f"{name} attempt {i}")
        try:
            note = fn() or ""
            if not alive():
                raise AssertionError("app process died during step")
            f = shot(f"{name}_pass")
            dump(f"{name}_pass")
            RESULTS.append({"step": name, "status": "PASS", "attempt": i, "note": str(note), "shot": f})
            print(f"PASS {name} (attempt {i}) {note}", flush=True)
            flush()
            return True
        except Exception as e:
            msg = f"{type(e).__name__}: {e}"
            f = shot(f"{name}_fail{i}")
            dump(f"{name}_fail{i}")
            print(f"FAIL {name} attempt {i}: {msg}", flush=True)
            errs.append(msg)
            if len(errs) >= 2 and errs[-1] == errs[-2] and i == attempts:
                break
            if not alive():
                start_app()
                time.sleep(5)
    same = len(set(errs)) == 1
    RESULTS.append({"step": name, "status": "FAIL", "attempt": len(errs),
                    "note": errs[-1] + (" (same failure x%d — step stopped)" % len(errs) if same else ""),
                    "errors": errs, "shot": f})
    flush()
    return False


def flush():
    json.dump({"api": args.api, "results": RESULTS, "ctx": {k: v for k, v in ctx.items()}},
              open(f"{OUT}/results.json", "w"), indent=2, ensure_ascii=False, default=str)


def untested(name, why):
    RESULTS.append({"step": name, "status": "UNTESTED", "note": why})
    print(f"UNTESTED {name}: {why}", flush=True)


def image_region_nonblank(png, n):
    """Variance of pixels inside node bounds: a loaded photo has high variance."""
    try:
        from PIL import Image, ImageStat
        im = Image.open(png).convert("L").crop((n.x1, n.y1, n.x2, n.y2))
        return ImageStat.Stat(im).stddev[0]
    except Exception as e:
        return -1


# ---------------------------------------------------------------- setup
print(adb("wait-for-device"))
api = int(adb("shell getprop ro.build.version.sdk").strip() or 0)
adb("shell settings put global window_animation_scale 0")
adb("shell settings put global transition_animation_scale 0")
adb("shell settings put global animator_duration_scale 0")
# gesture navigation so predictive back can be exercised with an edge swipe
print(adb("shell cmd overlay enable com.android.internal.systemui.navbar.gestural"))
adb("logcat -G 16M")
adb("logcat -c")
print(adb(f"install -r -t '{args.apk}'", timeout=180))
SIZE = adb("shell wm size")
m = re.search(r"(\d+)x(\d+)", SIZE)
W, H = (int(m.group(1)), int(m.group(2))) if m else (1080, 2400)
ctx = {}

# ---------------------------------------------------------------- steps

def s_cold_start():
    adb(f"shell am force-stop {PKG}")
    out = start_app()
    t = re.search(r"TotalTime:\s*(\d+)", out)
    ctx["cold_ms"] = int(t.group(1)) if t else None
    time.sleep(4)
    nodes = dump("cold")
    perm = find(nodes, r"Allow|Don.t allow", "text")
    if perm and any("permissioncontroller" in n.pkg for n in perm):
        ctx["perm_on_launch"] = True
    if not foreground_is_app() and not perm:
        raise AssertionError("app not in foreground after launch")
    onboarding = find(nodes, r"Get started|Skip|Continue|Next", "text")
    return f"TotalTime={ctx['cold_ms']}ms onboarding_controls={[n.text for n in onboarding][:4]} perm_dialog_on_launch={bool(perm)}"


def s_home_feed():
    bottom_tab("Buy")
    time.sleep(8)
    top = dump("home_top")
    shot("home_top")
    offline = find(top, r"Offline")
    cars = None
    for i, n in enumerate(top):
        if n.text == "Cars listed" and i > 0:
            cars = top[i - 1].text
    ctx["home_cars_listed"] = cars
    ctx["home_offline_banner_while_online"] = bool(offline)
    if offline or cars in ("0", None):
        raise AssertionError(f"Home header while ONLINE: offline_banner={bool(offline)} cars_listed={cars}")
    hit, nodes = scroll_find(PRICE_MN.pattern, "desc", 10, 20)
    if not hit:
        hit2 = find(nodes, PRICE_ANY.pattern)
        raise AssertionError(f"no listing card with 'Rs X Mn' (other prices: {[n.label for n in hit2][:3]})")
    ctx["home_first_card"] = hit[0].desc
    return f"{len(hit)} cards visible, first='{hit[0].desc[:80]}'"


def s_search():
    deeplink("motormila://search")
    nodes = dump()
    edits = [n for n in nodes if "EditText" in n.cls]
    if not edits:
        raise AssertionError("no search input")
    tap(edits[0])
    adb("shell input text toyota")
    adb("shell input keyevent 66")
    time.sleep(3)
    hit, nodes = wait_for(PRICE_MN.pattern, 60, "desc")
    if not hit:
        raise AssertionError("no results for 'toyota'")
    toy = [n for n in hit if re.search("toyota", n.desc, re.I)]
    return f"{len(hit)} results visible, {len(toy)} mention Toyota"


def s_filters():
    tap_text(r"^Open filters$", 15, "desc")
    hit, nodes = wait_for(r"Show results", 15, "text")
    if not hit:
        raise AssertionError("filter sheet did not open")
    shot("filters_open")
    for lab in [r"^Petrol$", r"^Automatic$"]:
        h = find(nodes, lab, "text")
        if h:
            tap(h[0])
    tap_text(r"^Show results$", 10, "text")
    hit, _ = wait_for(PRICE_MN.pattern, 45, "desc")
    if not hit:
        hit2, _ = wait_for(r"No (results|listings|matches)|Nothing", 5)
        if hit2:
            return "filters applied; empty state shown: " + hit2[0].label
        raise AssertionError("no results/empty-state after applying filters")
    return f"filters Petrol+Automatic applied, {len(hit)} results"


def open_search_grid(q=None):
    deeplink("motormila://search" + (f"?q={q}" if q else ""))
    time.sleep(3)
    adb("shell input keyevent 111")  # ESC: close IME / suggestion dropdown
    time.sleep(1)
    nodes = dump()
    if not find(nodes, r"^Open filters$", "desc"):
        adb("shell input keyevent 4")
        time.sleep(1.5)
    hit, nodes = wait_for(PRICE_MN.pattern, 45, "desc")
    hit = [n for n in hit if n.y2 - n.y1 > 250]  # grid cards, not suggestion rows
    return hit, nodes


def s_detail():
    hit, _ = open_search_grid()
    if not hit:
        raise AssertionError("no card to open")
    card = hit[0]
    ctx["card_desc"] = card.desc
    tap(card)
    ph, nodes = wait_for(r"Photo 1 of|Photos of|Photo of", 30, "desc")
    time.sleep(4)
    png = shot("detail_loaded")
    nodes = dump("detail")
    price_mn = find(nodes, PRICE_MN.pattern)
    price_any = find(nodes, PRICE_ANY.pattern)
    if not price_any:
        raise AssertionError("no price on detail")
    img_note = "no photo node"
    if ph:
        sd = image_region_nonblank(png, ph[0])
        img_note = f"photo region stddev={sd:.1f}"
        if 0 <= sd < 6:
            raise AssertionError(f"photo region looks blank ({img_note})")
    ctx["detail_open"] = True
    return (f"price nodes: Mn={[n.label for n in price_mn][:2]} any={[n.label for n in price_any][:2]}; {img_note}; "
            f"card_says='{card.desc[:70]}'")


def s_watchlist_save():
    hit, _ = wait_for(r"^(Save to watchlist|Remove from watchlist)$", 15, "desc")
    if not hit:
        raise AssertionError("no watchlist toggle on detail")
    if hit[0].desc == "Remove from watchlist":
        tap(hit[0])
        time.sleep(1)
    tap_text(r"^Save to watchlist$", 10, "desc")
    hit, _ = wait_for(r"^Remove from watchlist$", 10, "desc")
    if not hit:
        raise AssertionError("toggle did not switch to 'Remove from watchlist'")
    return "saved"


def s_back_button():
    adb("shell input keyevent 4")
    time.sleep(2)
    nodes = dump()
    if not alive() or not foreground_is_app():
        raise AssertionError("back from detail left the app")
    if find(nodes, r"^(Save to|Remove from) watchlist$", "desc"):
        raise AssertionError("still on detail after BACK")
    return "returned from detail"


def s_watchlist_screen():
    bottom_tab("Saved")
    hit, nodes = wait_for(r"^Watched ", 20, "desc")
    if not hit:
        raise AssertionError("saved listing not in Watchlist")
    return hit[0].desc[:90]


def s_predictive_back():
    hit, _ = open_search_grid()
    if not hit:
        raise AssertionError("no card")
    tap(hit[0])
    wait_for(r"watchlist$", 20, "desc")
    # edge swipe from left (gesture nav) — predictive back
    adb(f"shell input swipe 2 {H//2} {W//2} {H//2} 350")
    time.sleep(2.5)
    nodes = dump()
    if find(nodes, r"^(Save to|Remove from) watchlist$", "desc"):
        raise AssertionError("edge-swipe back did not pop detail")
    if not foreground_is_app():
        raise AssertionError("edge-swipe back left the app")
    return "edge swipe popped detail"


def s_best_picks():
    deeplink("motormila://best-picks")
    hit, nodes = wait_for(PRICE_MN.pattern, 60, "desc")
    if not hit:
        any_ = find(nodes, PRICE_ANY.pattern)
        raise AssertionError(f"no Best Picks cards (prices seen: {[n.label for n in any_][:3]})")
    return f"{len(hit)} picks"


def s_trends():
    out = []
    for uri, nm in [("motormila://trends", "trends"), ("motormila://price-index", "price_index"),
                    ("motormila://pulse", "pulse")]:
        deeplink(uri)
        time.sleep(6)
        nodes = dump(nm)
        shot(nm)
        err = find(nodes, r"Something went wrong|Couldn.t load|Error|Retry", "both")
        txt = len([n for n in nodes if n.text.strip()])
        if nm == "pulse":
            pill = find(nodes, r"^Market signals$", "desc")
            if pill and pill[0].y2 - pill[0].y1 > 300:
                raise AssertionError(f"pulse tab pill is {pill[0].y2 - pill[0].y1}px tall — content area collapsed")
        out.append(f"{nm}:texts={txt}{' ERR=' + err[0].label[:40] if err else ''}")
        if txt < 5 or err:
            raise AssertionError("; ".join(out))
    return "; ".join(out)


def s_insights_tab():
    bottom_tab("Prices")
    time.sleep(6)
    nodes = dump("insights")
    err = find(nodes, r"Something went wrong|Couldn.t load|Retry")
    if err:
        raise AssertionError("insights error: " + err[0].label[:60])
    return f"{len([n for n in nodes if n.text.strip()])} text nodes"


def s_locations():
    deeplink("motormila://locations/Colombo")
    time.sleep(8)
    shot("district_colombo")
    nodes = dump("district")
    if not find(nodes, r"Colombo"):
        raise AssertionError("district hub for Colombo not shown")
    hit = find(nodes, r"Colombo")
    err = find(nodes, r"Something went wrong|Couldn.t load|Retry")
    if err:
        raise AssertionError("district hub error: " + err[0].label[:60])
    return f"opened '{hit[0].label[:40]}', {len(find(nodes, PRICE_MN.pattern, 'desc'))} Mn cards"


def s_login_screen():
    deeplink("motormila://login")
    hit, nodes = wait_for(r"Sign in|Log in|Email|Password", 20)
    if not hit:
        raise AssertionError("login screen not shown")
    return "login screen renders (credentials not available — sign-in itself untested)"


def s_alerts():
    deeplink("motormila://alerts")
    time.sleep(5)
    nodes = dump("alerts")
    labels = [n.label for n in nodes if n.label.strip(" |")][:25]
    ctx["alerts_labels"] = labels
    signin = find(nodes, r"Sign in|Log in")
    create = find(nodes, r"^Create alert$")
    note = f"sign-in prompt={bool(signin)} create_button={bool(create)}"
    edits = [n for n in nodes if "EditText" in n.cls]
    if create and edits:
        tap(edits[0]); adb("shell input text Toyota"); adb("shell input keyevent 111")
        mx = [n for n in dump() if "EditText" in n.cls and re.search(r"Max", n.label)]
        if mx:
            tap(mx[0]); adb("shell input text 8"); adb("shell input keyevent 111")
        tap_text(r"^Create alert$", 10, "text")
        time.sleep(5)
        after = dump("alerts_after_create")
        shot("alerts_after_create")
        perm = [n for n in after if "permissioncontroller" in n.pkg]
        msgs = [n.label[:80] for n in after if re.search(r"sign|log ?in|error|fail|created|401|unauthor", n.label, re.I)]
        note += f" | unauthenticated create -> perm_dialog={bool(perm)} msgs={msgs[:4]}"
        if perm:
            d = find(perm, r"Don.t allow", "text")
            if d:
                tap(d[0])
    return note


def s_alert_from_search_perm():
    """Search 'Create alert from these filters' is the path that triggers the notification prompt."""
    open_search_grid("honda")
    hit = find(dump(), r"^Create alert from these filters$", "desc")
    for _ in range(3):
        if hit:
            break
        chip = find(dump(), r"^Newest$", "text")
        if not chip:
            break
        y = chip[0].center()[1]
        adb(f"shell input swipe {int(W*0.85)} {y} {int(W*0.1)} {y} 300")
        time.sleep(1)
        hit = find(dump(), r"^Create alert from these filters$", "desc")
    if not hit:
        raise AssertionError("no create-alert button on search")
    tap(hit[0])
    time.sleep(4)
    nodes = dump("after_create_alert")
    perm = [n for n in nodes if "permissioncontroller" in n.pkg]
    signin = find(nodes, r"Sign in|Log in|sign in to")
    granted = adb(f"shell dumpsys package {PKG} | grep POST_NOTIFICATIONS")
    shot("perm_or_signin")
    if perm:
        deny = find(perm, r"Don.t allow", "text")
        if deny:
            tap(deny[0])
        return "system notification permission dialog shown (denied for test)"
    return f"no permission dialog; sign-in gate={bool(signin)}; perm state: {granted.strip()[:120]}"


def s_settings_theme():
    deeplink("motormila://settings")
    hit, _ = wait_for(r"^Appearance$|^Dark$", 20, "text")
    if not hit:
        raise AssertionError("settings not shown")
    shot("settings")
    tap_text(r"^Dark$", 10, "text")
    time.sleep(2)
    p_dark = shot("theme_dark")
    tap_text(r"^Light$", 10, "text")
    time.sleep(2)
    p_light = shot("theme_light")
    try:
        from PIL import Image, ImageStat
        bd = ImageStat.Stat(Image.open(p_dark).convert("L")).mean[0]
        bl = ImageStat.Stat(Image.open(p_light).convert("L")).mean[0]
    except Exception:
        bd = bl = -1
    tap_text(r"^System$", 10, "text")
    if bd >= 0 and not bd + 20 < bl:
        raise AssertionError(f"dark mode not visibly darker (mean dark={bd:.0f} light={bl:.0f})")
    return f"mean luminance dark={bd:.0f} light={bl:.0f}"


def s_lang(code_label, expect_pat, back_label=None):
    def f():
        deeplink("motormila://settings")
        time.sleep(2)
        for _ in range(4):
            nodes = dump()
            h = find(nodes, f"^{code_label}$", "text")
            if h:
                break
            adb(f"shell input swipe {W//2} {int(H*0.7)} {W//2} {int(H*0.35)} 300")
            time.sleep(1)
        if not h:
            raise AssertionError(f"language row {code_label} not found")
        tap(h[0])
        time.sleep(5)  # activity recreate
        if not alive():
            raise AssertionError("app died on language switch")
        hit, nodes = wait_for(expect_pat, 15, "text")
        if not hit:
            raise AssertionError(f"UI not localised (expected /{expect_pat}/)")
        for _ in range(3):
            adb("shell input keyevent 4"); time.sleep(1.5)
            if any(n.y1 > H * 0.85 for n in dump() if n.text.strip()):
                break
        if not foreground_is_app():
            start_app(); time.sleep(4)
        time.sleep(3)
        shot(f"home_{code_label}")
        nodes = dump(f"home_{code_label}")
        nonlatin = [n.text for n in nodes if re.search(r"[\u0D80-\u0DFF\u0B80-\u0BFF]", n.text)]
        return f"{len(nonlatin)} localised text nodes on Home, e.g. {nonlatin[:3]}"
    return f


def s_lang_reset():
    deeplink("motormila://settings")
    time.sleep(2)
    for _ in range(4):
        h = find(dump(), r"^(English|ඉංග්‍රීසි|ஆங்கிலம்)$", "text")
        if h:
            tap(h[0])
            time.sleep(5)
            break
        adb(f"shell input swipe {W//2} {int(H*0.7)} {W//2} {int(H*0.35)} 300")
    hit, _ = wait_for(r"^Language$", 15, "text")
    if not hit:
        raise AssertionError("could not switch back to English")
    return "back to English"


def s_rotation():
    deeplink("motormila://home")
    time.sleep(3)
    pid = adb(f"shell pidof {PKG}").strip()
    adb("shell settings put system accelerometer_rotation 0")
    adb("shell settings put system user_rotation 1")
    time.sleep(4)
    shot("rotated_landscape")
    nodes = dump("rotated")
    adb("shell settings put system user_rotation 0")
    time.sleep(3)
    pid2 = adb(f"shell pidof {PKG}").strip()
    if pid != pid2:
        raise AssertionError(f"process restarted on rotation ({pid}->{pid2})")
    if not foreground_is_app():
        raise AssertionError("app not foreground after rotation")
    return f"survived rotation (manifest locks portrait); nodes={len(nodes)}"


def s_offline():
    adb("shell cmd connectivity airplane-mode enable")
    adb("shell svc wifi disable")
    adb("shell svc data disable")
    time.sleep(3)
    adb(f"shell am force-stop {PKG}")
    start_app()
    time.sleep(8)
    shot("offline_home")
    nodes = dump("offline_home")
    if not alive():
        raise AssertionError("app crashed when started offline")
    cards = find(nodes, PRICE_MN.pattern, "desc")
    offline_msg = find(nodes, r"offline|no internet|connection|cached|Retry", "both")
    deeplink("motormila://search?q=toyota")
    time.sleep(6)
    shot("offline_search")
    n2 = dump("offline_search")
    if not alive():
        raise AssertionError("app crashed on search offline")
    note = f"offline: home cards={len(cards)} offline_msg={[n.label[:40] for n in offline_msg][:2]} search_cards={len(find(n2, PRICE_MN.pattern, 'desc'))}"
    adb("shell cmd connectivity airplane-mode disable")
    adb("shell svc wifi enable")
    adb("shell svc data enable")
    time.sleep(8)
    bottom_tab("Buy")
    r = find(dump(), r"^Retry$|Tap to retry", "both")
    if r:
        tap(r[0]); time.sleep(6)
    still_off = bool(find(dump("online_again"), r"Offline"))
    hit, _ = scroll_find(PRICE_MN.pattern, "desc", 8, 30)
    note += f" ; offline banner after reconnect+retry={still_off}"
    if still_off:
        raise AssertionError(note + " ; still flagged offline after reconnect")
    if not hit and not cards:
        raise AssertionError(note + " ; did not recover after reconnect")
    return note + f" ; recovered online cards={len(hit)}"


def s_logcat():
    log = adb("logcat -d -v threadtime", timeout=120)
    crash = adb("logcat -d -b crash -v threadtime", timeout=60)
    open(f"{OUT}/logcat.txt", "w").write(log)
    open(f"{OUT}/logcat_crash.txt", "w").write(crash)
    anr = adb("shell ls /data/anr 2>/dev/null")
    fatal = [l for l in (log + crash).splitlines() if re.search(r"FATAL EXCEPTION|ANR in " + re.escape(PKG) + r"|Process: " + re.escape(PKG), l)]
    strict = [l for l in log.splitlines() if PKG in l and re.search(r"\bE AndroidRuntime\b", l)]
    open(f"{OUT}/logcat_findings.txt", "w").write("\n".join(fatal + strict))
    if fatal:
        raise AssertionError(f"{len(fatal)} FATAL/ANR lines: {fatal[:3]}")
    return f"no FATAL/ANR for {PKG}; /data/anr: {anr.strip()[:80]}"


plan = [
    ("01_cold_start", s_cold_start),
    ("02_home_feed_real_listings", s_home_feed),
    ("03_search_toyota", s_search),
    ("04_search_filters", s_filters),
    ("05_listing_detail", s_detail),
    ("06_save_to_watchlist", s_watchlist_save),
    ("07_back_button", s_back_button),
    ("08_watchlist_screen", s_watchlist_screen),
    ("09_predictive_back_gesture", s_predictive_back),
    ("10_best_picks", s_best_picks),
    ("11_trends_priceindex_pulse", s_trends),
    ("12_insights_tab", s_insights_tab),
    ("13_locations_district", s_locations),
    ("14_login_screen", s_login_screen),
    ("15_alerts_screen", s_alerts),
    ("16_alert_from_search_notification_prompt", s_alert_from_search_perm),
    ("17_settings_dark_mode", s_settings_theme),
    ("18_language_sinhala", s_lang("සිංහල", r"භාෂාව|සැකසුම්")),
    ("19_language_tamil", s_lang("தமிழ்", r"மொழி")),
    ("20_language_back_to_english", s_lang_reset),
    ("21_rotation", s_rotation),
    ("22_offline_airplane", s_offline),
]

for name, fn in plan:
    try:
        step(name, fn)
    except Exception:
        traceback.print_exc()

if os.environ.get("QA_LOGIN_EMAIL"):
    untested("sign_in_flow", "credentials present but scripted sign-in not implemented")
else:
    untested("sign_in_flow", "no MotorMila test login secret available; accounts must not be created")
    untested("alert_create_edit_delete", "server-side alerts require a signed-in account")

step("99_logcat_scan", s_logcat, attempts=1)

summary = {"api": api, "results": RESULTS, "ctx": {k: v for k, v in ctx.items() if k != "alerts_labels"},
           "alerts_labels": ctx.get("alerts_labels")}
json.dump(summary, open(f"{OUT}/results.json", "w"), indent=2, ensure_ascii=False)
with open(f"{OUT}/results.md", "w") as f:
    f.write(f"# MotorMila Android smoke — API {api}\n\n|step|status|note|\n|-|-|-|\n")
    for r in RESULTS:
        f.write(f"|{r['step']}|{r['status']}|{str(r.get('note','')).replace('|','/')[:300]}|\n")
print(open(f"{OUT}/results.md").read())
fails = [r for r in RESULTS if r["status"] == "FAIL"]
sys.exit(1 if fails else 0)
