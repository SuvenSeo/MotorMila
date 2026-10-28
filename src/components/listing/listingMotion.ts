/**
 * Listing-area motion helpers (polish/listing). Tokens come from
 * `@/lib/motion`; this file only holds listing-specific glue: haptics,
 * hover capability, the card→detail View Transition and the image fade-in.
 */
import { flushSync } from "react-dom";
import { useEffect, useState } from "react";
import { rootProjectionNode } from "motion/react";
import type { Transition, Variants } from "motion/react";
import "@/styles/listing-motion.css";
import {
  HERO_VT_NAME,
  cancelActiveTransition,
  clearHeroNames,
  runOwnedCommit,
  settleHeroOverlays,
  trackTransition,
} from "@/lib/viewTransition";

export { HERO_VT_NAME };
const VT_ATTR = "data-listing-vt";

function matches(query: string): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(query).matches === true;
}

function reducedOrLowData(): boolean {
  if (typeof document === "undefined") return true;
  return matches("(prefers-reduced-motion: reduce)") || document.documentElement.classList.contains("low-data");
}

/** Light haptic tick on save / compare-add: mobile only, off in reduced motion. */
export function haptic(ms = 8): void {
  if (typeof navigator === "undefined" || reducedOrLowData()) return;
  if (!matches("(pointer: coarse)")) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* some browsers throw without user activation */
  }
}

/** Desktop pointer that can hover (hover lift is desktop-only per spec). */
export function useCanHover(): boolean {
  const [can, setCan] = useState(() => matches("(hover: hover) and (pointer: fine)"));
  useEffect(() => {
    const mq = window.matchMedia?.("(hover: hover) and (pointer: fine)");
    if (!mq) return;
    const on = () => setCan(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return can;
}

type DocWithVT = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void>; skipTransition?: () => void };
};

export function supportsViewTransition(): boolean {
  return typeof document !== "undefined" && typeof (document as DocWithVT).startViewTransition === "function";
}

/** The photo currently showing inside a card (skips hidden carousel slides). */
export function visibleCardImage(root: Element | null): HTMLImageElement | null {
  if (!root) return null;
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>("img[data-card-photo]"));
  return imgs.find((img) => !img.closest('[aria-hidden="true"]')) ?? imgs[0] ?? null;
}

function waitForHero(timeoutMs: number): Promise<HTMLImageElement | null> {
  // setTimeout, not requestAnimationFrame: Chromium suppresses rendering (and
  // with it rAF) while a View Transition's update callback runs, so a rAF poll
  // froze the old page for seconds before the transition could finish.
  const start = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      const hero = document.querySelector<HTMLImageElement>("img[data-listing-hero]");
      if (hero && hero.complete && hero.naturalWidth > 0) return resolve(hero);
      // The card's own photo, handed to the detail gallery (lib/listingHandoff):
      // already decoded, so the morph doesn't wait on the full-size download.
      const placeholder = document.querySelector<HTMLImageElement>("img[data-listing-hero-ph]");
      if (placeholder && placeholder.complete && placeholder.naturalWidth > 0) return resolve(placeholder);
      if (performance.now() - start > timeoutMs) return resolve(null);
      window.setTimeout(tick, 16);
    };
    tick();
  });
}

/** A card → listing open is in flight (from the tap until its morph lands). */
let openInFlight = false;
export function listingOpenInFlight(): boolean {
  return openInFlight;
}

/**
 * Card → detail continuity. Wraps the route change in a View Transition and
 * morphs the card photo into the detail hero (one shared element, transform +
 * size of a snapshot only; listing-motion.css). Falls back to a fast root fade
 * when the hero photo isn't decoded within ~150ms, and to a plain navigation
 * when the API is missing, motion is reduced, or low-data mode is on.
 * Returns false when it did nothing (caller should navigate normally).
 *
 * Robust to fast input: a second tap while an open is in flight is swallowed
 * (returns true so the caller cancels the click), and a running Back morph is
 * finished on the spot before this one starts (lib/viewTransition).
 */
export function navigateWithHeroTransition(navigate: () => void, cardImage: HTMLImageElement | null): boolean {
  if (openInFlight) return true;
  if (!supportsViewTransition() || reducedOrLowData()) return false;
  const doc = document as DocWithVT;
  const html = document.documentElement;
  cancelActiveTransition();
  clearHeroNames();
  if (cardImage) {
    cardImage.style.setProperty("view-transition-name", HERO_VT_NAME);
    // Desktop hover zoom (scale 1.03) would be captured into the first frame.
    cardImage.style.setProperty("transition", "none");
    cardImage.style.setProperty("transform", "none");
  }
  let hero: HTMLImageElement | null = null;
  let stage: Element | null = null;
  let projectionRoot: { blockUpdate: () => void; unblockUpdate: () => void } | null = null;
  let cancelled = false;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    cancelled = true;
    openInFlight = false;
    projectionRoot?.unblockUpdate();
    projectionRoot = null;
    html.removeAttribute(VT_ATTR);
    html.removeAttribute("data-listing-dir");
    stage?.removeAttribute("data-vt-hero-stage");
    hero?.style.removeProperty("view-transition-name");
    if (cardImage) {
      cardImage.style.removeProperty("view-transition-name");
      cardImage.style.removeProperty("transition");
      cardImage.style.removeProperty("transform");
    }
  };
  openInFlight = true;
  try {
    const vt = doc.startViewTransition!(async () => {
      if (cardImage) cardImage.style.removeProperty("view-transition-name");
      // Tells RouteTransition / the detail page to swap in at rest: the View
      // Transition is the animation (no framer fade or reveal on top of it).
      html.setAttribute(VT_ATTR, "pending");
      // Hold Motion's layout projection while the page swaps: every `layoutId`
      // element that unmounts with the outgoing page (tab / segment pills)
      // calls willUpdate(), which measures scroll + every layout node and
      // forced a style recalc of the whole page inside the route commit. Nothing
      // layout-animates across this transition (the active nav tab stays Buy).
      projectionRoot = rootProjectionNode.current ?? null;
      projectionRoot?.blockUpdate();
      runOwnedCommit(() => flushSync(navigate));
      if (cancelled) return;
      const found = cardImage ? await waitForHero(150) : null;
      if (cancelled) return;
      hero = found;
      if (hero) {
        hero.style.setProperty("view-transition-name", HERO_VT_NAME);
        stage = hero.closest(".route-stage");
        stage?.setAttribute("data-vt-hero-stage", "");
        html.setAttribute("data-listing-dir", "open");
        html.setAttribute(VT_ATTR, "hero");
      } else {
        html.setAttribute(VT_ATTR, "fade");
      }
    });
    trackTransition(vt, cleanup, () => {
      if (hero) settleHeroOverlays(null);
    });
    return true;
  } catch {
    cleanup();
    return false;
  }
}

/** Stagger cap from the spec: 40ms apart, only the first 8 items staggered. */
export function revealDelay(index: number | null | undefined): number {
  if (index == null || index < 0 || index >= 8) return 0;
  return index * 0.04;
}

/** Copy of a variant set whose `show` state starts after `delay` seconds. */
export function withShowDelay(variants: Variants, delay: number): Variants {
  if (!delay) return variants;
  const show = variants.show as { transition?: Transition } & Record<string, unknown>;
  return { ...variants, show: { ...show, transition: { ...(show.transition ?? {}), delay } } };
}
