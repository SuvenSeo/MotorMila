import { useCallback, useEffect, useState } from "react";
import "@/styles/low-data.css";

/**
 * Low-data mode: for prepaid data and slow phones.
 *
 * When on:
 *  - <html class="low-data"> (CSS in src/styles/low-data.css kills CSS
 *    animations/transitions and hides ambient decoration)
 *  - image components should use thumbnail-size images only
 *    (`pickLowDataImage` / `lowDataImageList`)
 *  - carousels must not autoplay (`shouldAutoplay(lowData)`)
 *  - charts stay collapsed until tapped (<LowDataChartGate>)
 *  - framer-motion: pass `lowDataReducedMotion(lowData)` to <MotionConfig>
 *
 * The preference is stored in localStorage and synced across tabs/components.
 * When `navigator.connection.saveData` is true and the user has never chosen,
 * `shouldSuggest` is true so the UI can offer to turn it on (never forced).
 */

export const LOW_DATA_STORAGE_KEY = "motormila:low-data:v1";
export const LOW_DATA_SUGGEST_DISMISSED_KEY = "motormila:low-data:suggest-dismissed:v1";
export const LOW_DATA_EVENT = "motormila:low-data:change";
export const LOW_DATA_CLASS = "low-data";

type NetworkInformationLike = { saveData?: boolean; effectiveType?: string };

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Stored preference: true/false, or null when the user never chose. */
export function readLowDataPreference(): boolean | null {
  try {
    const raw = storage()?.getItem(LOW_DATA_STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return null;
  } catch {
    return null;
  }
}

export function readLowData(): boolean {
  return readLowDataPreference() === true;
}

export function applyLowDataClass(on: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(LOW_DATA_CLASS, on);
}

export function writeLowData(on: boolean): void {
  try {
    storage()?.setItem(LOW_DATA_STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Storage blocked: the setting lasts for this page view only.
  }
  applyLowDataClass(on);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LOW_DATA_EVENT, { detail: on }));
  }
}

/** Browser Data Saver / Lite mode hint (Chrome Android exposes this). */
export function readSaveDataHint(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return conn?.saveData === true;
}

function readSuggestDismissed(): boolean {
  try {
    return storage()?.getItem(LOW_DATA_SUGGEST_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

// Apply the stored class as soon as any module imports this file, so a
// reload does not flash animations before React mounts a consumer.
applyLowDataClass(readLowData());

export interface LowDataApi {
  lowData: boolean;
  setLowData: (on: boolean) => void;
  toggle: () => void;
  /** Browser reports Data Saver on. */
  saveDataHint: boolean;
  /** Data Saver on, user never chose, and hasn't dismissed the suggestion. */
  shouldSuggest: boolean;
  dismissSuggestion: () => void;
}

export function useLowData(): LowDataApi {
  const [lowData, setState] = useState<boolean>(() => readLowData());
  const [preference, setPreference] = useState<boolean | null>(() => readLowDataPreference());
  const [dismissed, setDismissed] = useState<boolean>(() => readSuggestDismissed());
  const [saveDataHint] = useState<boolean>(() => readSaveDataHint());

  useEffect(() => {
    const sync = () => {
      setState(readLowData());
      setPreference(readLowDataPreference());
      setDismissed(readSuggestDismissed());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === LOW_DATA_STORAGE_KEY || e.key === LOW_DATA_SUGGEST_DISMISSED_KEY) {
        sync();
        applyLowDataClass(readLowData());
      }
    };
    window.addEventListener(LOW_DATA_EVENT, sync);
    window.addEventListener("storage", onStorage);
    applyLowDataClass(readLowData());
    return () => {
      window.removeEventListener(LOW_DATA_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setLowData = useCallback((on: boolean) => {
    writeLowData(on);
    setState(on);
    setPreference(on);
  }, []);

  const toggle = useCallback(() => {
    const next = !readLowData();
    writeLowData(next);
    setState(next);
    setPreference(next);
  }, []);

  const dismissSuggestion = useCallback(() => {
    try {
      storage()?.setItem(LOW_DATA_SUGGEST_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(LOW_DATA_EVENT));
  }, []);

  return {
    lowData,
    setLowData,
    toggle,
    saveDataHint,
    shouldSuggest: saveDataHint && preference === null && !dismissed,
    dismissSuggestion,
  };
}

// ── Helpers for image / carousel / motion consumers ─────────────────────────

export interface LowDataImageSource {
  thumbnail_url?: string | null;
  images?: unknown[] | null;
}

/** Thumbnail first (small file), else the first gallery image. */
export function pickLowDataImage(listing: LowDataImageSource): string | null {
  if (listing.thumbnail_url) return listing.thumbnail_url;
  const first = Array.isArray(listing.images) ? listing.images.find((x) => typeof x === "string" && x) : null;
  return (first as string | null | undefined) ?? null;
}

/** Gallery list for low-data mode: a single thumbnail instead of N full-size photos. */
export function lowDataImageList(images: string[], thumbnail?: string | null, lowData = true): string[] {
  if (!lowData) return images;
  const pick = thumbnail || images[0];
  return pick ? [pick] : [];
}

export function shouldAutoplay(lowData: boolean, prefersReducedMotion = false): boolean {
  return !lowData && !prefersReducedMotion;
}

/** Value for framer-motion <MotionConfig reducedMotion>. */
export function lowDataReducedMotion(lowData: boolean): "always" | "user" {
  return lowData ? "always" : "user";
}
