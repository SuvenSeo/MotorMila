/**
 * Canonical LKR price formatting for MotorMila.
 *
 * Sri Lankans talk about vehicle prices in lakhs ("85 lakhs") and, for
 * bigger tickets, millions ("12.5 Mn"). One lakh = 100,000 LKR; 100 lakhs =
 * 10 million. Rules (UI refresh, Oct 2026):
 *
 *  - Compact (cards, chips, lists):  < 1 lakh  → "Rs 85,400"
 *                                    < 100 L   → "Rs 85 L" / "Rs 72.5 L"
 *                                    ≥ 100 L   → "Rs 12.5 Mn"
 *  - Full (detail pages, receipts):  "Rs 7,250,000"
 *  - Monthly (instalments/costs):    "Rs 85,400/mo"
 *  - Axis ticks (charts):            "85 L" / "12 Mn" (no "Rs", short)
 *
 * Never show cents anywhere: every output is rounded to whole rupees.
 * Every function returns `fallback` ("N/A" unless overridden) for null,
 * undefined, NaN, or ±Infinity.
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

/**
 * Number part of a compact price without the "Rs " prefix:
 * 8_500_000 → "85 L", 7_250_000 → "72.5 L", 12_500_000 → "12.5 Mn",
 * 85_400 → "85,400".
 */
export function compactLkrAmount(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs < LAKH) return sign + groupThousands(abs);
  if (abs < LAKH_TO_MN_THRESHOLD) {
    const lakhs = abs / LAKH;
    // 99.96 L would round up to "100 L" — promote it to Mn instead.
    if (Number(lakhs.toFixed(1)) >= 100) return `${sign}${trimDecimals((abs / MILLION).toFixed(2))} Mn`;
    return `${sign}${trimDecimals(lakhs.toFixed(1))} L`;
  }
  return `${sign}${trimDecimals((abs / MILLION).toFixed(2))} Mn`;
}

/** Compact price for cards and lists: "Rs 85 L", "Rs 12.5 Mn", "Rs 85,400". */
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

/** Short chart-axis tick: "85 L", "12 Mn", "50,000". Whole-number lakhs/Mn where possible. */
export function formatLkrAxis(value: Num, fallback = ""): string {
  const n = toFinite(value);
  if (n === null) return fallback;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs === 0) return "0";
  if (abs < LAKH) return sign + groupThousands(abs);
  if (abs < LAKH_TO_MN_THRESHOLD) {
    const l = abs / LAKH;
    return `${sign}${trimDecimals(l.toFixed(l < 10 ? 1 : 0))} L`;
  }
  const mn = abs / MILLION;
  return `${sign}${trimDecimals(mn.toFixed(mn < 100 ? 1 : 0))} Mn`;
}

/** Axis tick when the series is already expressed in millions (e.g. 7.9 → "79 L"). */
export function formatLkrAxisFromMillions(valueInMillions: Num, fallback = ""): string {
  const n = toFinite(valueInMillions);
  if (n === null) return fallback;
  return formatLkrAxis(n * MILLION, fallback);
}

/** Price range label for chips: "Rs 30 L – Rs 50 L", "Under Rs 30 L", "Rs 1 Mn+". */
export function formatLkrRange(min: Num, max: Num, fallback = "Any price"): string {
  const lo = toFinite(min);
  const hi = toFinite(max);
  if (lo === null && hi === null) return fallback;
  if (lo === null) return `Under ${formatLkrCompact(hi)}`;
  if (hi === null) return `${formatLkrCompact(lo)}+`;
  return `${formatLkrCompact(lo)} – ${formatLkrCompact(hi)}`;
}
