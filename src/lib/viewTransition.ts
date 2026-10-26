/**
 * Route transitions via the View Transitions API (web/premium-p0).
 *
 * The router runs on a history object whose listener is wrapped in
 * `document.startViewTransition`: the browser snapshots the old page, React
 * commits the new route (flushSync + a short wait for lazy chunks), and the
 * two cross-fade with OVERLAP (old fades 180ms while new rises 260ms) — no
 * sequential "old leaves, then new enters". The nav and bottom bar carry their
 * own view-transition-name so they stay perfectly still.
 *
 * Back/forward (POP) is a plain instant swap with the scroll position put back
 * (components/ScrollRestoration + lib/scrollMemory), except listing → list:
 * there the detail hero morphs back into the card it came from (the reverse of
 * listingMotion's card → detail morph; a plain fade with reduced motion).
 *
 * Skipped (plain instant swap) for: query-only changes (filters), reduced motion,
 * low-data mode, browsers without the API (RouteTransition's framer fade is
 * the fallback there), and while the card→detail hero morph
 * (components/listing/listingMotion.ts) already owns the transition.
 */
import { createBrowserHistory, type BrowserHistory } from "@remix-run/router";

type Listener = Parameters<BrowserHistory["listen"]>[0];
import { flushSync } from "react-dom";
import { rootProjectionNode } from "motion/react";
import {
  beginScrollRestore,
  markRestorePending,
  markScrollAnchorFromEvent,
  readScroll,
  saveScroll,
  waitForScrollRestore,
} from "@/lib/scrollMemory";

type ViewTransitionLike = { finished: Promise<void>; skipTransition?: () => void };
type DocWithVT = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => ViewTransitionLike;
};

export const ROUTE_VT_ATTR = "data-route-vt";
const LISTING_VT_ATTR = "data-listing-vt";
/** Longest we hold the old snapshot while a lazy route chunk resolves. */
const COMMIT_WAIT_MS = 320;

export function supportsViewTransitions(): boolean {
  return typeof document !== "undefined" && typeof (document as DocWithVT).startViewTransition === "function";
}

function motionAllowed(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  return !document.documentElement.classList.contains("low-data");
}

/** True while any View Transition (route or listing hero) is swapping the page. */
export function viewTransitionInFlight(): boolean {
  if (typeof document === "undefined") return false;
  const html = document.documentElement;
  return html.hasAttribute(ROUTE_VT_ATTR) || html.hasAttribute(LISTING_VT_ATTR);
}

let resolveCommit: (() => void) | null = null;

/** Called by RouteTransition once the new route has committed. */
export function signalRouteCommitted(): void {
  const r = resolveCommit;
  resolveCommit = null;
  r?.();
}

function waitForRouteCommit(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      resolveCommit = null;
      resolve();
    }, ms);
    resolveCommit = () => {
      window.clearTimeout(timer);
      // One more task so effects (scroll-to-top, focus) have run before the
      // browser takes the "new" snapshot.
      window.setTimeout(resolve, 0);
    };
  });
}

