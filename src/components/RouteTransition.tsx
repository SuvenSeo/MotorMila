import { AnimatePresence, m } from "motion/react";
import { useLocation, useNavigationType, useOutlet } from "react-router-dom";
import type { Variants } from "motion/react";
import { page as pageVariants, usePrefersReducedMotionOrLowData } from "@/lib/motion";

/** Set on <html> by the card→detail View Transition while it swaps routes. */
function viewTransitionInFlight(): boolean {
  return typeof document !== "undefined" && document.documentElement.hasAttribute("data-listing-vt");
}

const INSTANT = { duration: 0 } as const;
/** Page variants keyed on AnimatePresence `custom` (= animate this swap?), so an
 * already-exiting page also skips its fade when a View Transition takes over. */
const routeVariants: Variants = {
  hidden: pageVariants.hidden,
  show: (anim: boolean = true) => (anim ? pageVariants.show : { opacity: 1, y: 0, transition: INSTANT }),
  exit: (anim: boolean = true) => (anim ? pageVariants.exit : { opacity: 1, transition: INSTANT }),
} as Variants;

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
  const animateSwap = animate && !viewTransitionInFlight();

  return (
    <AnimatePresence
      mode="wait"
      initial={false}
      custom={animateSwap}
      onExitComplete={() => {
        if (animate && !location.hash) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }}
    >
      <m.div
        key={location.pathname}
        className="route-stage"
        variants={routeVariants}
        custom={animateSwap}
        initial={animateSwap ? "hidden" : false}
        animate="show"
        exit={animate ? "exit" : undefined}
      >
        {outlet}
      </m.div>
    </AnimatePresence>
  );
}
