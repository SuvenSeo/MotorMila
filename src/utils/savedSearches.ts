import type { FilterState } from "@/types/car";

export interface SavedSearch {
  id: string;
  name: string;
  createdAt: string;
  filters: Partial<FilterState>;
}

const STORAGE_KEY = "motormila:saved-searches:v1";
export const MAX_SAVED_SEARCHES = 20;

/** Filter keys that round-trip through share URLs. */
const SHARE_KEYS: (keyof FilterState)[] = [
  "q",
  "source",
  "make",
  "model",
  "year_min",
  "year_max",
  "condition",
  "body_type",
  "mileage_max",
  "price_min",
  "price_max",
  "transmission",
  "fuel_type",
  "district",
  "vehicle_category",
  "price_availability",
  "sort",
  "page",
];

const NUMERIC_KEYS: (keyof FilterState)[] = [
  "year_min",
  "year_max",
  "mileage_max",
  "price_min",
  "price_max",
  "page",
];

function makeId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    // fall through to timestamp fallback
  }
  return `ss-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function readAll(): SavedSearch[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is SavedSearch =>
        typeof row === "object" &&
        row !== null &&
        typeof (row as SavedSearch).id === "string" &&
        typeof (row as SavedSearch).filters === "object",
    );
  } catch {
    return [];
  }
}

function writeAll(rows: SavedSearch[]): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // Quota / privacy mode — saved searches simply don't persist.
  }
}

function cleanFilters(filters: Partial<FilterState>): Partial<FilterState> {
  const next: Partial<FilterState> = {};
  for (const key of SHARE_KEYS) {
    const value = filters[key];
    if (value === undefined || value === null || value === "") continue;
    (next as Record<string, unknown>)[key] = value;
  }
  return next;
}

/** All saved filter combos, newest first. */
export function listSavedSearches(): SavedSearch[] {
  return readAll().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Save a filter combo under a display name. Returns the created entry. */
export function saveSavedSearch(name: string, filters: Partial<FilterState>): SavedSearch {
  const entry: SavedSearch = {
    id: makeId(),
    name: name.trim() || "Untitled search",
    createdAt: new Date().toISOString(),
    filters: cleanFilters(filters),
  };
  const rows = [entry, ...readAll()].slice(0, MAX_SAVED_SEARCHES);
  writeAll(rows);
  return entry;
}

/** Delete one saved search by id. Returns true when something was removed. */
export function deleteSavedSearch(id: string): boolean {
  const rows = readAll();
  const next = rows.filter((row) => row.id !== id);
  if (next.length === rows.length) return false;
  writeAll(next);
  return true;
}

/** Encode a filter combo as a shareable URL (path + query string). */
export function buildSavedSearchUrl(filters: Partial<FilterState>, basePath = "/"): string {
  const params = new URLSearchParams();
  const clean = cleanFilters(filters);
  for (const key of SHARE_KEYS) {
    const value = clean[key];
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Parse a share URL (or bare query string) back into filter state. */
export function parseSavedSearchFromUrl(search: string): Partial<FilterState> {
  const query = search.includes("?") ? search.slice(search.indexOf("?") + 1) : search;
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const filters: Partial<FilterState> = {};
  for (const key of SHARE_KEYS) {
    const raw = params.get(key);
    if (raw === null || raw === "") continue;
    if ((NUMERIC_KEYS as string[]).includes(key)) {
      const num = Number(raw);
      if (Number.isFinite(num)) (filters as Record<string, unknown>)[key] = num;
    } else {
      (filters as Record<string, unknown>)[key] = raw;
    }
  }
  return filters;
}
