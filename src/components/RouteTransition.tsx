import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocation, useOutlet } from "react-router-dom";
import { pageEnter, pageExit, pageInitial } from "@/lib/motion";

/** Cross-fades the current route with a 12px rise. Honors reduced motion. */
export function RouteTransition() {
  const location = useLocation();
  const outlet = useOutlet();
  const reduced = useReducedMotion();

  return (
    <AnimatePresence mode="sync" initial={false}>
      <motion.div
        key={location.pathname}
        className="route-stage"
        initial={reduced ? false : pageInitial}
        animate={pageEnter}
        exit={reduced ? undefined : pageExit}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}
