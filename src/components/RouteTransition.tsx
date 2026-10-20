import { AnimatePresence, m } from "motion/react";
import { useLocation, useNavigationType, useOutlet } from "react-router-dom";
import { page as pageVariants, usePrefersReducedMotionOrLowData } from "@/lib/motion";

/**
 * True when RouteTransition will animate this navigation and therefore owns
 * the scroll-to-top (done once the old page has faded out, so the old page
 * never visibly jumps). Back/forward (POP) skips the animation entirely: it
 * is instant, like native history, and avoids jank on restore.
 */
export function routeTransitionOwnsScroll(navType: string, calm: boolean): boolean {
  return navType !== "POP" && !calm;
}

/** Route change: old page fades out fast, new page cross-fades in with an 8px rise. */
export function RouteTransition() {
  const location = useLocation();
  const navType = useNavigationType();
  const outlet = useOutlet();
  const calm = usePrefersReducedMotionOrLowData();
  const animate = routeTransitionOwnsScroll(navType, calm);

  return (
    <AnimatePresence
      mode="wait"
      initial={false}
      onExitComplete={() => {
        if (animate && !location.hash) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }}
    >
      <m.div
        key={location.pathname}
        className="route-stage"
        variants={pageVariants}
        initial={animate ? "hidden" : false}
        animate="show"
        exit={animate ? "exit" : undefined}
      >
        {outlet}
      </m.div>
    </AnimatePresence>
  );
}
