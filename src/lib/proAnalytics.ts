/**
 * Pro workspace analytics — pure derivations shared by every desk panel.
 *
 * Nothing here fetches, formats for a locale, or knows about React: these are
 * the numbers behind "a delta, a baseline and an n beside every value". Every
 * function returns `null` rather than inventing a figure from a thin sample, so
 * the UI can say "no data" honestly.
 */

export type MonthPoint = {
  month: string;
  median_price_lkr?: number | null;
  avg_price_lkr?: number | null;
  listing_count?: number | null;
};

/** Below this many listings a figure is shown flagged, never silently trusted. */
export const THIN_SAMPLE = 5;
/** Movement smaller than this is called flat, not "up" or "down". */
export const FLAT_BAND_PCT = 1.5;

/** (current - previous) / previous * 100, or null when either side is unusable. */
export function pctChange(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** How far a value sits from a baseline, as a percentage of the baseline. */
export function relativeTo(value: number | null | undefined, baseline: number | null | undefined): number | null {
  return pctChange(value, baseline);
}

/** Share of the sample at or below `value`, 0–100. Null under two values. */
export function percentileRank(value: number | null | undefined, values: Array<number | null | undefined>): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const sample = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (sample.length < 2) return null;
  const below = sample.filter((v) => v < value).length;
  const equal = sample.filter((v) => v === value).length;
  return ((below + equal / 2) / sample.length) * 100;
}

/** 1-based rank where 1 is the largest value. */
export function rankOf(value: number | null | undefined, values: Array<number | null | undefined>): { rank: number; total: number } | null {
  if (value == null || !Number.isFinite(value)) return null;
  const sample = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (sample.length < 2) return null;
  return { rank: sample.filter((v) => v > value).length + 1, total: sample.length };
}

/** Position of a price inside a min–max band, clamped to 0–1. */
export function pricePosition(
  price: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
): number | null {
  if (price == null || min == null || max == null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  return clamp01((price - min) / (max - min));
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function isThinSample(count: number | null | undefined, minimum = THIN_SAMPLE): boolean {
  return (count ?? 0) < minimum;
}

export type Momentum = "rising" | "falling" | "flat";

export function momentum(pct: number | null | undefined): Momentum | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (pct > FLAT_BAND_PCT) return "rising";
  if (pct < -FLAT_BAND_PCT) return "falling";
  return "flat";
}

/**
 * Change from the oldest usable point in a monthly series to the newest, with
 * the window it covers. Used for "median price, last N months".
 */
export function trendChange(
  points: MonthPoint[] | null | undefined,
  field: "median_price_lkr" | "avg_price_lkr" = "median_price_lkr",
): { pct: number | null; from: number; to: number; months: number; fromMonth: string; toMonth: string } | null {
  const usable = (points ?? []).filter((p) => {
    const value = p[field];
    return value != null && Number.isFinite(value) && value > 0;
  });
  if (usable.length < 2) return null;
  const first = usable[0];
  const last = usable[usable.length - 1];
  const from = first[field] as number;
  const to = last[field] as number;
  return { pct: pctChange(to, from), from, to, months: usable.length - 1, fromMonth: first.month, toMonth: last.month };
}

/** Numeric series for a sparkline, nulls dropped so a gap never draws to zero. */
export function sparkValues(points: MonthPoint[] | null | undefined, field: "median_price_lkr" | "avg_price_lkr" = "median_price_lkr"): number[] {
  return (points ?? [])
    .map((p) => p[field])
    .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
}

/** Evenly spaced price bands over a sorted sample, for a histogram or a decile strip. */
export function priceBands(
  values: Array<number | null | undefined>,
  count = 10,
): Array<{ label: string; low_lkr: number; high_lkr: number; count: number }> {
  const sample = values.filter((v): v is number => v != null && Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (sample.length === 0 || count < 2) return [];
  const min = sample[0];
  const max = sample[sample.length - 1];
  const step = (max - min) / count;
  if (step <= 0) {
    return [{ label: "D1", low_lkr: min, high_lkr: max, count: sample.length }];
  }
  return Array.from({ length: count }, (_, i) => {
    const low = min + step * i;
    const high = i === count - 1 ? max : min + step * (i + 1);
    const inBand = sample.filter((v) => (i === count - 1 ? v >= low : v >= low && v < high)).length;
    return { label: `D${i + 1}`, low_lkr: low, high_lkr: high, count: inBand };
  });
}

/** Days between an ISO timestamp and now; null for a missing or unparseable value. */
export function daysSince(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((now - at) / 86_400_000));
}

export type Freshness = "live" | "fresh" | "stale" | "unknown";

/** How much to trust a timestamp: same-day, this week, older, or absent. */
export function freshness(iso: string | null | undefined, now: number = Date.now()): Freshness {
  const days = daysSince(iso, now);
  if (days == null) return "unknown";
  if (days <= 0) return "live";
  if (days <= 2) return "fresh";
  return "stale";
}

/** Signed percentage, always with a sign so a reader never guesses direction. */
export function formatSignedPct(pct: number | null | undefined, digits = 1): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  const rounded = Number(pct.toFixed(digits));
  if (rounded === 0) return `0${digits > 0 ? `.${"0".repeat(digits)}` : ""}%`;
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(digits)}%`;
}

/** Whole-number percentage for share rows (0–100). */
export function formatShare(share: number | null | undefined, digits = 1): string | null {
  if (share == null || !Number.isFinite(share)) return null;
  return `${share.toFixed(digits)}%`;
}

/** Rescale a series into 0–1 for a sparkline, keeping a flat line flat and mid-height. */
export function normalize(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
}

/** Trailing average, shortened rather than padded, so the line never dips to zero at the start. */
export function movingAverage(values: number[], window: number): number[] {
  if (window < 2 || values.length < window) return values.slice();
  return values.slice(window - 1).map((_, i) => {
    const slice = values.slice(i, i + window);
    return slice.reduce((sum, v) => sum + v, 0) / slice.length;
  });
}

/** Buckets a monthly series into the trailing N months (default all). */
export function lastMonths<T extends { month: string }>(points: T[], months: number | null): T[] {
  if (months == null || points.length <= months) return points;
  return points.slice(points.length - months);
}

/**
 * Change over the trailing N months of a monthly series whose key is either
 * `month` or `period` (the index uses `period`). `monthsBack = null` compares
 * against the whole series.
 */
export function changeOverMonths<T extends { month?: string; period?: string; median_price_lkr?: number | null }>(
  points: T[] | null | undefined,
  monthsBack: number | null,
): number | null {
  const usable = (points ?? []).filter((p) => p.median_price_lkr != null && Number.isFinite(p.median_price_lkr) && (p.median_price_lkr as number) > 0);
  if (usable.length < 2) return null;
  const last = usable[usable.length - 1].median_price_lkr as number;
  const baseIndex = monthsBack == null ? 0 : Math.max(0, usable.length - 1 - monthsBack);
  const base = usable[baseIndex].median_price_lkr as number;
  return pctChange(last, base);
}
