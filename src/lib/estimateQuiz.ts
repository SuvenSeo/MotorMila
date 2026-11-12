/**
 * Valuation quiz (/estimate) — pure logic.
 *
 * The market range always comes from comparable asking prices (live
 * estimate API, else snapshot comps through the offline FMV engine). The
 * condition quiz never changes those numbers: it only says where in the
 * range this particular car is likely to sit, and flags what buyers will
 * check. That keeps the figures honest — we have no data to price an
 * accident or a flood in rupees.
 */
import type { CarListing, PriceEstimate } from "@/types/car";
import { predictFmvOffline } from "@/lib/offlineValuation";

export type Registration = "brand_new" | "reconditioned" | "used";

export interface QuizAnswers {
  accidents?: "none" | "minor" | "major";
  service?: "full" | "partial" | "none";
  owners?: "1" | "2" | "3plus";
  flood?: "no" | "unsure" | "yes";
  mods?: "none" | "minor" | "major";
}

export const QUIZ_QUESTIONS = ["accidents", "service", "owners", "flood", "mods"] as const;
export type QuizQuestion = (typeof QUIZ_QUESTIONS)[number];

export type RangePosition = "upper" | "middle" | "lower";

export interface QuizFlag {
  key: QuizQuestion;
  severity: "high" | "medium";
}

/** Rule-of-thumb points; only used to pick a third of the market range. */
const POINTS: { [K in QuizQuestion]: Record<NonNullable<QuizAnswers[K]>, number> } = {
  accidents: { none: 1, minor: -1, major: -3 },
  service: { full: 1, partial: 0, none: -1 },
  owners: { "1": 1, "2": 0, "3plus": -1 },
  flood: { no: 0, unsure: -1, yes: -4 },
  mods: { none: 0, minor: 0, major: -1 },
};

export function scoreAnswers(answers: QuizAnswers): number {
  let total = 0;
  for (const q of QUIZ_QUESTIONS) {
    const a = answers[q];
    if (a) total += (POINTS[q] as Record<string, number>)[a] ?? 0;
  }
  return total;
}

export function rangePosition(answers: QuizAnswers): RangePosition {
  // Any serious red flag caps the position at the bottom third.
  if (answers.flood === "yes" || answers.accidents === "major") return "lower";
  const s = scoreAnswers(answers);
  if (s >= 2) return "upper";
  if (s <= -2) return "lower";
  return "middle";
}

export function quizFlags(answers: QuizAnswers): QuizFlag[] {
  const flags: QuizFlag[] = [];
  if (answers.flood === "yes") flags.push({ key: "flood", severity: "high" });
  else if (answers.flood === "unsure") flags.push({ key: "flood", severity: "medium" });
  if (answers.accidents === "major") flags.push({ key: "accidents", severity: "high" });
  else if (answers.accidents === "minor") flags.push({ key: "accidents", severity: "medium" });
  if (answers.service === "none") flags.push({ key: "service", severity: "medium" });
  if (answers.mods === "major") flags.push({ key: "mods", severity: "medium" });
  if (answers.owners === "3plus") flags.push({ key: "owners", severity: "medium" });
  return flags;
}

/** The slice of [low, high] matching a position (thirds of the range). */
export function positionBand(low: number, high: number, position: RangePosition): { from: number; to: number } {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  const third = (hi - lo) / 3;
  if (position === "lower") return { from: lo, to: lo + third };
  if (position === "upper") return { from: hi - third, to: hi };
  return { from: lo + third, to: hi - third };
}

export interface EstimateProfile {
  make: string;
  model: string;
  year: number;
  mileage_km: number;
  condition: Registration;
  district?: string;
}

export type EstimateSource = "live" | "snapshot";

export interface QuizEstimate extends PriceEstimate {
  source: EstimateSource;
}

function percentile(sorted: number[], pct: number): number {
  const k = (sorted.length - 1) * pct;
  const lo = Math.floor(k);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (k - lo);
}

const MIN_SNAPSHOT_COMPS = 3;
const YEAR_WINDOW = 2;

/**
 * Snapshot fallback: offline FMV (port of backend fmv.py) for the centre,
 * and the spread (p25/p75) of same-model asking prices within ±2 years for
 * the range. Returns null when the snapshot has too few comparable ads —
 * better no number than an invented one.
 */
export function estimateFromComps(comps: CarListing[], profile: EstimateProfile): QuizEstimate | null {
  const priced = comps.filter((c) => {
    const p = Number(c.price_lkr);
    const y = Number(c.year);
    return Number.isFinite(p) && p > 0 && Number.isFinite(y) && Math.abs(y - profile.year) <= YEAR_WINDOW;
  });
  if (priced.length < MIN_SNAPSHOT_COMPS) return null;

  const target = {
    id: 0,
    make: profile.make,
    model: profile.model,
    year: profile.year,
    mileage_km: profile.mileage_km,
    condition: profile.condition,
    district: profile.district ?? "",
    price_lkr: null,
  } as unknown as CarListing;
  const fmv = predictFmvOffline(comps, target);
  const prices = priced.map((c) => Number(c.price_lkr)).sort((a, b) => a - b);
  const p50 = percentile(prices, 0.5);
  const center = fmv.fmv_lkr && fmv.fmv_lkr > 0 ? fmv.fmv_lkr : p50;
  if (!(center > 0) || !(p50 > 0)) return null;

  const lowRatio = Math.min(1, Math.max(0.7, percentile(prices, 0.25) / p50));
  const highRatio = Math.max(1, Math.min(1.35, percentile(prices, 0.75) / p50));
  const confidence: PriceEstimate["confidence"] =
    fmv.confidence === "high" || fmv.confidence === "medium" ? fmv.confidence : "low";

  return {
    low: Math.round(center * lowRatio),
    median: Math.round(center),
    high: Math.round(center * highRatio),
    currency: "LKR",
    confidence,
    comparable_count: priced.length,
    methodology: `Saved snapshot of ${priced.length} comparable asking prices (±${YEAR_WINDOW} years), offline FMV model (${fmv.method}).`,
    mileage_adjusted: true,
    source: "snapshot",
  };
}

/** True when a live result is usable (non-zero range). */
export function isUsableEstimate(e: PriceEstimate | null | undefined): e is PriceEstimate {
  return Boolean(e && e.median > 0 && e.low > 0 && e.high > 0);
}
