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

export function saveWatchlistIds(ids: number[]): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(WATCHLIST_KEY, JSON.stringify(normalizeIds(ids)));
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
