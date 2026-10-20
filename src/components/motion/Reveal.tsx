import type { ReactNode } from "react";
import { m, type Variants } from "motion/react";
import { fadeIn, fadeUp, useReducedMotionOrLowData } from "@/lib/motion";

type RevealTag = "div" | "section" | "header" | "li" | "h2";

export interface RevealProps {
  children: ReactNode;
  className?: string;
  as?: RevealTag;
  /** Seconds. */
  delay?: number;
  id?: string;
  "aria-labelledby"?: string;
}

/**
 * Fade + 8px rise the first time the block scrolls into view (once).
 * Opacity-only under reduced motion / low-data mode.
 */
export function Reveal({ children, className, as = "div", delay = 0, id, "aria-labelledby": labelledBy }: RevealProps) {
  const still = useReducedMotionOrLowData();
  const Comp = m[as];
  const base = still ? fadeIn : fadeUp;
  const variants: Variants = delay
    ? { ...base, show: { ...(base.show as object), transition: { ...((base.show as { transition?: object }).transition ?? {}), delay } } }
    : base;
  return (
    <Comp
      id={id}
      aria-labelledby={labelledBy}
      className={className}
      // Own trigger: don't inherit a parent's mount-time "show".
      inherit={false}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15, margin: "0px 0px -6% 0px" }}
      variants={variants}
    >
      {children}
    </Comp>
  );
}
