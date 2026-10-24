/**
 * Data-sanity guards for market-data surfaces (price cuts, ticker, districts,
 * US-only research). These run at the display boundary so a scrape/parse bug
 * upstream never reaches the UI as a "−90% price cut".
 *
 * Pure functions only — covered by src/lib/dataSanity.test.ts.
 */

import { detectLeaseTakeover } from "@/lib/leaseTakeover";
import { compactLkrAmount, formatLkrFull } from "@/lib/price";

/** A drop of this size or larger is treated as suspect unless independently confirmed. */
export const MAX_UNCONFIRMED_DROP_PCT = 50;
/** Price points (scans) needed to confirm a suspect drop. */
export const MIN_CONFIRMING_POINTS = 2;

/**
 * Lease-takeover / installment-transfer ads list the balance or the down
 * payment, not the vehicle price, so a "cut" from one is meaningless. Uses the
 * shared detector in src/lib/leaseTakeover.ts (one source of truth with the
 * listing card/detail badge).
 */
export function looksLikeLeaseTakeover(...texts: Array<string | null | undefined>): boolean {
  return detectLeaseTakeover(texts).isLeaseTakeover;
}

/**
 * True when two prices differ by (almost exactly) a power of ten — the
 * signature of a lakhs/millions/rupees unit mismatch (e.g. "65" lakhs parsed
 * as Rs 6.5M one scan and Rs 650,000 the next, or 6.5 read as millions vs
 * lakhs). Tolerance is ±4% around 10×, 100×, 1000×, 100000×.
 */
export function isUnitMismatch(a: number, b: number): boolean {
  if (!(a > 0) || !(b > 0)) return false;
  const ratio = Math.max(a, b) / Math.min(a, b);
  for (const factor of [10, 100, 1_000, 10_000, 100_000, 1_000_000]) {
    if (Math.abs(ratio / factor - 1) <= 0.04) return true;
  }
  return false;
}

export interface PriceDropLike {
  previous_price_lkr: number;
  new_price_lkr: number;
  drop_pct: number;
  /** Number of scans at (about) the new price, when the API provides it. */
  confirmations?: number | null;
  listing?: {
    title?: string | null;
    description?: string | null;
    model?: string | null;
    price_type?: string | null;
  } | null;
}

export type DropRejection =
  | "invalid"
  | "not_a_drop"
  | "unit_mismatch"
  | "lease_takeover"
  | "unconfirmed_large_drop";

/**
 * Classify a price drop. Returns null when the drop is plausible, otherwise
 * the reason it must not be shown.
 */
export function rejectPriceDrop(drop: PriceDropLike): DropRejection | null {
  const prev = Number(drop.previous_price_lkr);
  const next = Number(drop.new_price_lkr);
  if (!Number.isFinite(prev) || !Number.isFinite(next) || prev <= 0 || next <= 0) return "invalid";
  if (next >= prev) return "not_a_drop";
  if (isUnitMismatch(prev, next)) return "unit_mismatch";
  const l = drop.listing;
  if (l && (looksLikeLeaseTakeover(l.title, l.description, l.model) || /lease|takeover/i.test(String(l.price_type || "")))) {
    return "lease_takeover";
  }
  const pct = ((prev - next) / prev) * 100;
  // ">=": an exact −50.0% (e.g. 1.0M → 500k) is the classic half-price parse
  // bug; also catch any new price below half the old one independent of the
  // (possibly rounded) percentage.
  const suspect = pct >= MAX_UNCONFIRMED_DROP_PCT || next < prev * 0.5;
  if (suspect && Number(drop.confirmations || 0) < MIN_CONFIRMING_POINTS) {
    return "unconfirmed_large_drop";
  }
  return null;
}

export function isPlausiblePriceDrop(drop: PriceDropLike): boolean {
  return rejectPriceDrop(drop) === null;
}

/**
 * Recompute the drop % from the two prices (the API value is sometimes
 * rounded oddly or out of sync) — one decimal, never negative.
 */
export function computedDropPct(prev: number, next: number): number {
  if (!(prev > 0) || !(next >= 0) || next >= prev) return 0;
  return Math.round(((prev - next) / prev) * 1000) / 10;
}

/* ── Districts ─────────────────────────────────────────────────────────── */

const COUNTRY_LEVEL_DISTRICT_RE =
  /^(sri\s*lanka|lanka|lk|srilanka|all\s*(of\s*)?(sri\s*lanka|island)|island\s*-?\s*wide|islandwide|any|n\/?a|unknown|other|none|-+)$/i;

