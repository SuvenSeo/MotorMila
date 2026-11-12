/**
 * Search filters ⇄ URL query string.
 *
 * The URL is the single source of truth for the market feed's filters, sort
 * and page, so a search is shareable and the browser Back button steps back
 * through discrete changes (we push a history entry per change; `replace`
 * is only for normalisation). Small hand-rolled hook instead of nuqs: one
 * object-shaped state, no new dependency, and it works on any route — the
 * pathname and hash are preserved, so it is safe on "/" (with "#market")
 * and on hub routes like /cars/toyota/aqua.
 */
import { useCallback, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { FilterState, SortOption, VehicleCategory } from "@/types/car";

export const DEFAULT_SORT: SortOption = "best_match";

export const SORT_VALUES: readonly SortOption[] = [
  "best_match",
  "newest",
  "oldest",
  "deal_score",
  "price_asc",
  "price_desc",
  "mileage_asc",
] as const;

const VEHICLE_CATEGORIES = new Set<VehicleCategory>([
  "cars",
  "motorbikes",
  "three-wheelers",
  "vans",
  "buses",
  "lorries",
  "heavy-duty",
  "tractors",
  "bicycles",
  "boats",
  "others",
]);

/** Query keys owned by the search state. Anything else (utm_*, ref…) is left alone. */
export const FILTER_PARAM_KEYS = [
  "q",
  "source",
  "make",
  "model",
  "year_min",
  "year_max",
  "price_min",
  "price_max",
  "mileage_max",
  "condition",
  "body_type",
  "transmission",
  "fuel_type",
  "district",
  "vehicle_category",
  "price_availability",
  "fresh_24h",
  "include_archive",
  "sort",
  "page",
] as const;

export const EMPTY_FILTERS: FilterState = { sort: DEFAULT_SORT, page: 1, vehicle_category: "cars" };

function parseOptionalNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function isSortValue(value: string | null | undefined): value is SortOption {
  return value != null && (SORT_VALUES as readonly string[]).includes(value);
}

export function normalizeSourceValue(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const compactValue = value.trim().toLowerCase().replace(/[-_.\s]/g, "");
  if (!compactValue) return undefined;
  if (compactValue.startsWith("ikman")) return "ikman";
  if (compactValue.startsWith("riyasewana")) return "riyasewana";
  if (["autolanka", "autolankacom", "autolankasite", "autolankalk"].includes(compactValue)) return "autolanka";
  if (compactValue.startsWith("autodirect")) return "autodirect";
  if (compactValue.startsWith("patpat")) return "patpat";
  if (compactValue.startsWith("autostream")) return "autostream";
  if (compactValue.startsWith("carshop")) return "carshop";
  if (["saleme", "salemelk"].includes(compactValue)) return "saleme";
  if (["riyahub", "riyahublk"].includes(compactValue)) return "riyahub";
  if (["dimo", "carsatdimo", "dimoautomobiles"].includes(compactValue)) return "dimo";
  return value.trim().toLowerCase();
}

export function parseFiltersFromParams(params: URLSearchParams): FilterState {
  const sort = params.get("sort");
  const vehicleCategory = params.get("vehicle_category") as VehicleCategory | null;
  return {
    q: params.get("q") || undefined,
    source: normalizeSourceValue(params.get("source")),
    make: params.get("make") || undefined,
    model: params.get("model") || undefined,
    year_min: parseOptionalNumber(params.get("year_min")),
    year_max: parseOptionalNumber(params.get("year_max")),
    price_min: parseOptionalNumber(params.get("price_min")),
    price_max: parseOptionalNumber(params.get("price_max")),
    mileage_max: parseOptionalNumber(params.get("mileage_max")),
    condition: (params.get("condition") as FilterState["condition"]) || undefined,
    body_type: (params.get("body_type") as FilterState["body_type"]) || undefined,
    transmission: (params.get("transmission") as FilterState["transmission"]) || undefined,
    fuel_type: (params.get("fuel_type") as FilterState["fuel_type"]) || undefined,
    district: params.get("district") || undefined,
    vehicle_category: vehicleCategory && VEHICLE_CATEGORIES.has(vehicleCategory) ? vehicleCategory : "cars",
    price_availability: params.get("price_availability") === "unavailable" ? "unavailable" : undefined,
    fresh_24h: params.get("fresh_24h") === "1" ? true : undefined,
    include_archive: params.get("include_archive") === "1" || params.get("include_archive") === "true" ? true : undefined,
    sort: isSortValue(sort) ? sort : DEFAULT_SORT,
    page: Math.max(1, Math.floor(parseOptionalNumber(params.get("page")) || 1)),
  };
}

/**
 * Write filters into a copy of `base` (non-filter params are kept). Defaults
 * are omitted so the canonical URL for "everything" is just the path.
 */
export function serializeFiltersToParams(filters: FilterState, base?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(base);
  for (const key of FILTER_PARAM_KEYS) params.delete(key);
  const set = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === "" || value === false) return;
    params.set(key, String(value));
  };
  set("q", filters.q);
  set("source", filters.source);
  set("make", filters.make);
  set("model", filters.model);
  set("year_min", filters.year_min);
  set("year_max", filters.year_max);
  set("price_min", filters.price_min);
  set("price_max", filters.price_max);
  set("mileage_max", filters.mileage_max);
  set("condition", filters.condition);
  set("body_type", filters.body_type);
  set("transmission", filters.transmission);
  set("fuel_type", filters.fuel_type);
  set("district", filters.district);
  if (filters.vehicle_category && filters.vehicle_category !== "cars") set("vehicle_category", filters.vehicle_category);
  if (filters.price_availability === "unavailable") set("price_availability", "unavailable");
  if (filters.fresh_24h) set("fresh_24h", "1");
  if (filters.include_archive) set("include_archive", "1");
  if (filters.sort && filters.sort !== DEFAULT_SORT) set("sort", filters.sort);
  if (filters.page > 1) set("page", filters.page);
  return params;
}

export type FiltersUpdate = FilterState | ((prev: FilterState) => FilterState);

export interface SetFiltersOptions {
  /** Replace the current history entry instead of pushing (normalisation only). */
  replace?: boolean;
}

/**
 * URL-backed filter state. Each discrete change pushes a history entry so
 * Back undoes it; pass `{ replace: true }` for corrections the user should
 * not have to step back through.
 */
export function useSearchFilters(): [FilterState, (next: FiltersUpdate, opts?: SetFiltersOptions) => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef(location);
  locationRef.current = location;

  const filters = useMemo(() => parseFiltersFromParams(new URLSearchParams(location.search)), [location.search]);

  const setFilters = useCallback(
    (next: FiltersUpdate, opts?: SetFiltersOptions) => {
      const loc = locationRef.current;
      const currentParams = new URLSearchParams(loc.search);
      const current = parseFiltersFromParams(currentParams);
      const resolved = typeof next === "function" ? next(current) : next;
      const params = serializeFiltersToParams(resolved, currentParams);
      const search = params.toString();
      if (search === currentParams.toString()) return;
      const nextSearch = search ? `?${search}` : "";
      navigate(
        { pathname: loc.pathname, search: nextSearch, hash: loc.hash },
        { replace: Boolean(opts?.replace), preventScrollReset: true },
      );
      // Keep functional updates chained in the same tick consistent.
      locationRef.current = { ...loc, search: nextSearch };
    },
    [navigate],
  );

  return [filters, setFilters];
}
