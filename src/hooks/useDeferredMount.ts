import { startTransition, useEffect, useState } from "react";

/**
 * False on the first paint, true one frame later (as a transition, so React
 * renders the deferred tree in interruptible slices instead of one long task).
 *
 * For heavy below-the-fold sections: the above-the-fold content paints and
 * animates first (card → listing open, sheet slide-in), the rest follows.
 * Nothing is deferred until `enabled` is true (e.g. once the data is in);
 * once true it stays true.
 */
export function useDeferredMount(enabled = true): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!enabled || ready) return;
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      setReady(true);
      return;
    }
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => startTransition(() => setReady(true)));
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [enabled, ready]);
  return ready;
}
