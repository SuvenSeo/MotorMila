/**
 * Sell-speed rating (0–100): how quickly a listing is likely to move.
 *
 * Higher deal_score, fresher first_seen_at, and asking below median all push
 * the score up. Weights: deal 40 · freshness 40 · below-median 20.
 */
import { englishT, type TranslateFn } from "@/lib/translate";

export interface SellSpeedListingLike {
  deal_score?: number | null;
  first_seen_at?: string | null;
  price_lkr?: number | null;
  market_median_lkr?: number | null;
}

export interface SellSpeedInput extends SellSpeedListingLike {
  /** Override wall clock for deterministic tests (ms since epoch). */
  nowMs?: number;
}

export type SellSpeedBand = "fast" | "moderate" | "slow";

export interface SellSpeedResult {
  score: number;
  band: SellSpeedBand;
  label: string;
  detail: string;
  daysOnMarket: number | null;
  belowMedian: boolean | null;
  dealContribution: number;
  freshnessContribution: number;
  medianContribution: number;
}

const DEAL_WEIGHT = 40;
const FRESHNESS_WEIGHT = 40;
const MEDIAN_WEIGHT = 20;

/** Days on market at which freshness contribution hits zero. */
const FRESHNESS_HORIZON_DAYS = 45;

/** deal_score clamp window when mapping to 0–1 (≈ ±15% vs median). */
const DEAL_SCORE_FLOOR = -15;
const DEAL_SCORE_CEIL = 15;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function daysOnMarketFrom(firstSeenAt: string | null | undefined, nowMs: number): number | null {
  if (!firstSeenAt) return null;
  const listedAt = Date.parse(firstSeenAt);
  if (!Number.isFinite(listedAt)) return null;
  const diffMs = nowMs - listedAt;
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / 86_400_000);
}

function resolveBelowMedian(listing: SellSpeedListingLike): boolean | null {
  const price = Number(listing.price_lkr);
  const median = Number(listing.market_median_lkr);
  if (Number.isFinite(price) && price > 0 && Number.isFinite(median) && median > 0) {
    return price < median;
  }
  const deal = Number(listing.deal_score);
  if (Number.isFinite(deal)) return deal > 0;
  return null;
}

function bandFromScore(score: number): SellSpeedBand {
  if (score >= 70) return "fast";
  if (score >= 40) return "moderate";
  return "slow";
}

function labelForBand(band: SellSpeedBand, t: TranslateFn): string {
  switch (band) {
    case "fast":
      return t("sellSpeed.fast", "Fast sell");
    case "moderate":
      return t("sellSpeed.moderate", "Moderate sell");
    case "slow":
      return t("sellSpeed.slow", "Slow sell");
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

/**
 * Score how quickly a listing-like object is likely to sell (0–100).
 */
export function computeSellSpeed(listing: SellSpeedInput, t: TranslateFn = englishT): SellSpeedResult {
  const nowMs = listing.nowMs ?? Date.now();
  const dealRaw = Number(listing.deal_score);
  const dealScore = Number.isFinite(dealRaw) ? dealRaw : 0;

  const dealNorm = clamp(
    (dealScore - DEAL_SCORE_FLOOR) / (DEAL_SCORE_CEIL - DEAL_SCORE_FLOOR),
    0,
    1,
  );
  const dealContribution = dealNorm * DEAL_WEIGHT;

  const daysOnMarket = daysOnMarketFrom(listing.first_seen_at, nowMs);
  const freshNorm =
    daysOnMarket == null
      ? 0.5
      : clamp(1 - daysOnMarket / FRESHNESS_HORIZON_DAYS, 0, 1);
  const freshnessContribution = freshNorm * FRESHNESS_WEIGHT;

  const belowMedian = resolveBelowMedian(listing);
  const medianContribution =
    belowMedian === true ? MEDIAN_WEIGHT : belowMedian === false ? 0 : MEDIAN_WEIGHT * 0.5;

  const score = Math.round(
    clamp(dealContribution + freshnessContribution + medianContribution, 0, 100),
  );
  const band = bandFromScore(score);
  const label = labelForBand(band, t);

  const dayText =
    daysOnMarket == null
      ? t("sellSpeed.ageUnknown", "age unknown")
      : daysOnMarket === 0
        ? t("sellSpeed.listedToday", "listed today")
        : t("sellSpeed.daysOnMarket", "{n}d on market", { n: daysOnMarket });
  const medianText =
    belowMedian === true
      ? t("sellSpeed.belowMedian", "below median")
      : belowMedian === false
        ? t("sellSpeed.aboveMedian", "at/above median")
        : t("sellSpeed.medianNa", "median n/a");
  const detail = t("sellSpeed.detail", "Deal {deal} · {days} · {median}", {
    deal: `${dealScore >= 0 ? "+" : ""}${dealScore}`,
    days: dayText,
    median: medianText,
  });

  return {
    score,
    band,
    label,
    detail,
    daysOnMarket,
    belowMedian,
    dealContribution: Math.round(dealContribution * 10) / 10,
    freshnessContribution: Math.round(freshnessContribution * 10) / 10,
    medianContribution: Math.round(medianContribution * 10) / 10,
  };
}
