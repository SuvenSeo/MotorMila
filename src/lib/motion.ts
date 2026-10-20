/** True when the user asks the OS for reduced motion — gate all JS-driven
 * smooth scrolling and non-essential animation on this (WCAG 2.3.3). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** Scroll behavior that respects the user's motion preference. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

/* ── House spring presets (Framer Motion) ──────────────────────────────────
 * Apple's model: a critically-damped default (no overshoot); reserve bounce
 * for momentum-driven, physical interactions only (Designing Fluid Interfaces).
 * Framer's { bounce, duration } spring maps to Apple's { damping, response }. */

/** Default UI spring — graceful, non-distracting, no overshoot. */
export const springSoft = { type: "spring", bounce: 0, duration: 0.45 } as const;
/** Snappy control feedback (buttons, toggles). */
export const springSnappy = { type: "spring", bounce: 0, duration: 0.3 } as const;
/** Momentum spring — a little bounce, only after a flick/drag release. */
export const springBouncy = { type: "spring", bounce: 0.22, duration: 0.5 } as const;

/** Standard fade-rise-in, staggered container + item. Respects reduced motion
 * via Framer's MotionConfig reducedMotion="user" already set app-wide. */
export const revealContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
} as const;

export const revealItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: springSoft },
} as const;

/** Route enter/exit — opacity + rise + a whisper of scale. Transform-only. */
export const pageEnter = {
  opacity: 1,
  y: 0,
  scale: 1,
  transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
} as const;

export const pageInitial = { opacity: 0, y: 14, scale: 0.992 } as const;

export const pageExit = {
  opacity: 0,
  y: -8,
  scale: 0.995,
  transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
} as const;
