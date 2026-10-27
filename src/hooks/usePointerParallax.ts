import { useEffect, type RefObject } from "react";

/**
 * Pointer parallax for a cinematic stage. Children marked `data-depth="N"`
 * drift up to N px with the pointer (negative = opposite direction), eased in
 * one rAF loop that stops as soon as the layers settle. Transforms are written
 * straight onto those elements: no React state, no re-render, no custom
 * property on the stage (which would restyle its whole subtree).
 *
 * Off for coarse pointers, reduced motion and low-data mode (`enabled`).
 */
export function usePointerParallax(stageRef: RefObject<HTMLElement>, enabled: boolean): void {
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !enabled || typeof window === "undefined") return;
    if (!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const layers = Array.from(stage.querySelectorAll<HTMLElement>("[data-depth]")).map((el) => ({
      el,
      depth: Number(el.dataset.depth) || 0,
    }));
    if (!layers.length) return;

    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    // Measured lazily on the next pointer move after a scroll/resize, so the
    // scroll listener only flips a flag (no layout read per scroll frame).
    let rect: DOMRect | null = null;

    const frame = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      const done = Math.abs(tx - x) < 0.001 && Math.abs(ty - y) < 0.001;
      if (done) {
        x = tx;
        y = ty;
      }
      for (const { el, depth } of layers) {
        el.style.transform = `translate3d(${(x * depth).toFixed(2)}px, ${(y * depth * 0.6).toFixed(2)}px, 0)`;
      }
      raf = done ? 0 : requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (!rect) rect = stage.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
      ty = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
      kick();
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
      kick();
    };
    const onResize = () => {
      rect = null;
    };
    const onScroll = onResize;

    stage.addEventListener("pointermove", onMove, { passive: true });
    stage.addEventListener("pointerleave", onLeave, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      for (const { el } of layers) el.style.transform = "";
    };
  }, [stageRef, enabled]);
}
