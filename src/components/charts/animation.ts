import type { Transition } from "motion/react";

/** Default clip-reveal easing for cartesian charts. */
export const DEFAULT_ANIMATION_EASING = "var(--ease-standard)";

/** Chart draw-in plays once on first view; capped at the 500ms motion ceiling. */
export const DEFAULT_ANIMATION_DURATION_MS = 500;

/** Default enter transition — matches the original line chart reveal. */
export const DEFAULT_CHART_ENTER_TRANSITION: Transition = {
  type: "tween",
  duration: DEFAULT_ANIMATION_DURATION_MS / 1000,
  ease: [0.2, 0, 0, 1], // ease.standard
};

/**
 * Clip-path width reveal must use tween — spring does not reliably animate SVG width.
 */
export function clipRevealTransition(enterTransition?: Transition): Transition {
  if (enterTransition?.type === "tween") {
    return {
      ...enterTransition,
      ease: enterTransition.ease ?? DEFAULT_CHART_ENTER_TRANSITION.ease,
    };
  }

  const duration =
    typeof enterTransition?.duration === "number"
      ? enterTransition.duration
      : DEFAULT_ANIMATION_DURATION_MS / 1000;

  return {
    type: "tween",
    duration,
    ease: DEFAULT_CHART_ENTER_TRANSITION.ease,
  };
}
