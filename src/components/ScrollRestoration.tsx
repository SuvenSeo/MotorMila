import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { duration, scrollBehavior, usePrefersReducedMotionOrLowData } from "@/lib/motion";
import { routeTransitionOwnsScroll } from "@/components/RouteTransition";

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
  const navType = useNavigationType();
  const calm = usePrefersReducedMotionOrLowData();

  useEffect(() => {
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

    // Animated route changes scroll to top once the old page has faded out
    // (RouteTransition onExitComplete). The timer is the fallback for routes
    // outside the animated shell (sign-in, admin) or a shell remount.
    if (routeTransitionOwnsScroll(navType, calm)) {
      const id = window.setTimeout(
        () => window.scrollTo({ top: 0, left: 0, behavior: "auto" }),
        Math.round(duration.fast * 1000) + 40,
      );
      return () => window.clearTimeout(id);
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, hash]);

  return null;
}
