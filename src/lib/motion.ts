import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { Transition, Variants } from "motion/react";
import { LOW_DATA_CLASS, LOW_DATA_EVENT, readLowData } from "@/hooks/useLowData";

/* ══════════════════════════════════════════════════════════════════════════
 * MOTORMILA MOTION TOKENS (web/premium-p0) — the ONE motion system.
 *
 *   3 springs   snappy · smooth · expressive
 *   3 easings   standard · decelerate (enter) · accelerate (exit)
 *   4 durations micro 100 · short 180 · medium 260 · long 400 (ms)
 *
 * CSS mirror: --ease-standard/--ease-decelerate/--ease-accelerate and
 * --dur-micro/--dur-short/--dur-medium/--dur-long in src/index.css, and the
 * Tailwind `ease-*` / `duration-*` utilities in tailwind.config.ts.
 *
 * Rules
 * - Animate transform and opacity only (colour for hover is fine). Never
 *   `transition-all`, never width/height/top/left.
 * - Nothing over 500ms except a deliberate one-time hero intro.
 * - Everything degrades to opacity-only (or nothing) under reduced motion or
 *   low-data mode: MotionConfig reducedMotion="user" + `opacityOnly()`.
 * - Routes and card→detail use the View Transitions API
 *   (src/lib/viewTransition.ts); motion owns in-page physics only. Never
 *   animate one element with both.
 * ════════════════════════════════════════════════════════════════════════ */

/** Durations in seconds. */
export const duration = {
  /** press, colour */
  micro: 0.1,
  /** hover, chip, tooltip */
  short: 0.18,
  /** popover, tab, cross-fade */
  medium: 0.26,
  /** sheet, shared element */
  long: 0.4,
} as const;

/** Cubic-bezier easings. */
export const ease = {
  standard: [0.2, 0, 0, 1],
  /** entering elements */
  decelerate: [0, 0, 0, 1],
  /** leaving elements */
  accelerate: [0.3, 0, 1, 1],
} as const satisfies Record<string, [number, number, number, number]>;

/** Springs (motion's perceptual `visualDuration` + `bounce`). */
export const spring = {
  /** press, toggles, chips */
  snappy: { type: "spring", visualDuration: 0.25, bounce: 0 },
  /** sheets, popovers, layout */
  smooth: { type: "spring", visualDuration: 0.4, bounce: 0 },
  /** shared element, success — sparingly */
  expressive: { type: "spring", visualDuration: 0.5, bounce: 0.15 },
} as const satisfies Record<string, Transition>;

/** Ready-made tweens: `transition={tween.short}`. */
export const tween = {
  micro: { duration: duration.micro, ease: ease.standard },
  short: { duration: duration.short, ease: ease.standard },
  medium: { duration: duration.medium, ease: ease.standard },
  long: { duration: duration.long, ease: ease.standard },
  enter: { duration: duration.medium, ease: ease.decelerate },
  exit: { duration: duration.short, ease: ease.accelerate },
} as const satisfies Record<string, Transition>;

/** Instant (reduced motion / low data). */
export const INSTANT = { duration: 0 } as const;

/** Stagger rules: 40ms between children, max 8 staggered. */
export const STAGGER = 0.04;
export const STAGGER_MAX = 8;
/** Delay for the i-th staggered child; items past the cap appear together. */
export const staggerDelay = (i: number) => Math.min(i, STAGGER_MAX) * STAGGER;

/* ── Variants: use with initial="hidden" animate="show" exit="exit" ─────── */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: tween.medium },
  exit: { opacity: 0, transition: tween.exit },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: tween.enter },
  exit: { opacity: 0, y: 4, transition: tween.exit },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: spring.snappy },
  exit: { opacity: 0, scale: 0.96, transition: tween.exit },
};

/** Bottom sheet (mobile). Side sheets: override `y` with `x: "100%"`. */
export const sheet: Variants = {
  hidden: { y: "100%" },
  show: { y: 0, transition: spring.smooth },
  exit: { y: "100%", transition: { duration: duration.medium, ease: ease.accelerate } },
};

/** Fallback page transition (browsers without View Transitions). */
export const page: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: tween.enter },
  exit: { opacity: 0, transition: tween.exit },
};

/** Container for staggered lists; pair children with `fadeUp` / `revealItem`. */
export const listStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER, delayChildren: 0.02 } },
  exit: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
};

/** List item that self-caps the stagger: `<m.li variants={listItem} custom={i}>`. */
export const listItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { ...tween.enter, delay: staggerDelay(i) },
  }),
  exit: { opacity: 0, transition: tween.exit },
};

/** Section reveal (container + item), same tokens as the list stagger. */
export const revealContainer = listStagger;
export const revealItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: spring.smooth },
};

/* ── Gesture props: spread onto m.* elements ─────────────────────────────── */
/** Buttons/cards: `<m.button {...press}>`. */
export const press = {
  whileTap: { scale: 0.97 },
  transition: spring.snappy,
} as const;

/** Desktop cards only — gate with `canHover()` / pointer:fine. */
export const hoverLift = {
  whileHover: { y: -2 },
  whileTap: { scale: 0.97 },
  transition: spring.snappy,
} as const;

/** True on devices with a fine pointer that can hover (desktop). */
export function canHover(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: hover) and (pointer: fine)").matches === true
  );
}

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

/** Opacity-only version of a variant set (for reduced motion / low data). */
export function opacityOnly(v: Variants): Variants {
  const out: Variants = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "function") {
      out[k] = (...args: Parameters<typeof val>) => {
        const r = (val as (...a: unknown[]) => Record<string, unknown>)(...args);
        return { opacity: (r.opacity as number | undefined) ?? 1, transition: { duration: duration.micro } };
      };
    } else {
      const t = val as Record<string, unknown>;
      out[k] = { opacity: (t.opacity as number | undefined) ?? 1, transition: { duration: duration.micro } };
    }
  }
  return out;
}

/** True when the OS asks for reduced motion OR the app's low-data mode is on.
 * When true: use `opacityOnly(variants)`, skip gestures/stagger/layout springs. */
export function usePrefersReducedMotionOrLowData(): boolean {
  const reduced = useReducedMotion();
  const [lowData, setLowData] = useState<boolean>(() => {
    if (typeof document !== "undefined" && document.documentElement.classList.contains(LOW_DATA_CLASS)) return true;
    return readLowData();
  });
  useEffect(() => {
    const sync = () => setLowData(readLowData());
    window.addEventListener(LOW_DATA_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LOW_DATA_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return reduced === true || lowData;
}

/** Light haptic tick on save / compare-add (mobile, motion allowed only). */
export function haptic(ms = 8): void {
  if (typeof navigator === "undefined" || prefersReducedMotion()) return;
  if (!window.matchMedia?.("(pointer: coarse)").matches) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* some browsers throw without user activation */
  }
}

/** Alias used across pages. Same hook. */
export const useReducedMotionOrLowData = usePrefersReducedMotionOrLowData;