/** "Sri Lanka", "Island-wide", "LK" … are not districts — treat as unknown. */
export function isCountryLevelDistrict(value: unknown): boolean {
  if (value == null) return true;
  const s = String(value).trim().replace(/[_]+/g, " ").replace(/\s+/g, " ");
  return s.length === 0 || COUNTRY_LEVEL_DISTRICT_RE.test(s);
}

/** Returns the trimmed district, or null when it is country-level / empty. */
export function cleanDistrict(value: unknown): string | null {
  return isCountryLevelDistrict(value) ? null : String(value).trim();
}

/* ── VIN / US-market research gate ─────────────────────────────────────── */

/**
 * A US-market vehicle carries a 17-character ISO 3779 VIN (no I, O, Q).
 * JDM / recon imports usually carry a short chassis number (e.g. "NHP10-1234567"),
 * for which US NHTSA recalls/catalogs are not applicable.
 */
export function isUsStyleVin(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim().toUpperCase();
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(v);
}

/* ── Ticker / trend tone ───────────────────────────────────────────────── */

export const STABLE_BAND_PCT = 1;

export type ChangeTone = "up" | "down" | "stable";

/** |Δ| < 1% is "stable" (neutral grey); otherwise up/down. */
export function changeTone(pct: number | null | undefined): ChangeTone {
  const n = Number(pct);
  if (!Number.isFinite(n) || Math.abs(n) < STABLE_BAND_PCT) return "stable";
  return n > 0 ? "up" : "down";
}

/**
 * Buyer-neutral palette: price up = amber, price down = green, stable = grey.
 * Returned as Tailwind classes for text/chip and a CSS color for charts.
 */
export const TONE_STYLES: Record<ChangeTone, { text: string; chip: string; stroke: string }> = {
  // Semantic deal tokens (styles/tokens.css): rising prices read as caution,
  // falling as good for a buyer, flat as the neutral fair tone.
  up: {
    text: "text-deal-caution-text",
    chip: "bg-deal-caution/10 text-deal-caution-text",
    stroke: "hsl(var(--deal-caution))",
  },
  down: {
    text: "text-deal-good-text",
    chip: "bg-deal-good/10 text-deal-good-text",
    stroke: "hsl(var(--deal-good))",
  },
  stable: {
    text: "text-label-2",
    chip: "bg-foreground/[0.05] text-label-2",
    stroke: "hsl(var(--deal-fair))",
  },
};

/** Percent with one decimal and an explicit sign; "0.0%" for stable rounding. */
export function formatChangePct(pct: number): string {
  if (!Number.isFinite(pct)) return "—";
  const r = Math.round(pct * 10) / 10;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(1)}%`;
}

/* ── Chart scales ──────────────────────────────────────────────────────── */

/**
 * Padded y-domain that does NOT force zero: [min − pad, max + pad] rounded to
 * a "nice" step so a 7.6–8.0M series fills the chart instead of hugging the top.
 */
export function paddedDomain(values: number[], padFraction = 0.12): [number, number] | null {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return null;
  let min = Math.min(...clean);
  let max = Math.max(...clean);
  if (min === max) {
    const bump = Math.abs(min) * 0.05 || 1;
    min -= bump;
    max += bump;
  }
  const pad = (max - min) * padFraction;
  const rawMin = min - pad;
  const rawMax = max + pad;
  const step = niceStep((rawMax - rawMin) / 4);
  const lo = Math.floor(rawMin / step) * step;
  const hi = Math.ceil(rawMax / step) * step;
  return [Math.max(0, lo), hi];
}

function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const f = raw / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * base;
}

/**
 * Short millions label via the canonical formatter (src/lib/price.ts):
 * 7,650,000 → "7.65 Mn", 12,000,000 → "12 Mn", 450,000 → "0.45 Mn".
 */
export function formatMnShort(lkr: number): string {
  if (!Number.isFinite(lkr)) return "";
  return compactLkrAmount(lkr);
}

/** Whole-rupee LKR (no cents) for ticker/price display — canonical "Rs 477,589". */
export function formatLkrWhole(v: number): string {
  return formatLkrFull(v, "—");
}

/** VIN / chassis number off a listing payload, if the source exposed one. */
export function listingVin(listing: unknown): string | null {
  if (!listing || typeof listing !== "object") return null;
  const r = listing as Record<string, unknown>;
  for (const key of ["vin", "chassis_number", "chassis_no", "chassis"]) {
    const v = r[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}
