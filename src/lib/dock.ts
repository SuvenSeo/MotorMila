import { useEffect, useSyncExternalStore } from "react";

/**
 * Bottom-dock helpers (ui/shell). The dock is the one bottom area shared by the
 * mobile nav, compare tray and app promo — see src/styles/layers.css.
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
 * right where floating controls sit).
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

/*
 * Extra dock height claimed by a transient strip (the app promo). It used to be
 * a custom property on <html>; changing a custom property there restyles every
 * element on the page (~250 ms at 4x CPU on home, a visible scroll hitch when
 * the promo appeared). Now only the consumers update: the shell's bottom spacer
 * (a plain height) and the compare tray (its own inline --dock-extra).
 */
let dockExtra = 0;
const listeners = new Set<() => void>();

/** Claim (or release with 0) extra dock height so floating buttons stack above a strip. */
export function setDockExtra(px: number) {
  if (typeof document === "undefined") return;
  const next = Math.max(0, Math.round(px));
  if (next === dockExtra) return;
  dockExtra = next;
  document.querySelectorAll<HTMLElement>("[data-dock-spacer]").forEach((el) => {
    el.style.height = next ? `${next}px` : "";
  });
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Current extra dock height in px (re-renders the caller when it changes). */
export function useDockExtra(): number {
  return useSyncExternalStore(subscribe, () => dockExtra, () => 0);
}
