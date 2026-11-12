import { m } from "motion/react";
import { useEffect, useRef } from "react";
import { useLocation, useNavigationType, useOutlet } from "react-router-dom";
import { page as pageVariants, usePrefersReducedMotionOrLowData } from "@/lib/motion";
import { signalRouteCommitted, supportsViewTransitions, viewTransitionInFlight } from "@/lib/viewTransition";

/**
 * True when this navigation animates. Back/forward (POP) is instant, like
 * native history. Kept for ScrollRestoration and tests.
 */
export function routeTransitionOwnsScroll(navType: string, calm: boolean): boolean {
  return navType !== "POP" && !calm;
}

/**
 * Route stage. Browsers with the View Transitions API animate the swap there
 * (src/lib/viewTransition.ts: overlapping cross-fade, nav held still), so the
 * stage renders at rest. Elsewhere the new page fades + rises in on its own
 * (no exit wait: the old page is gone the moment the new one commits).
 */
export function RouteTransition() {
  const location = useLocation();
  const navType = useNavigationType();
  const outlet = useOutlet();
  const calm = usePrefersReducedMotionOrLowData();
  const first = useRef(true);
  const fallbackFade =
    !first.current && routeTransitionOwnsScroll(navType, calm) && !supportsViewTransitions() && !viewTransitionInFlight();

  useEffect(() => {
    first.current = false;
    signalRouteCommitted();
  }, [location.key]);

  return (
    <m.div
      key={location.pathname}
      className="route-stage"
      variants={pageVariants}
      initial={fallbackFade ? "hidden" : false}
      animate="show"
    >
      {outlet}
    </m.div>
  );
}
