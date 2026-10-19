import { BadgeCheck, Minus, TrendingUp, Zap } from "lucide-react";

/**
 * Unified 4-tier deal taxonomy — single source of truth for TRACK C.
 * Thresholds stay compatible with the 3-tier backend (deal_scores.py):
 * score = (1 - price/median) * 100. Steal is a subset of Good Deal
 * (score >= 8), so existing Good Deal callers keep working.
 *
 * - Steal:      score >= 15  (deep below FMV)
 * - Great:      score >= 8   (Good Deal band)
 * - Fair:       score > -5   (within FMV band)
 * - Overpriced: score <= -5
 *
 * Colours: one semantic token per tier (src/styles/TOKENS.md) —
 * steal→deal-great, great→deal-good, fair→deal-fair, overpriced→deal-high.
 */
export type DealTier = "steal" | "great" | "fair" | "overpriced";

export const STEAL_SCORE = 15;
export const GREAT_SCORE = 8;
export const OVERPRICED_SCORE = -5;

export function getDealTier(score: number | string | null | undefined): DealTier {
  const s = Number(score ?? 0);
  if (!Number.isFinite(s)) return "fair";
  if (s >= STEAL_SCORE) return "steal";
  if (s >= GREAT_SCORE) return "great";
  if (s <= OVERPRICED_SCORE) return "overpriced";
  return "fair";
}

export const DEAL_TIER_META: Record<
  DealTier,
  { label: string; classes: string; Icon: typeof Zap }
> = {
  steal: {
    label: "Steal",
    classes:
      "border-deal-great/40 bg-deal-great/15 text-deal-great-text",
    Icon: Zap,
  },
  great: {
    label: "Great",
    classes:
      "border-deal-good/30 bg-deal-good/10 text-deal-good-text",
    Icon: BadgeCheck,
  },
  fair: {
    label: "Fair",
    classes: "border-deal-fair/30 bg-deal-fair/10 text-deal-fair-text",
    Icon: Minus,
  },
  overpriced: {
    label: "Overpriced",
    classes: "border-deal-high/30 bg-deal-high/10 text-deal-high-text",
    Icon: TrendingUp,
  },
};
