import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { scrollBehavior } from "@/lib/motion";
import { readScroll, restoreScroll, signalScrollRestored } from "@/lib/scrollMemory";

const HASH_RETRY_MS = 50;
const HASH_RETRY_LIMIT = 24;

function scrollToHashTarget(targetId: string) {
  const element = document.getElementById(targetId);
  if (!element) return false;

  element.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  return true;
}

/**
 * Scroll on route changes:
 * - back/forward (POP): put the page back exactly where it was (scrollMemory:
 *   the card in view and its viewport offset, else scrollY), before paint;
 * - a new navigation to another path: top of the page;
 * - hash links: jump to the target;
 * - query-only changes (filters, sort, page) leave scroll alone.
 * The positions are recorded by the router history (lib/viewTransition.ts)
 * as each navigation leaves a page.
 */
export function ScrollRestoration() {
  const { pathname, hash, key } = useLocation();
  const navType = useNavigationType();
  const lastPath = useRef<string | null>(null);

  // Layout effect: the reset/restore lands before the new route paints, so the
  // incoming page never shows at the wrong offset.
  useLayoutEffect(() => {
    const prevPath = lastPath.current;
    lastPath.current = pathname;

    if (hash) {
      signalScrollRestored();
      const targetId = hash.replace("#", "");
      if (!targetId) return;

      if (scrollToHashTarget(targetId)) return;

      let attempts = 0;
      const retry = window.setInterval(() => {
        attempts += 1;
        if (scrollToHashTarget(targetId) || attempts >= HASH_RETRY_LIMIT) {
          window.clearInterval(retry);
        }
      }, HASH_RETRY_MS);

      return () => window.clearInterval(retry);
    }

    if (navType === "POP") {
      const saved = readScroll(key);
      if (saved) return restoreScroll(saved);
    }

    signalScrollRestored();
    if (prevPath === pathname) return;
    // "instant", not "auto": html has `scroll-behavior: smooth`, which turns
    // "auto" into a 300ms smooth scroll. With View Transitions this runs
    // before the new snapshot, so the incoming page is already at the top.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one pass per history entry
  }, [key, pathname, hash]);

  return null;
}