/** Browser history whose route swaps animate through a View Transition. */
export function createViewTransitionHistory(): BrowserHistory {
  const history = createBrowserHistory({ v5Compat: true });
  const listen = history.listen.bind(history);
  let lastPath = typeof window !== "undefined" ? window.location.pathname : "/";

  // The app restores scroll itself (per entry, after the list has rendered);
  // the browser's own restore fires before React commits and lands short.
  if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }
  let lastKey = history.location.key;
  if (typeof window !== "undefined") {
    // A reload or a trip off-site keeps this entry's spot too.
    window.addEventListener("pagehide", () => saveScroll(lastKey));
    // The card or listing link a tap/click lands on is the spot Back returns
    // to (capture: runs before the link navigates).
    window.addEventListener("click", (e) => markScrollAnchorFromEvent(e.target), true);
  }

  history.listen = (listener: Listener) =>
    listen((update) => {
      const prevPath = lastPath;
      const nextPath = update.location.pathname;
      const pathChanged = nextPath !== lastPath;
      lastPath = nextPath;
      // Remember where the page being left was scrolled to (still on screen:
      // nothing has committed yet).
      saveScroll(lastKey);
      lastKey = update.location.key;
      const html = document.documentElement;
      if (update.action === "POP") {
        // Before the returning page renders: its deferred sections mount at
        // once so the saved spot exists on the first restore attempt.
        markRestorePending(pathChanged ? readScroll(update.location.key) : undefined);
        const fromListing = /^\/listing\/([^/]+)\/?$/.exec(prevPath);
        if (
          !pathChanged ||
          !fromListing ||
          !supportsViewTransitions() ||
          uaTransitionPending() ||
          html.hasAttribute(LISTING_VT_ATTR) ||
          html.classList.contains("low-data") ||
          !runListingBackTransition(() => listener(update), decodeURIComponent(fromListing[1]))
        ) {
          listener(update);
        }
        return;
      }
      if (
        !pathChanged ||
        !supportsViewTransitions() ||
        !motionAllowed() ||
        html.hasAttribute(LISTING_VT_ATTR)
      ) {
        listener(update);
        return;
      }
      html.setAttribute(ROUTE_VT_ATTR, "");
      try {
        const vt = (document as DocWithVT).startViewTransition!(async () => {
          flushSync(() => listener(update));
          await waitForRouteCommit(COMMIT_WAIT_MS);
        });
        const done = () => html.removeAttribute(ROUTE_VT_ATTR);
        vt.finished.then(done, done);
      } catch {
        html.removeAttribute(ROUTE_VT_ATTR);
        listener(update);
      }
    });

  return history;
}

/* ── Listing → list: the reverse hero morph ────────────────────────────── */

const HERO_VT_NAME = "listing-hero";
/**
 * Longest the old snapshot is held while the list re-renders. Longer than a
 * forward swap: snapshotting before the list commits would animate the detail
 * page into itself and then jump. The list renders from cache (no fetch), so
 * this is render time only (~170ms desktop, ~500ms on a 4x-throttled phone).
 */
const BACK_COMMIT_WAIT_MS = 900;
/** Longest the old snapshot is held while the list scrolls back into place. */
const RESTORE_WAIT_MS = 260;

// Safari / Chrome flag a popstate whose visual transition the browser already
// played (iOS edge swipe-back, Android predictive back): animating again on
// top of it would double up, so those restore instantly.
let uaVisualTransition = false;
if (typeof window !== "undefined") {
  window.addEventListener(
    "popstate",
    (e) => {
      uaVisualTransition = (e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition === true;
    },
    true,
  );
}
function uaTransitionPending(): boolean {
  const v = uaVisualTransition;
  uaVisualTransition = false;
  return v;
}

function inViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
}

/** The photo showing in a carousel region (skips aria-hidden slides). */
function shownImage(root: Element | null, selector: string): HTMLImageElement | null {
  if (!root) return null;
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>(selector));
  return imgs.find((img) => !img.closest('[aria-hidden="true"]') && img.complete && img.naturalWidth > 0) ?? null;
}

/** The detail page's hero photo as it is on screen now (or the card photo under it). */
function detailHeroImage(): HTMLImageElement | null {
  const gallery = document.querySelector("[data-listing-gallery]");
  if (!gallery || !inViewport(gallery)) return null;
  return (
    shownImage(gallery, "[aria-roledescription='carousel'] img") ??
    shownImage(gallery, "img[data-listing-hero-ph]")
  );
}

/** The originating card's visible photo, once the list is back in place. */
function cardImage(listingId: string): HTMLImageElement | null {
  const sel = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(listingId) : listingId;
  const card = document.querySelector(`[data-scroll-anchor="${sel}"]`);
  if (!card || !inViewport(card)) return null;
  return shownImage(card, "img[data-card-photo]");
}

