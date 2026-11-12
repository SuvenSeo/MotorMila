import { BadgeCheck, Minus, TrendingUp, Zap } from "lucide-react";

/**
 * 4-tier deal taxonomy on the ONE verdict's bands (src/lib/priceVerdict.ts):
 * score = (1 - price/median) * 100 = −gap%. A tier can never disagree with
 * the deal badge ("Near typical" vs "Overpriced").
 *
 * - Steal:      score >= 15  (deep below typical)
 * - Great:      score >= 5   (verdict "below")
 * - Fair:       −8 < score < 5 (verdict "fair")
 * - Overpriced: score <= −8  (verdict "above")
 *
 * |score| > 60 never reaches here: the data boundary drops implausible scores.
 *
 * Colours: one semantic token per tier (src/styles/TOKENS.md) —
 * steal→deal-great, great→deal-good, fair→deal-fair, overpriced→deal-high.
 */
export type DealTier = "steal" | "great" | "fair" | "overpriced";

export const STEAL_SCORE = 15;
export const GREAT_SCORE = 5;
export const OVERPRICED_SCORE = -8;

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
