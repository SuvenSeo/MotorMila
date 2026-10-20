/**
 * Canonical LKR price formatting for MotorMila.
 *
 * Rules (Oct 20 2026 — millions only, site-wide):
 *
 *  - Compact (cards, chips, lists, charts, badges): always millions,
 *    up to 2 decimals, trailing zeros trimmed:
 *         85,400 → "Rs 0.085 Mn" (under 0.1 Mn: 2 significant digits)
 *        350,000 → "Rs 0.35 Mn"   8,500,000 → "Rs 8.5 Mn"
 *      7,250,000 → "Rs 7.25 Mn"  12,500,000 → "Rs 12.5 Mn"
 *    Amounts under Rs 10,000 (would round to 0.00 Mn) stay full: "Rs 5,000".
 *  - Full (listing detail page, receipts): "Rs 7,250,000"
 *  - Monthly (instalments/costs):          "Rs 85,400/mo"
 *  - Axis ticks (charts):                  "8.5 Mn" (no "Rs", short)
 *
 * Lakhs are never displayed. Inputs may still be typed in lakhs ("85L") —
 * see priceParse.ts. Every function returns `fallback` ("N/A" unless
 * overridden) for null, undefined, NaN, or ±Infinity.
 */

export const LAKH = 100_000;
export const MILLION = 1_000_000;
/** 100 lakhs = 10 million: the switch-over point from "L" to "Mn". */
export const LAKH_TO_MN_THRESHOLD = 100 * LAKH;

const DEFAULT_FALLBACK = "N/A";

type Num = number | string | null | undefined;

function toFinite(value: Num): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** "7250000" → "7,250,000". Whole rupees only, en-US grouping (3-digit, as LK ads use). */
export function groupThousands(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Trim a fixed-decimal string: "85.0" → "85", "12.50" → "12.5". */
function trimDecimals(fixed: string): string {
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

/** Below this, millions would round to "0 Mn": show full rupees instead. */
export const MN_DISPLAY_MIN = 10_000;

/**
 * Number part of a compact price without the "Rs " prefix, in millions:
 * 350_000 → "0.35 Mn", 8_500_000 → "8.5 Mn", 12_500_000 → "12.5 Mn",
 * 5_000 → "5,000".
 */
export function compactLkrAmount(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs < MN_DISPLAY_MIN) return sign + groupThousands(abs);
  return `${sign}${mnNumber(abs)} Mn`;
}

/** Millions as a trimmed decimal string: 2 decimals ("8.5", "0.35", "12.75");
 * under 0.1 Mn, 2 significant digits so small amounts keep meaning ("0.085"). */
export function mnNumber(absLkr: number): string {
  const mn = absLkr / MILLION;
  if (mn < 0.095) return trimDecimals(Number(mn.toPrecision(2)).toFixed(3));
  return trimDecimals(mn.toFixed(2));
}

/** Compact price for cards and lists: "Rs 0.35 Mn", "Rs 8.5 Mn", "Rs 12.5 Mn". */
export function formatLkrCompact(value: Num, fallback = DEFAULT_FALLBACK): string {
  const n = toFinite(value);
  if (n === null) return fallback;
  return `Rs ${compactLkrAmount(n)}`;
}

/** Full price for detail pages: "Rs 7,250,000". */
export function formatLkrFull(value: Num, fallback = DEFAULT_FALLBACK): string {
  const n = toFinite(value);
  if (n === null) return fallback;
  return `Rs ${groupThousands(n)}`;
}

/** Monthly payment / running cost: "Rs 85,400/mo". Never "Rs 0.09M". */
export function formatLkrMonthly(value: Num, fallback = DEFAULT_FALLBACK): string {
  const n = toFinite(value);
  if (n === null) return fallback;
  return `Rs ${groupThousands(n)}/mo`;
}

/** Short chart-axis tick, millions only: "0.35 Mn", "8.5 Mn", "12 Mn". */
export function formatLkrAxis(value: Num, fallback = ""): string {
  const n = toFinite(value);
  if (n === null) return fallback;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs === 0) return "0";
  if (abs < MN_DISPLAY_MIN) return sign + groupThousands(abs);
  const mn = abs / MILLION;
  // Ticks stay short: 2 decimals under 10 Mn, 1 under 100 Mn, whole above.
  const num = mn < 10 ? mnNumber(abs) : trimDecimals(mn.toFixed(mn < 100 ? 1 : 0));
  return `${sign}${num} Mn`;
}

/** Axis tick when the series is already expressed in millions (e.g. 7.9 → "7.9 Mn"). */
export function formatLkrAxisFromMillions(valueInMillions: Num, fallback = ""): string {
  const n = toFinite(valueInMillions);
  if (n === null) return fallback;
  return formatLkrAxis(n * MILLION, fallback);
}

/** Price range label for chips: "Rs 3 Mn – Rs 5 Mn", "Under Rs 3 Mn", "Rs 10 Mn+". */
export function formatLkrRange(min: Num, max: Num, fallback = "Any price"): string {
  const lo = toFinite(min);
  const hi = toFinite(max);
  if (lo === null && hi === null) return fallback;
  if (lo === null) return `Under ${formatLkrCompact(hi)}`;
  if (hi === null) return `${formatLkrCompact(lo)}+`;
  return `${formatLkrCompact(lo)} – ${formatLkrCompact(hi)}`;
}
