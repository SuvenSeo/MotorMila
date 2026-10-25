import { useLayoutEffect } from "react";

let openOverlays = 0;

/**
 * Rendered inside a modal Sheet/Dialog content (mounted only while it is
 * open or animating out). Marks <html data-mm-overlay> so `#root` keeps an
 * explicit `pointer-events: auto` while Radix sets `pointer-events: none` on
 * <body>: an inherited change on <body> otherwise restyles every element of
 * the page (~35 ms at 4x CPU on home) on the tap that opens the sheet. The
 * full-screen overlay still takes every outside tap, so nothing underneath
 * becomes clickable (floating bars above the overlay opt out via
 * `.mm-over-overlay`).
 */
export function OverlayMark() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    openOverlays += 1;
    root.setAttribute("data-mm-overlay", "");
    return () => {
      openOverlays = Math.max(0, openOverlays - 1);
      if (openOverlays === 0) root.removeAttribute("data-mm-overlay");
    };
  }, []);
  return null;
}
