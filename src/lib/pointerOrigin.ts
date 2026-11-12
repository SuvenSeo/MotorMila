/**
 * Scale-from-origin for modals: remember where the last press happened, so a
 * dialog opened by it can scale in from that point (the kit's .mm-pop uses
 * `transform-origin: var(--mm-origin, center)`). Keyboard opens, or a press
 * more than ~1s old, keep the centre origin.
 */
let last: { x: number; y: number; t: number } | null = null;
let listening = false;

function ensureListener() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener(
    "pointerdown",
    (e) => {
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
    },
    { capture: true, passive: true },
  );
}
ensureListener();

const MAX_AGE_MS = 1200;

/** Sets `--mm-origin` on `el` to the recent press point (in its own box). */
export function applyPressOrigin(el: HTMLElement | null): void {
  if (!el || !last || performance.now() - last.t > MAX_AGE_MS) return;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  // Keep the origin near the box so the scale reads as "from the trigger"
  // without a long diagonal slide when the trigger is far away.
  const x = Math.max(-r.width * 0.25, Math.min(r.width * 1.25, last.x - r.left));
  const y = Math.max(-r.height * 0.25, Math.min(r.height * 1.25, last.y - r.top));
  el.style.setProperty("--mm-origin", `${Math.round(x)}px ${Math.round(y)}px`);
}
