import { viewTransitionInFlight } from "@/lib/viewTransition";
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
    let raf1 = 0;
    let raf2 = 0;
    let poll = 0;
    // Not under a running View Transition (Back from a listing morphs into the
    // feed): DOM inserted mid-transition is restyled into every frame of it.
    const start = () => {
      if (viewTransitionInFlight()) {
        poll = window.setTimeout(start, 50);
        return;
      }
      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => startTransition(() => setReady(true)));
      });
    };
    start();
    return () => {
      window.clearTimeout(poll);
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [enabled, ready]);
  return ready;
}
