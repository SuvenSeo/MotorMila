/**
 * The ONE price verdict — every price judgment on the site derives from it:
 * deal badges (cards, detail, similar strip, sticky bar), the FMV card, the
 * deal ladder, Trust Check, compare rows and deal tiers.
 *
 * Port of backend/app/utils/price_verdict.py (and Android
 * core/price/PriceVerdict.kt). All three assert the same fixtures in
 * docs/price-verdict-fixtures.json — change them together.
 *
 * Input: the asking price and ONE reference (the listing's FMV estimate, or the
 * stored cohort median on surfaces that only have the listing row), plus what
 * we know about the reference's quality. Output: an `ok` verdict (band + whole
 * percent) or a `withheld` one with a reason. We withhold instead of showing
 * something that looks fake. Thresholds (docs/PRICE_VERDICT.md):
 *
 *   below ≤ −5 % · above ≥ +8 % · verify-first ≤ −35 % · withheld beyond ±60 %
 *
 * Pure functions only — covered by src/lib/priceVerdict.test.ts.
 */
import { detectLeaseTakeover } from "@/lib/leaseTakeover";

export const VERDICT_BELOW_PCT = 5;
export const VERDICT_ABOVE_PCT = 8;
export const VERIFY_BELOW_PCT = 35;
/** Beyond this gap either way the comparison itself is suspect (wrong cohort, bad price, broken estimate). */
export const MAX_PLAUSIBLE_GAP_PCT = 60;
export const MIN_COMPS = 5;

export const MAX_PLAUSIBLE_PRICE_LKR = 500_000_000;
export const DEFAULT_PRICE_FLOOR_LKR = 100_000;
/** Lowest plausible full asking price per category; below it the number is a deposit, an instalment, a part or a typo. */
export const PRICE_FLOOR_LKR: Readonly<Record<string, number>> = {
  motorbikes: 50_000,
  "three-wheelers": 100_000,
  tractors: 100_000,
  cars: 300_000,
  suvs: 300_000,
  jeeps: 300_000,
  vans: 300_000,
  wagons: 300_000,
  pickups: 300_000,
  "crew-cabs": 300_000,
  lorries: 300_000,
  "lorries-trucks": 300_000,
  trucks: 300_000,
  buses: 300_000,
  "heavy-duty": 300_000,
};

const GENERIC_MODELS = new Set(["", "other", "others", "unknown", "n/a", "na", "-", "none", "any", "various"]);
const PLACEHOLDER_RE = /^(?:1{6,}|1234(?:5(?:6(?:7(?:8(?:9)?)?)?)?)?|98765\d{0,4})$/;
const RENT_RE =
  /\b(?:for\s+(?:rent|hire)|rent\s*-?\s*a\s*-?\s*(?:car|van|cab)|on\s+rent|rentals?|per\s+(?:month|day|week)|monthly\s+(?:rent(?:al)?|payment|instal+ment)|daily\s+rental|down\s*-?\s*payment|instal+ments?\s+only)\b/i;
const PARTS_RE =
  /\b(?:(?:for|spare)\s+parts|parts\s+only|(?:body|engine|shell|chassis)\s+only|salvage|scrap(?:ped)?|wreck(?:ed)?|breaking\s+for\s+parts|dismantl\w*|accidented|accident\s+(?:damaged?|vehicle|car|bike|repair)|(?:fire|flood)\s*-?\s*damaged?|damaged\s+(?:vehicle|car|bike|van))\b/i;

export type VerdictBand = "below" | "fair" | "above";
export type VerdictConfidence = "high" | "medium" | "low" | "none";
export type WithheldReason =
  | "no_price"
  | "placeholder_price"
  | "below_price_floor"
  | "above_price_ceiling"
  | "lease_or_rent"
  | "parts_or_damaged"
  | "no_reference"
  | "thin_comps"
  | "low_confidence"
  | "generic_model"
  | "implausible_gap"
  | "unit_mismatch"
  | "estimates_disagree";
/** What the user is told (one message per group). */
export type WithheldGroup = "price_unusable" | "lease_or_rent" | "parts_or_damaged" | "insufficient_data" | "inconsistent_data";

