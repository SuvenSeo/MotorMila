import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { Transition, Variants } from "motion/react";
import { LOW_DATA_CLASS, LOW_DATA_EVENT, readLowData } from "@/hooks/useLowData";

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

/* ══════════════════════════════════════════════════════════════════════════
 * MOTION SYSTEM (MOTION_SPEC.md, Oct 2026). Import these in new work.
 * The legacy exports above stay for existing call sites.
 * Rules: animate transform + opacity only; everything degrades to
 * opacity-only (or nothing) under reduced motion / low-data mode.
 * ════════════════════════════════════════════════════════════════════════ */

/** Durations in seconds. */
export const duration = {
  instant: 0.1,
  fast: 0.18,
  base: 0.28,
  slow: 0.45,
  page: 0.35,
} as const;

/** Cubic-bezier easings. */
export const ease = {
  standard: [0.2, 0, 0, 1],
  emphasized: [0.3, 0, 0, 1],
  exit: [0.4, 0, 1, 1],
} as const satisfies Record<string, [number, number, number, number]>;

/** Spring presets. `bouncy` sparingly: toggles, save heart. */
export const spring = {
  snappy: { type: "spring", stiffness: 500, damping: 35, mass: 0.8 },
  gentle: { type: "spring", stiffness: 260, damping: 30 },
  bouncy: { type: "spring", stiffness: 400, damping: 22 },
} as const satisfies Record<string, Transition>;

/** Stagger rules: 40ms between children, max 8 staggered. */
export const STAGGER = 0.04;
export const STAGGER_MAX = 8;
/** Delay for the i-th staggered child; items past the cap appear together. */
export const staggerDelay = (i: number) => Math.min(i, STAGGER_MAX) * STAGGER;

/** Shared transitions. */
export const transition = {
  fast: { duration: duration.fast, ease: ease.standard },
  base: { duration: duration.base, ease: ease.standard },
  emphasized: { duration: duration.slow, ease: ease.emphasized },
  exit: { duration: duration.fast, ease: ease.exit },
  page: { duration: duration.page, ease: ease.emphasized },
} as const satisfies Record<string, Transition>;

/* ── Variants: use with initial="hidden" animate="show" exit="exit" ─────── */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: transition.base },
  exit: { opacity: 0, transition: transition.exit },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: transition.base },
  exit: { opacity: 0, y: 4, transition: transition.exit },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: transition.fast },
  exit: { opacity: 0, scale: 0.96, transition: transition.exit },
};

/** Bottom sheet (mobile). Side sheets: override `y` with `x: "100%"`. */
export const sheet: Variants = {
  hidden: { y: "100%" },
  show: { y: 0, transition: spring.gentle },
  exit: { y: "100%", transition: { duration: duration.base, ease: ease.exit } },
};

/** Page transition: cross-fade + 8px rise. */
export const page: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: transition.page },
  exit: { opacity: 0, transition: { duration: duration.fast, ease: ease.exit } },
};

/** Container for staggered lists; pair children with `fadeUp`.
 * Stagger is capped by only staggering the first STAGGER_MAX children —
 * for long lists set `custom={i}` on items and use `listItem` instead. */
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
    transition: { ...transition.base, delay: staggerDelay(i) },
  }),
  exit: { opacity: 0, transition: transition.exit },
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

/** Opacity-only version of a variant set (for reduced motion / low data). */
export function opacityOnly(v: Variants): Variants {
  const out: Variants = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "function") {
      out[k] = (...args: Parameters<typeof val>) => {
        const r = (val as (...a: unknown[]) => Record<string, unknown>)(...args);
        return { opacity: (r.opacity as number | undefined) ?? 1, transition: { duration: duration.fast } };
      };
    } else {
      const t = val as Record<string, unknown>;
      out[k] = { opacity: (t.opacity as number | undefined) ?? 1, transition: { duration: duration.fast } };
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
  navigator.vibrate?.(ms);
}

/** Alias used by the pages/listing worktrees. Same hook. */
export const useReducedMotionOrLowData = usePrefersReducedMotionOrLowData;
