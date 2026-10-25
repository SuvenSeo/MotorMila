import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Animates a number from its previous value up to `target` with a cubic ease-decelerate.
 * Snaps instantly when the user prefers reduced motion. Re-runs whenever the
 * target changes, easing from wherever the display value currently sits.
 */
export function useCountUp(target: number, duration = 1200): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef(0);
  const valueRef = useRef(0);
  const prevTarget = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target) || target === prevTarget.current) return;
    prevTarget.current = target;

    if (prefersReducedMotion()) {
      valueRef.current = target;
      setValue(target);
      return;
    }

    const from = valueRef.current;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (target - from) * eased);
      valueRef.current = next;
      setValue(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}