export const REASON_GROUP: Readonly<Record<WithheldReason, WithheldGroup>> = {
  no_price: "price_unusable",
  placeholder_price: "price_unusable",
  below_price_floor: "price_unusable",
  above_price_ceiling: "price_unusable",
  lease_or_rent: "lease_or_rent",
  parts_or_damaged: "parts_or_damaged",
  no_reference: "insufficient_data",
  thin_comps: "insufficient_data",
  low_confidence: "insufficient_data",
  generic_model: "insufficient_data",
  implausible_gap: "inconsistent_data",
  unit_mismatch: "inconsistent_data",
  estimates_disagree: "inconsistent_data",
};

export interface PriceVerdictOk {
  status: "ok";
  band: VerdictBand;
  /** (asking − reference) / reference × 100; negative = below. */
  gapPct: number;
  /** Whole percent, never NaN/negative, never contradicting the band once rounded. */
  pct: number;
  /** Deep below the reference: amber "verify first", never green. */
  verifyFirst: boolean;
  referenceLkr: number;
  /** |asking − reference| in rupees. */
  gapLkr: number;
}

export interface PriceVerdictWithheld {
  status: "withheld";
  reason: WithheldReason;
  group: WithheldGroup;
  referenceLkr: number | null;
}

export type PriceVerdict = PriceVerdictOk | PriceVerdictWithheld;

export interface PriceContext {
  category?: string | null;
  model?: string | null;
  title?: string | null;
  description?: string | null;
  variant?: string | null;
}

