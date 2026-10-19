import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { CarListing } from "@/types/car";
import {
  MAX_PINNED,
  buildCompareLink,
  useCompareTray,
  type PinnedListing,
} from "@/lib/compareTray";

/**
 * Compare selection, shared app-wide.
 *
 * State lives in localStorage (`@/lib/compareTray`, key motormila:compare-tray:v1)
 * so it survives reloads and syncs across tabs. Wrapping the app in
 * <CompareProvider> keeps one subscription; without it `useCompare()` still
 * works (each caller subscribes to the same store), so cards, detail pages
 * and the tray can call it from anywhere.
 */

export type CompareAddResult = { ok: boolean; reason?: "full" | "duplicate" | "invalid" };

export interface CompareApi {
  items: PinnedListing[];
  count: number;
  max: number;
  isFull: boolean;
  has: (id: number) => boolean;
  /** Add (no-op when already present or full). */
  add: (listing: PinnedListing) => CompareAddResult;
  /** Toggle membership; returns `{ ok:false, reason:"full" }` when at cap. */
  toggle: (listing: PinnedListing) => CompareAddResult & { added: boolean };
  remove: (id: number) => void;
  clear: () => void;
  /** `/compare?ids=…` for the current selection. */
  href: string;
}

const CompareContext = createContext<CompareApi | null>(null);

/** Map any listing-shaped object to the compact row the tray persists. */
export function toPinnedListing(listing: Omit<Partial<CarListing>, "id"> & { id: number | string }): PinnedListing {
  const median = Number(listing.market_median_lkr);
  const images = Array.isArray(listing.images) ? listing.images : [];
  const price = Number(listing.price_lkr);
  const km = Number(listing.mileage_km);
  return {
    id: Number(listing.id),
    make: String(listing.make ?? ""),
    model: String(listing.model ?? ""),
    year: listing.year ?? null,
    price_lkr: Number.isFinite(price) && price > 0 ? price : null,
    fmv_lkr: Number.isFinite(median) && median > 0 ? median : null,
    mileage_km: Number.isFinite(km) && km >= 0 && listing.mileage_km != null ? km : null,
    district: listing.district ?? null,
    deal_score: typeof listing.deal_score === "number" ? listing.deal_score : null,
    thumbnail_url: listing.thumbnail_url || (typeof images[0] === "string" ? images[0] : null) || null,
    detail_url: listing.detail_url || null,
  };
}

function useCompareStore(): CompareApi {
  const { pinned, toggle: rawToggle, remove, clear } = useCompareTray();

  const has = useCallback((id: number) => pinned.some((row) => row.id === Number(id)), [pinned]);

  const add = useCallback(
    (listing: PinnedListing): CompareAddResult => {
      if (!Number.isFinite(Number(listing?.id)) || Number(listing.id) <= 0) return { ok: false, reason: "invalid" };
      if (pinned.some((row) => row.id === Number(listing.id))) return { ok: false, reason: "duplicate" };
      if (pinned.length >= MAX_PINNED) return { ok: false, reason: "full" };
      const result = rawToggle({ ...listing, id: Number(listing.id) });
      return result.pinned ? { ok: true } : { ok: false, reason: result.atCap ? "full" : "invalid" };
    },
    [pinned, rawToggle],
  );

  const toggle = useCallback(
    (listing: PinnedListing) => {
      if (!Number.isFinite(Number(listing?.id)) || Number(listing.id) <= 0) {
        return { ok: false, added: false, reason: "invalid" as const };
      }
      const result = rawToggle({ ...listing, id: Number(listing.id) });
      if (result.atCap) return { ok: false, added: false, reason: "full" as const };
      return { ok: true, added: result.pinned };
    },
    [rawToggle],
  );

  return useMemo(
    () => ({
      items: pinned,
      count: pinned.length,
      max: MAX_PINNED,
      isFull: pinned.length >= MAX_PINNED,
      has,
      add,
      toggle,
      remove,
      clear,
      href: buildCompareLink(pinned.map((row) => row.id)),
    }),
    [pinned, has, add, toggle, remove, clear],
  );
}

export function CompareProvider({ children }: { children: ReactNode }) {
  const api = useCompareStore();
  return <CompareContext.Provider value={api}>{children}</CompareContext.Provider>;
}

/** Compare selection from anywhere (provider optional). */
export function useCompare(): CompareApi {
  const fromContext = useContext(CompareContext);
  // Always call the store hook (rules of hooks); the context wins when present.
  const local = useCompareStore();
  return fromContext ?? local;
}

export { MAX_PINNED as COMPARE_MAX };
export type { PinnedListing };
