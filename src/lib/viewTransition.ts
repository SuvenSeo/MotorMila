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
 * Skipped (plain instant swap) for: back/forward (POP — native-feeling, keeps
 * scroll restore honest), query-only changes (filters), reduced motion,
 * low-data mode, browsers without the API (RouteTransition's framer fade is
 * the fallback there), and while the card→detail hero morph
 * (components/listing/listingMotion.ts) already owns the transition.
 */
import { createBrowserHistory, type BrowserHistory } from "@remix-run/router";

type Listener = Parameters<BrowserHistory["listen"]>[0];
import { flushSync } from "react-dom";

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

  history.listen = (listener: Listener) =>
    listen((update) => {
      const nextPath = update.location.pathname;
      const pathChanged = nextPath !== lastPath;
      lastPath = nextPath;
      const html = document.documentElement;
      if (
        update.action === "POP" ||
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
