import type { CarListing } from "@/types/car";
import { isVerdictOk, resolveListingVerdict, type PriceVerdict } from "@/lib/priceVerdict";
import { computeCashToOwn, inferFinanceClass, DEFAULT_INTEREST_RATE_PCT, DEFAULT_TERM_YEARS } from "@/lib/cashToOwn";
import { isReasonableListingPrice } from "@/lib/formatting";

/** FMV detail per listing (live endpoint or offline snapshot fallback). */
export interface CompareFmv {
  fmv: number | null;
  confidence: "high" | "medium" | "low" | "none" | null;
  comps: number | null;
  method?: string | null;
  verdict?: { status: string; reason: string | null } | null;
}

/** The one price verdict for a compare column (same as that listing's detail page). */
export function compareVerdict(l: CarListing, fmv: CompareFmv | undefined): PriceVerdict {
  return resolveListingVerdict(
    l,
    fmv ? { fmv_lkr: fmv.fmv, sample_size: fmv.comps, confidence: fmv.confidence, method: fmv.method ?? null, verdict: fmv.verdict ?? null } : null,
  );
}

export type CompareRowKey =
  | "price"
  | "fmv"
  | "vsFmv"
  | "monthly"
  | "year"
  | "mileage"
  | "condition"
  | "fuel"
  | "transmission"
  | "engine"
  | "body"
  | "district"
  | "seller"
  | "source"
  | "listed";

export type CompareGroup = "money" | "specs" | "listing";

export interface CompareRowDef {
  key: CompareRowKey;
  group: CompareGroup;
  /** Comparable raw value used for "differs" + "best" detection. */
  raw: (l: CarListing, fmv: CompareFmv | undefined) => number | string | null;
  /** Which direction is better, when it is a clear numeric win. */
  better?: "lower" | "higher";
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function askingPrice(l: CarListing): number | null {
  const p = num(l.price_lkr);
  return p !== null && isReasonableListingPrice(p) ? p : null;
}

/** FMV shown in compare — only when the verdict stands (never a number we don't trust). */
export function fmvFor(l: CarListing, fmv: CompareFmv | undefined): number | null {
  const v = compareVerdict(l, fmv);
  return isVerdictOk(v) ? v.referenceLkr : null;
}

/** Asking vs FMV in % (negative = below FMV); null when the verdict is withheld. */
export function vsFmvPct(l: CarListing, fmv: CompareFmv | undefined): number | null {
  const v = compareVerdict(l, fmv);
  return isVerdictOk(v) ? v.gapPct : null;
}

export interface MonthlyEstimate {
  monthlyLkr: number;
  downLkr: number;
  ltvPct: number;
  ratePct: number;
  termYears: number;
}

/** Planning-level monthly loan instalment at the CBSL max LTV for the car's class. */
export function monthlyEstimate(l: CarListing): MonthlyEstimate | null {
  const price = askingPrice(l);
  if (price === null) return null;
  const result = computeCashToOwn({
    priceLkr: price,
    financeClass: inferFinanceClass({ condition: l.condition, fuelType: l.fuel_type, year: l.year }),
  });
  if (!result || !(result.monthlyPaymentLkr > 0)) return null;
  return {
    monthlyLkr: result.monthlyPaymentLkr,
    downLkr: result.minCashDownLkr,
    ltvPct: Math.round(result.ltvCap * 100),
    ratePct: result.interestRatePct ?? DEFAULT_INTEREST_RATE_PCT,
    termYears: result.termYears ?? DEFAULT_TERM_YEARS,
  };
}

function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

export const COMPARE_ROWS: CompareRowDef[] = [
  { key: "price", group: "money", raw: (l) => askingPrice(l), better: "lower" },
  { key: "fmv", group: "money", raw: (l, f) => fmvFor(l, f) },
  { key: "vsFmv", group: "money", raw: (l, f) => {
    const pct = vsFmvPct(l, f);
    return pct === null ? null : Math.round(pct * 10) / 10;
  } },
  // No "best" marker on vs-FMV: the cheapest-vs-market ad is also the classic bait shape.
  { key: "monthly", group: "money", raw: (l) => monthlyEstimate(l)?.monthlyLkr ?? null, better: "lower" },
  { key: "year", group: "specs", raw: (l) => num(l.year), better: "higher" },
  { key: "mileage", group: "specs", raw: (l) => num(l.mileage_km), better: "lower" },
  { key: "condition", group: "specs", raw: (l) => l.condition || null },
  { key: "fuel", group: "specs", raw: (l) => l.fuel_type || null },
  { key: "transmission", group: "specs", raw: (l) => l.transmission || null },
  { key: "engine", group: "specs", raw: (l) => num(l.engine_cc) },
  { key: "body", group: "specs", raw: (l) => l.body_type || null },
  { key: "district", group: "listing", raw: (l) => l.district || null },
  { key: "seller", group: "listing", raw: (l) => (l.is_dealer === true ? "dealer" : l.is_dealer === false ? "private" : null) },
  { key: "source", group: "listing", raw: (l) => l.source || null },
  { key: "listed", group: "listing", raw: (l) => daysSince(l.first_seen_at) },
];

/** True when at least two listings have different known values (unknowns ignored). */
export function rowDiffers(values: Array<number | string | null>): boolean {
  const known = values.filter((v) => v !== null && v !== undefined).map((v) => String(v).toLowerCase());
  if (known.length < 2) return false;
  return new Set(known).size > 1;
}

/** Index set of the best value(s) in a row, only when the row differs. */
export function bestIndexes(values: Array<number | string | null>, better?: "lower" | "higher"): Set<number> {
  const out = new Set<number>();
  if (!better || !rowDiffers(values)) return out;
  const nums = values.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
  const known = nums.filter((v): v is number => v !== null);
  if (known.length < 2) return out;
  const target = better === "lower" ? Math.min(...known) : Math.max(...known);
  nums.forEach((v, i) => {
    if (v === target) out.add(i);
  });
  return out;
}
