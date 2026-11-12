/** Pure helpers for the search empty state. */
import { SL_DISTRICT_COORDS, normalizeDistrictName } from "@/data/districts";

/** The `count` districts whose centres are closest to `district` (haversine-free: fine at island scale). */
export function nearbyDistricts(district: string | null | undefined, count = 3): string[] {
  const name = normalizeDistrictName(district);
  const origin = name ? SL_DISTRICT_COORDS[name] : undefined;
  if (!name || !origin) return [];
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  return Object.entries(SL_DISTRICT_COORDS)
    .filter(([other]) => other !== name)
    .map(([other, c]) => ({ other, d: Math.hypot(c.lat - origin.lat, (c.lng - origin.lng) * cosLat) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((row) => row.other);
}

/** Widen a price window by ~20% each side, rounded to the nearest lakh. */
export function widenPrice(min?: number, max?: number): { price_min?: number; price_max?: number } {
  const round = (v: number) => Math.max(100_000, Math.round(v / 100_000) * 100_000);
  return {
    price_min: min ? round(min * 0.8) : undefined,
    price_max: max ? round(max * 1.2) : undefined,
  };
}

/** Page numbers to show: first, last, current ±1, with "…" gaps. */
export function paginationItems(page: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const set = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const pages = [...set].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}
