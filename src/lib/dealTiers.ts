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
      "border-emerald-500/40 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    Icon: Zap,
  },
  great: {
    label: "Great",
    classes:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    Icon: BadgeCheck,
  },
  fair: {
    label: "Fair",
    classes: "border-primary/20 bg-primary/10 text-primary-bright",
    Icon: Minus,
  },
  overpriced: {
    label: "Overpriced",
    classes: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
    Icon: TrendingUp,
  },
};
