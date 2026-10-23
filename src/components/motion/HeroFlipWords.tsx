import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m, useInView } from "motion/react";
import { duration, ease, useReducedMotionOrLowData } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface HeroFlipWordsProps {
  /** First word is the resting/static word (shown alone under reduced motion / low data). */
  words: string[];
  /** Milliseconds each word stays on screen. */
  interval?: number;
  /** Where shorter words sit inside the reserved (widest-word) box. */
  align?: "start" | "center";
  className?: string;
}

/** True while the document tab is visible. */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

const letterStagger = 0.028;

/**
 * Rotating accent word for the home hero. Every word is laid into the same
 * grid cell (invisible sizers), so the box is always as wide as the widest
 * word and the surrounding headline never reflows. Letters blur + rise in;
 * the outgoing word lifts and blurs out. Pauses when the tab is hidden or the
 * hero is off screen. Reduced motion / low-data: the first word, static.
 */
export function HeroFlipWords({ words, interval = 2800, align = "start", className }: HeroFlipWordsProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const still = useReducedMotionOrLowData();
  const pageVisible = usePageVisible();
  const inView = useInView(ref, { amount: 0.2 });
  const [index, setIndex] = useState(0);
  const list = words.filter(Boolean);
  const running = !still && pageVisible && inView && list.length > 1;

  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % list.length), interval);
    return () => window.clearTimeout(id);
  }, [running, index, interval, list.length]);

  // Snap back to the resting word when motion gets switched off.
  useEffect(() => {
    if (still) setIndex(0);
  }, [still]);

  const resting = list[0] ?? "";
  if (still || list.length < 2) {
    return <span className={className}>{resting}</span>;
  }

  const current = list[index % list.length];
  const cell = "[grid-area:1/1]";

  return (
    <span
      ref={ref}
      className={cn("relative inline-grid align-baseline", align === "center" ? "justify-items-center" : "justify-items-start", className)}
    >
      {/* Screen readers get one stable word, not a live-changing headline. */}
      <span className="sr-only">{resting}</span>
      {list.map((w) => (
        <span key={`sizer-${w}`} aria-hidden className={cn(cell, "invisible whitespace-nowrap pr-[0.08em]")}>
          {w}
        </span>
      ))}
      <AnimatePresence initial={false}>
        <m.span
          key={current}
          aria-hidden
          className={cn(cell, "whitespace-nowrap pr-[0.08em]")}
          initial="hidden"
          animate="show"
          exit="exit"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: letterStagger } },
            exit: {
              opacity: 0,
              y: "-0.3em",
              filter: "blur(4px)",
              transition: { duration: duration.short, ease: ease.accelerate },
            },
          }}
        >
          {Array.from(current).map((ch, i) => (
            <m.span
              key={`${ch}-${i}`}
              className="inline-block"
              variants={{
                hidden: { opacity: 0, y: "0.35em", filter: "blur(6px)" },
                show: {
                  opacity: 1,
                  y: 0,
                  filter: "blur(0px)",
                  transition: { duration: duration.long, ease: ease.decelerate },
                },
              }}
            >
              {ch === " " ? "\u00a0" : ch}
            </m.span>
          ))}
        </m.span>
      </AnimatePresence>
    </span>
  );
}
