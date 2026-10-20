import { useCallback, useEffect, useState } from "react";

/** Min side-by-side columns in the tray need price vs FMV/km/year/district. */
export interface PinnedListing {
  id: number;
  make: string;
  model: string;
  year?: number | null;
  price_lkr?: number | null;
  fmv_lkr?: number | null;
  mileage_km?: number | null;
  district?: string | null;
  deal_score?: number | null;
  // Image fields for tray thumbnails (optional, for richer UI)
  thumbnail_url?: string | null;
  detail_url?: string | null;
}

export const COMPARE_TRAY_KEY = "motormila:compare-tray:v1";
export const MAX_PINNED = 3;
export const CHANGE_EVENT = "motormila:compare-tray:change";

export function buildCompareLink(ids: number[]): string {
  const clean = ids.filter((n) => Number.isFinite(n) && n > 0).slice(0, MAX_PINNED);
  return clean.length ? `/compare?ids=${clean.join(",")}` : "/compare";
}

export function loadPinned(): PinnedListing[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(COMPARE_TRAY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is PinnedListing => typeof row === "object" && row !== null && Number.isFinite(Number((row as PinnedListing).id)))
      .map((row) => ({ ...row, id: Number(row.id) }))
      .slice(0, MAX_PINNED);
  } catch {
    return [];
  }
}

export function persistPinned(rows: PinnedListing[]): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COMPARE_TRAY_KEY, JSON.stringify(rows));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // Privacy mode — tray simply doesn't persist.
  }
}

export function isPinned(id: number): boolean {
  return loadPinned().some((row) => row.id === id);
}

/** Pin or unpin. Returns { pinned, atCap } so callers can toast when full. */
export function togglePinned(listing: PinnedListing): { pinned: boolean; atCap: boolean } {  const rows = loadPinned();
  if (rows.some((row) => row.id === listing.id)) {
    persistPinned(rows.filter((row) => row.id !== listing.id));
    return { pinned: false, atCap: false };
  }
  if (rows.length >= MAX_PINNED) return { pinned: false, atCap: true };
  persistPinned([...rows, listing]);
  return { pinned: true, atCap: false };
}

export function removePinned(id: number): void {
  persistPinned(loadPinned().filter((row) => row.id !== id));
}

export function clearPinned(): void {
  persistPinned([]);
}

/** Merge fresh fields into one pinned row (e.g. FMV refreshed after pin time). */
export function updatePinned(id: number, patch: Partial<PinnedListing>): void {
  persistPinned(
    loadPinned().map((row) => (row.id === id ? { ...row, ...patch } : row)),
  );
}

export function useCompareTray() {
  const [pinned, setPinned] = useState<PinnedListing[]>(() => loadPinned());

  useEffect(() => {
    const refresh = () => setPinned(loadPinned());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const toggle = useCallback((listing: PinnedListing) => {
    const result = togglePinned(listing);
    setPinned(loadPinned());
    return result;
  }, []);

  const remove = useCallback((id: number) => {
    removePinned(id);
    setPinned(loadPinned());
  }, []);

  const clear = useCallback(() => {
    clearPinned();
    setPinned(loadPinned());
  }, []);

  return { pinned, toggle, remove, clear, isPinned: (id: number) => pinned.some((r) => r.id === id) };
}
