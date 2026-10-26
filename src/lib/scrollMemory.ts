/**
 * Per-history-entry scroll memory (web/smooth-everything).
 *
 * Every navigation records where the page it leaves was scrolled to, keyed by
 * that entry's `location.key`: the raw scrollY plus an "anchor" — the listing
 * card (any element carrying `data-scroll-anchor`) the visitor was looking at
 * and its offset from the top of the viewport. Back/forward (POP) restores it
 * before the returning page paints (ScrollRestoration's layout effect).
 *
 * The anchor wins over scrollY: cards are `content-visibility: auto`, so a
 * freshly mounted grid can lay out a few px taller or shorter than the one the
 * visitor left; scrolling the same card back to the same viewport offset is
 * what "exactly where I was" means. Entries persist in sessionStorage so a
 * reload (or a trip off-site and back) still lands in place.
 */

export type ScrollAnchor = { id: string; top: number };
export type ScrollEntry = { y: number; anchor?: ScrollAnchor };

const STORAGE_KEY = "mm:scroll:v1";
const MAX_ENTRIES = 60;
/** Set on <html> while a restore runs (until the anchor has stopped moving). */
export const RESTORE_ATTR = "data-scroll-restore";
/** Re-checks of the anchor after landing: off-screen cards (content-visibility)
 *  that come into range take their real height on the next frames. */
const SETTLE_PASSES = 4;

let store: Map<string, ScrollEntry> | null = null;
let preferredAnchor: string | null = null;

function load(): Map<string, ScrollEntry> {
  if (store) return store;
  store = new Map();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) for (const [k, v] of JSON.parse(raw) as [string, ScrollEntry][]) store.set(k, v);
  } catch {
    /* private mode / corrupt entry: start empty */
  }
  return store;
}

function persist(): void {
  if (!store) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(store.entries())));
  } catch {
    /* quota / private mode: memory copy still works for this tab */
  }
}

/** The card that was just tapped: preferred as the anchor when it is on screen. */
export function markScrollAnchor(id: string | number | null | undefined): void {
  preferredAnchor = id == null ? null : String(id);
}

function navOffset(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-offset"));
  return Number.isFinite(v) ? v : 64;
}

function anchorEl(id: string): HTMLElement | null {
  const sel = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
  return document.querySelector<HTMLElement>(`[data-scroll-anchor="${sel}"]`);
}

/** The anchor the visitor is looking at: the tapped card, else the first card in view. */
export function findAnchor(): ScrollAnchor | undefined {
  if (typeof document === "undefined") return undefined;
  const vh = window.innerHeight;
  const top = navOffset();
  const inView = (r: DOMRect) => r.bottom > top && r.top < vh;
  if (preferredAnchor) {
    const el = anchorEl(preferredAnchor);
    const r = el?.getBoundingClientRect();
    if (el && r && inView(r)) return { id: preferredAnchor, top: r.top };
  }
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-scroll-anchor]"))) {
    const r = el.getBoundingClientRect();
    if (inView(r)) return { id: el.dataset.scrollAnchor ?? "", top: r.top };
  }
  return undefined;
}

export function captureScroll(): ScrollEntry {
  const anchor = findAnchor();
  return anchor ? { y: window.scrollY, anchor } : { y: window.scrollY };
}

export function saveScroll(key: string, entry: ScrollEntry = captureScroll()): void {
  const s = load();
  s.delete(key);
  s.set(key, entry);
  while (s.size > MAX_ENTRIES) s.delete(s.keys().next().value as string);
  preferredAnchor = null;
  persist();
}

export function readScroll(key: string): ScrollEntry | undefined {
  return load().get(key);
}

