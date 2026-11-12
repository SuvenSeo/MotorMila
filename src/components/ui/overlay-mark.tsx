import { useLayoutEffect, useRef } from "react";

let openOverlays = 0;

function markOpen(): () => void {
  const root = document.documentElement;
  openOverlays += 1;
  root.setAttribute("data-mm-overlay", "");
  return () => {
    openOverlays = Math.max(0, openOverlays - 1);
    if (openOverlays === 0) root.removeAttribute("data-mm-overlay");
  };
}

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
  useLayoutEffect(() => markOpen(), []);
  return null;
}

/**
 * The same fix for overlay-less modal popovers (Select, DropdownMenu). Put it
 * inside the Content. While the popover is really open (Radix also renders
 * closed Select content into a detached fragment — skipped here), it inserts
 * an invisible full-screen shield into <body> just below the popover's portal
 * and pins `#root` (data-mm-overlay). The shield takes the outside tap, so
 * Radix still dismisses on it and nothing underneath gets clicked — the job
 * body `pointer-events: none` did, without restyling the whole page.
 */
export function PopoverShield() {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || el.getRootNode() !== document) return;
    let top: HTMLElement = el;
    while (top.parentElement && top.parentElement !== document.body) top = top.parentElement;
    if (top.parentElement !== document.body) return;
    const shield = document.createElement("div");
    shield.className = "mm-popover-shield";
    shield.setAttribute("aria-hidden", "true");
    shield.setAttribute("data-mm-popover-shield", "");
    document.body.insertBefore(shield, top);
    const unmark = markOpen();
    return () => {
      shield.remove();
      unmark();
    };
  }, []);
  return <span ref={ref} hidden aria-hidden="true" />;
}
