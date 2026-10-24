import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { scrollBehavior } from "@/lib/motion";

const HASH_RETRY_MS = 50;
const HASH_RETRY_LIMIT = 24;

function scrollToHashTarget(targetId: string) {
  const element = document.getElementById(targetId);
  if (!element) return false;

  element.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  return true;
}

/** Reset scroll on route changes; preserve hash-anchor jumps on the homepage. */
export function ScrollRestoration() {
  const { pathname, hash } = useLocation();

  // Layout effect: the reset lands before the new route paints, so the
  // incoming page never shows at the old scroll offset (that left the footer
  // on screen until content arrived and pushed it down: CLS on card → listing).
  useLayoutEffect(() => {
    if (hash) {
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

    // "instant", not "auto": html has `scroll-behavior: smooth`, which turns
    // "auto" into a 300ms smooth scroll. With View Transitions this runs
    // before the new snapshot, so the incoming page is already at the top.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash]);

  return null;
}