/** Longest the morph waits for the list's mount effects to run out. */
const QUIET_WAIT_MS = 220;

/**
 * Resolves once the main thread has been free for two 16ms ticks in a row (or
 * after `ms`). The returning list's mount effects (lazy card parts, media
 * queries, prefetches) otherwise land inside the morph: Chrome animates the
 * hero group's size on the main thread, so they showed up as dropped frames.
 * Rendering is paused while this callback runs, so waiting here costs no frames.
 */
function waitForQuiet(ms: number): Promise<void> {
  const start = performance.now();
  return new Promise((resolve) => {
    let quiet = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      quiet = now - last < 24 ? quiet + 1 : 0;
      last = now;
      if (quiet >= 2 || now - start > ms) return resolve();
      window.setTimeout(tick, 16);
    };
    window.setTimeout(tick, 16);
  });
}

/** Longest the morph waits for the card photo (from cache) to be decoded. */
const CARD_WAIT_MS = 240;

// setTimeout polling: rAF is paused inside a View Transition update callback.
function waitForCardImage(listingId: string, ms: number): Promise<HTMLImageElement | null> {
  const start = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      const img = cardImage(listingId);
      if (img || performance.now() - start > ms) return resolve(img);
      window.setTimeout(tick, 16);
    };
    tick();
  });
}

/**
 * Back from /listing/:id: the hero photo flies back into its card with the
 * opening morph's duration and easing (listing-motion.css), while the rest of
 * the page cross-fades. Reduced motion: the cross-fade only. The list is put
 * back at its saved scroll position inside the update callback, so the new
 * snapshot (and the card's rect) is the restored one.
 */
function runListingBackTransition(commit: () => void, listingId: string): boolean {
  const html = document.documentElement;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  const hero = reduced ? null : detailHeroImage();
  let card: HTMLImageElement | null = null;
  let stage: Element | null = null;
  let projectionRoot: { blockUpdate: () => void; unblockUpdate: () => void } | null = null;
  html.setAttribute(LISTING_VT_ATTR, reduced ? "calm" : "pending");
  hero?.style.setProperty("view-transition-name", HERO_VT_NAME);
  try {
    const vt = (document as DocWithVT).startViewTransition!(async () => {
      hero?.style.removeProperty("view-transition-name");
      // ScrollRestoration settles this (restored, or nothing to restore).
      beginScrollRestore();
      // As on the way in (listingMotion): hold Motion's layout projection while
      // the pages swap, or every layout node measures scroll inside the commit.
      projectionRoot = rootProjectionNode.current ?? null;
      projectionRoot?.blockUpdate();
      flushSync(commit);
      await waitForRouteCommit(BACK_COMMIT_WAIT_MS);
      await waitForScrollRestore(RESTORE_WAIT_MS);
      await waitForQuiet(QUIET_WAIT_MS);
      card = hero ? await waitForCardImage(listingId, CARD_WAIT_MS) : null;
      if (card) {
        card.style.setProperty("view-transition-name", HERO_VT_NAME);
        stage = card.closest(".route-stage");
        stage?.setAttribute("data-vt-hero-stage", "");
        html.setAttribute(LISTING_VT_ATTR, "hero");
      } else if (!reduced) {
        html.setAttribute(LISTING_VT_ATTR, "fade");
      }
    });
    const cleanup = () => {
      projectionRoot?.unblockUpdate();
      projectionRoot = null;
      html.removeAttribute(LISTING_VT_ATTR);
      stage?.removeAttribute("data-vt-hero-stage");
      hero?.style.removeProperty("view-transition-name");
      (card as HTMLImageElement | null)?.style.removeProperty("view-transition-name");
    };
    vt.finished.then(cleanup, cleanup);
    return true;
  } catch {
    html.removeAttribute(LISTING_VT_ATTR);
    hero?.style.removeProperty("view-transition-name");
    return false;
  }
}
