import { useEffect } from "react";

/**
 * Bottom-dock helpers (ui/shell). The dock is the one bottom area shared by the
 * mobile nav, chat button, compare tray and app promo — see src/styles/layers.css.
 */

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    const type = (el.type || "text").toLowerCase();
    return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image", "hidden"].includes(type);
  }
  return false;
}

/**
 * Marks <html data-typing="true"> while a text field has focus so floating
 * buttons step aside (on a phone the keyboard pushes fields to the bottom edge,
 * right where the chat button sits).
 */
export function useDockTypingFlag() {
  useEffect(() => {
    const root = document.documentElement;
    const onIn = (e: FocusEvent) => {
      if (isEditable(e.target)) root.dataset.typing = "true";
    };
    const onOut = (e: FocusEvent) => {
      if (!isEditable(e.relatedTarget)) delete root.dataset.typing;
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
      delete root.dataset.typing;
    };
  }, []);
}

/** Claim (or release with 0) extra dock height so floating buttons stack above a strip. */
export function setDockExtra(px: number) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--dock-extra", `${Math.max(0, Math.round(px))}px`);
}
