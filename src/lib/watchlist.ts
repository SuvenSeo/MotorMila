import { useCallback, useEffect, useState } from "react";

const WATCHLIST_CHANGE = "motormila:watchlist:change";
const WATCHLIST_KEY = "motormila.watchlist.ids";

function normalizeIds(ids: number[]): number[] {
  return ids.filter((id) => Number.isInteger(id) && id > 0);
}

function getStorage(): Storage | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  if (typeof window.localStorage.getItem !== "function" || typeof window.localStorage.setItem !== "function") {
    return null;
  }

  return window.localStorage;
}

export function loadWatchlistIds(): number[] {
  try {
    const storage = getStorage();
    if (!storage) return [];
    const raw = storage.getItem(WATCHLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizeIds(parsed) : [];
  } catch {
    return [];
  }
}

export function saveWatchlistIds(ids: number[]): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(WATCHLIST_KEY, JSON.stringify(normalizeIds(ids)));
    window.dispatchEvent(new Event(WATCHLIST_CHANGE));
    return true;
  } catch {
    return false;
  }
}

/** Device-local shortlist shared by search, detail and other open tabs. */
export function useWatchlist() {
  const [ids, setIds] = useState(loadWatchlistIds);
  useEffect(() => {
    const refresh = () => setIds(loadWatchlistIds());
    window.addEventListener(WATCHLIST_CHANGE, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(WATCHLIST_CHANGE, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const toggle = useCallback((id: number) => {
    const result = toggleWatchlistId(loadWatchlistIds(), id);
    if (result.blocked) return { saved: false, blocked: true, error: false };
    if (!saveWatchlistIds(result.ids)) return { saved: false, blocked: false, error: true };
    return { saved: result.ids.includes(id), blocked: false, error: false };
  }, []);
  return { ids, toggle };
}

export function toggleWatchlistId(currentIds: number[], listingId: number, maxSize = 48): { ids: number[]; blocked: boolean } {
  if (currentIds.includes(listingId)) {
    return {
      ids: currentIds.filter((id) => id !== listingId),
      blocked: false,
    };
  }

  if (currentIds.length >= maxSize) {
    return {
      ids: currentIds,
      blocked: true,
    };
  }

  return {
    ids: [...currentIds, listingId],
    blocked: false,
  };
}