/** Test hook. */
export function resetScrollMemory(): void {
  store = new Map();
  preferredAnchor = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * One restore attempt. Scrolls toward the saved spot and returns true once it
 * is exact: the anchor card (when one was saved) is back at its old viewport
 * offset, or scrollY matches when there was no anchor. False means "not yet":
 * the anchor hasn't rendered or the page is still too short to scroll that far.
 */
export function applyScroll(entry: ScrollEntry, settle = false): boolean {
  const doc = document.documentElement;
  const max = Math.max(0, doc.scrollHeight - window.innerHeight);
  let target = entry.y;
  let anchored = !entry.anchor;
  if (entry.anchor) {
    const el = anchorEl(entry.anchor.id);
    if (el) {
      target = window.scrollY + el.getBoundingClientRect().top - entry.anchor.top;
      anchored = true;
    }
  }
  target = Math.max(0, Math.round(target));
  const reachable = target <= max + 1;
  const y = Math.min(target, max);
  if (Math.abs(window.scrollY - y) > 0.5) window.scrollTo({ top: y, left: 0, behavior: "instant" as ScrollBehavior });
  // Without its anchor the saved scrollY is accepted only at the end (settle).
  return reachable && (anchored || settle);
}

/** Marks cards rendered in full while a restore measures (motion.css). */
export const RENDER_ATTR = "data-cv-render";

/**
 * Cards are `content-visibility: auto` with a 440px estimate. Right after the
 * jump, the ones just above the viewport come into the browser's render range
 * and take their real height a frame later, nudging the anchor down by the
 * difference (scroll anchoring doesn't always catch it, e.g. under a View
 * Transition). Rendering the cards around the viewport up front makes the
 * first measurement final. Returns true when it marked anything new.
 */
function renderAroundViewport(): boolean {
  const vh = window.innerHeight;
  let marked = false;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-scroll-anchor]"))) {
    if (el.hasAttribute(RENDER_ATTR)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom > -vh && r.top < vh * 1.5) {
      el.setAttribute(RENDER_ATTR, "");
      marked = true;
    }
  }
  return marked;
}

function releaseRendered(): void {
  document.querySelectorAll(`[${RENDER_ATTR}]`).forEach((el) => el.removeAttribute(RENDER_ATTR));
}

/* ── Restore completion: lets the back View Transition wait for it ───────── */

let restoring = false;
let waiters: (() => void)[] = [];

export function beginScrollRestore(): void {
  restoring = true;
}

export function signalScrollRestored(): void {
  restoring = false;
  const w = waiters;
  waiters = [];
  w.forEach((fn) => fn());
}

/** Resolves once the current restore has landed (or after `ms`). */
export function waitForScrollRestore(ms: number): Promise<void> {
  if (!restoring) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    waiters.push(() => {
      window.clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Restore with retries. The first attempt runs synchronously (call it from a
 * layout effect so the page never paints at the wrong offset); if the list is
 * still rendering, retries run on a 16ms timer (not rAF: rendering, and rAF
 * with it, is paused while a View Transition's update callback runs) for up to
 * `maxMs`. Any wheel / touch / key input from the visitor ends it.
 * Returns a cancel function.
 */
export function restoreScroll(entry: ScrollEntry, maxMs = 1600): () => void {
  const html = document.documentElement;
  html.setAttribute(RESTORE_ATTR, "");
  beginScrollRestore();
  const start = performance.now();
  let timer = 0;
  let done = false;
  const stopEvents = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
  let landed = false;
  const stop = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    stopEvents.forEach((e) => window.removeEventListener(e, stop, true));
    if (!landed) signalScrollRestored();
    html.removeAttribute(RESTORE_ATTR);
    // Two frames: by then the marked cards are in the render range anyway and
    // content-visibility remembers their real size.
    window.requestAnimationFrame(() => window.requestAnimationFrame(releaseRendered));
  };
  stopEvents.forEach((e) => window.addEventListener(e, stop, { capture: true, passive: true }));
  // After landing, keep the anchor pinned for a few frames: cards entering the
  // content-visibility range swap their 440px estimate for their real height
  // (this covers Safari).
  // Browsers with scroll anchoring (Chromium, Firefox) hold the view still on
  // their own, so the extra forced layouts only run where it is missing.
  const needsSettle = typeof CSS === "undefined" || !CSS.supports?.("overflow-anchor", "auto");
  let passes = 0;
  const settle = () => {
    if (done) return;
    applyScroll(entry, true);
    if (++passes >= SETTLE_PASSES) stop();
    else window.requestAnimationFrame(settle);
  };
  const attempt = () => {
    if (done) return;
    const late = performance.now() - start >= maxMs;
    if (applyScroll(entry, late) || late) {
      // Real heights around the landing spot, then one exact re-measure (a
      // second round if that move brought new cards into range).
      for (let i = 0; i < 2 && renderAroundViewport(); i++) applyScroll(entry, true);
      landed = true;
      signalScrollRestored();
      if (needsSettle) window.requestAnimationFrame(settle);
      else stop();
    } else timer = window.setTimeout(attempt, 16);
  };
  attempt();
  return stop;
}
