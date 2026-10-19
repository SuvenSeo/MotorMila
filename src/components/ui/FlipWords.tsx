import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type FlipWordsProps = {
  /** Words to rotate through, e.g. ["decoded.", "priced.", "tracked."] */
  words: string[];
  /** Time each word stays visible (ms). */
  duration?: number;
  className?: string;
};

/**
 * Aceternity-style Flip Words (#8 UI review).
 * Rotates through words with a vertical flip. Zero new dependencies —
 * uses the existing framer-motion. Renders the first word statically when
 * the user prefers reduced motion.
 */
export function FlipWords({ words, duration = 2600, className }: FlipWordsProps) {
  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion || words.length < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % words.length), duration);
    return () => window.clearInterval(id);
  }, [reducedMotion, words.length, duration]);

  if (reducedMotion || words.length === 0) {
    return <span className={className}>{words[0] ?? ""}</span>;
  }

  return (
    <span className={cn("relative inline-flex overflow-hidden align-bottom", className)} aria-live="off">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={words[index]}
          initial={{ y: "110%", opacity: 0, rotateX: -70 }}
          animate={{ y: "0%", opacity: 1, rotateX: 0 }}
          exit={{ y: "-110%", opacity: 0, rotateX: 70 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className="inline-block origin-bottom will-change-transform"
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
      {/* Screen readers hear the full list once instead of chattering on rotation. */}
      <span className="sr-only">{words.join(" ")}</span>
    </span>
  );
}