export interface PriceVerdictInput extends PriceContext {
  asking: number | null | undefined;
  reference: number | null | undefined;
  /** Comparables behind the reference; unknown (card) is not penalised. */
  comps?: number | null;
  confidence?: string | null;
  /** A second estimate for the same listing (e.g. stored cohort median vs FMV). */
  secondaryReference?: number | null;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isPlaceholderPrice(price: number): boolean {
  if (!(price > 0) || !Number.isInteger(price)) return false;
  return PLACEHOLDER_RE.test(String(price));
}

/** A bucket like "Other" (many models mixed). Unknown (null/undefined) is not penalised. */
export function isGenericModel(model: string | null | undefined): boolean {
  if (model === null || model === undefined) return false;
  return GENERIC_MODELS.has(String(model).trim().toLowerCase());
}

export function priceFloorLkr(category: string | null | undefined): number {
  return PRICE_FLOOR_LKR[String(category ?? "").trim().toLowerCase()] ?? DEFAULT_PRICE_FLOOR_LKR;
}

/** Prices a power of ten apart (±4 %): the lakhs/millions/rupees slip. */
export function isPowerOfTenApart(a: number, b: number): boolean {
  if (!(a > 0) || !(b > 0)) return false;
  const ratio = Math.max(a, b) / Math.min(a, b);
  return [10, 100, 1_000, 10_000, 100_000, 1_000_000].some((f) => Math.abs(ratio / f - 1) <= 0.04);
}

/** Why `asking` is not a usable full vehicle price, or null when it is. */
export function askingPriceIssue(asking: unknown, ctx: PriceContext = {}): WithheldReason | null {
  const price = num(asking);
  if (price === null || price <= 0) return "no_price";
  if (isPlaceholderPrice(price)) return "placeholder_price";
  if (price < priceFloorLkr(ctx.category)) return "below_price_floor";
  if (price > MAX_PLAUSIBLE_PRICE_LKR) return "above_price_ceiling";
  if (detectLeaseTakeover([ctx.title, ctx.variant, ctx.description]).isLeaseTakeover) return "lease_or_rent";
  const text = [ctx.title, ctx.variant, ctx.description].filter((t): t is string => typeof t === "string").join(" ");
  if (RENT_RE.test(text)) return "lease_or_rent";
  if (PARTS_RE.test(text)) return "parts_or_damaged";
  return null;
}

function bandOf(gap: number): VerdictBand {
  if (gap <= -VERDICT_BELOW_PCT) return "below";
  if (gap >= VERDICT_ABOVE_PCT) return "above";
  return "fair";
}

function withheld(reason: WithheldReason, referenceLkr: number | null): PriceVerdictWithheld {
  return { status: "withheld", reason, group: REASON_GROUP[reason], referenceLkr };
}

export function priceVerdict(input: PriceVerdictInput): PriceVerdict {
  const ref = num(input.reference);
  const issue = askingPriceIssue(input.asking, input);
  if (issue) return withheld(issue, ref);
  const price = Number(input.asking);
  if (ref === null || ref <= 0) return withheld("no_reference", null);
  if (isGenericModel(input.model)) return withheld("generic_model", ref);
  const comps = num(input.comps);
  if (comps !== null && comps < MIN_COMPS) return withheld("thin_comps", ref);
  const conf = String(input.confidence ?? "").trim().toLowerCase();
  if (conf === "low" || conf === "none") return withheld("low_confidence", ref);
  if (isPowerOfTenApart(price, ref)) return withheld("unit_mismatch", ref);
  const gap = ((price - ref) / ref) * 100;
  if (Math.abs(gap) > MAX_PLAUSIBLE_GAP_PCT) return withheld("implausible_gap", ref);
  const band = bandOf(gap);
  const second = num(input.secondaryReference);
  if (second !== null && second > 0) {
    const gap2 = ((price - second) / second) * 100;
    const band2 = Math.abs(gap2) <= MAX_PLAUSIBLE_GAP_PCT ? bandOf(gap2) : null;
    if (band2 && ((band === "below" && band2 === "above") || (band === "above" && band2 === "below"))) {
      return withheld("estimates_disagree", ref);
    }
  }
  let pct = Math.floor(Math.abs(gap) + 0.5);
  if (band === "fair") pct = Math.min(pct, (gap < 0 ? VERDICT_BELOW_PCT : VERDICT_ABOVE_PCT) - 1);
  else if (band === "below") pct = Math.max(pct, VERDICT_BELOW_PCT);
  else pct = Math.max(pct, VERDICT_ABOVE_PCT);
  return {
    status: "ok",
    band,
    gapPct: Math.round(gap * 100) / 100,
    pct,
    verifyFirst: gap <= -VERIFY_BELOW_PCT,
    referenceLkr: ref,
    gapLkr: Math.abs(price - ref),
  };
}

export function isVerdictOk(v: PriceVerdict | null | undefined): v is PriceVerdictOk {
  return Boolean(v && v.status === "ok");
}

/* ── Listing-shaped helpers ────────────────────────────────────────────── */

export interface VerdictListingLike {
  price_lkr?: number | string | null;
  market_median_lkr?: number | string | null;
  deal_score?: number | string | null;
  vehicle_category?: string | null;
  model?: string | null;
  title?: string | null;
  description?: string | null;
  variant?: string | null;
}

export function listingPriceContext(l: VerdictListingLike | null | undefined): PriceContext {
  return {
    category: l?.vehicle_category ?? null,
    model: l?.model ?? null,
    title: l?.title ?? null,
    description: l?.description ?? null,
    variant: l?.variant ?? null,
  };
}

/**
 * Verdict from the listing row alone (cards, lists, compare): the stored
 * cohort median is the reference. Same rules as the detail page.
 */
export function listingRowVerdict(l: VerdictListingLike | null | undefined): PriceVerdict {
  return priceVerdict({ asking: num(l?.price_lkr), reference: num(l?.market_median_lkr), ...listingPriceContext(l) });
}

/**
 * Data-boundary guard (services/api normalizeListing): a stored deal score /
 * median whose comparison is withheld for a data reason is dropped, so no list,
 * tier, sort or chart can show "90 % below similar cars" off a mixed cohort.
 * Missing medians stay missing (nothing to check).
 */
export function hasPlausibleStoredSignal(l: VerdictListingLike): boolean {
  if (num(l.market_median_lkr) === null) {
    const score = num(l.deal_score);
    return score === null || Math.abs(score) <= MAX_PLAUSIBLE_GAP_PCT;
  }
  return listingRowVerdict(l).status === "ok";
}

/** Minimal FMV-detail shape (types/fmv ListingFmvDetail). */
export interface FmvDetailLike {
  fmv_lkr?: number | null;
  sample_size?: number | null;
  confidence?: string | null;
  method?: string | null;
  verdict?: { status?: string | null; reason?: string | null } | null;
}

/**
 * THE verdict for one listing on its detail page — computed once and handed to
 * every panel (deal badge, FMV card, deal ladder, Trust Check, timeline,
 * compare pin, sticky bar) so they cannot contradict each other.
 *
 * - FMV loaded: the FMV estimate + its comps/confidence is the reference; the
 *   stored cohort median (what the listing card used) is the secondary check.
 *   A backend that already withheld the verdict wins.
 * - FMV not loaded: the stored cohort median, exactly like the card.
 */
export function resolveListingVerdict(
  listing: VerdictListingLike | null | undefined,
  fmv: FmvDetailLike | null | undefined,
): PriceVerdict {
  if (!listing) return withheld("no_price", null);
  const ctx = listingPriceContext(listing);
  const asking = num(listing.price_lkr);
  if (!fmv) return listingRowVerdict(listing);
  const serverReason = fmv.verdict && fmv.verdict.status === "withheld" ? (fmv.verdict.reason as WithheldReason | null) : null;
  if (serverReason) {
    const priceIssue = askingPriceIssue(asking, ctx);
    return withheld(priceIssue ?? (serverReason in REASON_GROUP ? serverReason : "low_confidence"), num(fmv.fmv_lkr));
  }
  if (fmv.method === "insufficient_data" || num(fmv.fmv_lkr) === null) {
    const priceIssue = askingPriceIssue(asking, ctx);
    return withheld(priceIssue ?? "no_reference", null);
  }
  const stored = num(listing.market_median_lkr);
  return priceVerdict({
    asking,
    reference: num(fmv.fmv_lkr),
    comps: num(fmv.sample_size),
    confidence: fmv.confidence ?? null,
    secondaryReference: stored !== null && stored !== num(fmv.fmv_lkr) ? stored : null,
    ...ctx,
  });
}

/* ── Copy ──────────────────────────────────────────────────────────────── */

type Translate = (key: string, fallback?: string, vars?: Record<string, string | number>) => string;
const plain: Translate = (_k, fallback = "", vars) => fallback.replace(/\{(\w+)\}/g, (_m, k) => String(vars?.[k] ?? ""));

/** Short headline for a verdict ("Priced 12% below typical", "Not enough comparable data"). */
export function verdictHeadline(v: PriceVerdict, t: Translate = plain): string {
  if (v.status === "ok") {
    if (v.verifyFirst) return t("deal.unusuallyLow", "Unusually low — verify first");
    if (v.band === "below") return t("verdict.below", "Priced {pct}% below typical", { pct: v.pct });
    if (v.band === "above") return t("verdict.above", "Priced {pct}% above typical", { pct: v.pct });
    return t("deal.nearTypical", "Near typical price");
  }
  return withheldHeadline(v.group, t);
}

export function withheldHeadline(group: WithheldGroup, t: Translate = plain): string {
  switch (group) {
    case "price_unusable":
      return t("verdict.withheld.price", "Asking price can't be rated");
    case "lease_or_rent":
      return t("verdict.withheld.lease", "Lease, rental or part-payment price");
    case "parts_or_damaged":
      return t("verdict.withheld.parts", "Parts or damaged vehicle");
    case "inconsistent_data":
      return t("verdict.withheld.inconsistent", "Price doesn't line up with comparable ads");
    default:
      return t("verdict.withheld.insufficient", "Not enough comparable data");
  }
}

/** One plain sentence on why there is no rating. */
export function withheldDetail(group: WithheldGroup, t: Translate = plain): string {
  switch (group) {
    case "price_unusable":
      return t("verdict.withheldBody.price", "The price on this ad doesn't look like a full vehicle price (missing, a placeholder or too low), so we don't compare it.");
    case "lease_or_rent":
      return t("verdict.withheldBody.lease", "The ad looks like a lease takeover, rental or down payment, so the number isn't the full price. We don't compare it with typical prices.");
    case "parts_or_damaged":
      return t("verdict.withheldBody.parts", "The ad looks like parts or a damaged vehicle, so typical prices for running vehicles don't apply.");
    case "inconsistent_data":
      return t("verdict.withheldBody.inconsistent", "This price is too far from comparable ads, or our estimates disagree, to rate it reliably. Check the ad details with the seller.");
    default:
      return t("verdict.withheldBody.insufficient", "We don't have enough similar ads to judge this price with confidence. Compare a few similar ads yourself.");
  }
}
