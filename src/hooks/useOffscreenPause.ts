import { useEffect, type RefObject } from "react";

/* One shared IntersectionObserver: every looping decoration on the page
   (live dots, marquees, tickers, floating signal cards, hero media) gets
   `data-offscreen="true"` while it is outside the viewport, and smooth.css
   pauses every CSS animation in that subtree. Off-screen loops otherwise keep
   the page producing frames — and, where a loop cannot be composited (an
   off-screen layer, software compositing), re-running style on the main
   thread every frame. */
let io: IntersectionObserver | null = null;

function observer(): IntersectionObserver | null {
  if (io || typeof IntersectionObserver === "undefined") return io;
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        const off = !e.isIntersecting;
        if ((el.dataset.offscreen === "true") !== off) {
          if (off) el.dataset.offscreen = "true";
          else delete el.dataset.offscreen;
        }
      }
    },
    // A little margin so a loop is already running when it scrolls in.
    { rootMargin: "120px 0px 120px 0px" },
  );
  return io;
}

/** Pause the CSS animations inside `ref` while it is off screen. */
export function useOffscreenPause(ref: RefObject<Element>, enabled = true): void {
  useEffect(() => {
    const el = ref.current;
    const o = enabled ? observer() : null;
    if (!el || !o) return;
    o.observe(el);
    return () => {
      o.unobserve(el);
      delete (el as HTMLElement).dataset.offscreen;
    };
  }, [ref, enabled]);
}
