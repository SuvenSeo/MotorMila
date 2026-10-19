import type { MouseEvent } from "react";

/**
 * Card Spotlight (#15 UI review) — a cursor-following glow for cards.
 * Attach `setSpotlightVars` to the card's onMouseMove and render
 * <CardSpotlightGlow /> as its first child. The glow is pure CSS
 * (radial-gradient at --spot-x/--spot-y), degrades to nothing on touch
 * devices, and is disabled under prefers-reduced-motion.
 */
export function setSpotlightVars(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
  el.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
}

export function CardSpotlightGlow() {
  return <span aria-hidden className="card-spot-glow" />;
}
