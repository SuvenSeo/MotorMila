/**
 * Free vs Pro product limits.
 *
 * Free is a deliberate teaser: enough to feel Motormila’s value,
 * not enough to replace Pro for serious pricing / research work.
 * Admins and Pro/Enterprise subscribers are treated as full access.
 *
 * Product rule: free users can *open every page*, but each surface
 * soft-limits depth (counts, months, tabs, scores) instead of hard-blocking routes.
 */

export const FREE_LISTINGS_PAGE_SIZE = 12;
/**
 * Guests and free users get normal pagination through the whole market feed
 * (UI refresh, Oct 2026). The browse feed is the front door; deal scores,
 * history depth and alerts remain the Pro levers.
 */
export const FREE_MAX_LISTING_PAGES = Number.POSITIVE_INFINITY;
/** Best Picks shortlist length on free. */
export const FREE_BEST_PICKS_LIMIT = 6;
/** Server + local alert cap for free. */
export const FREE_ALERTS_LIMIT = 1;
/** Official Pulse cards shown on free. */
export const FREE_PULSE_LIMIT = 6;
/** Trend / price-index history window (months) for free. */
export const FREE_TRENDS_MONTHS = 6;
/** Price-drop cards shown on free Best Picks / dashboard. */
export const FREE_PRICE_DROPS_LIMIT = 3;
/** Similar listings on listing detail for free. */
export const FREE_SIMILAR_LIMIT = 4;
/** Top EV models shown on free EV Hub. */
export const FREE_EV_MODELS_LIMIT = 3;
/** Calculator tabs free users can fully use. */
export const FREE_CALCULATOR_TABS = ["landed-cost"] as const;

export function hasFullPlatformAccess(opts: {
  hasProAccess: boolean;
  isAdmin?: boolean;
}): boolean {
  return Boolean(opts.hasProAccess || opts.isAdmin);
}

/** Paid plans that are not free-teased (mirrors backend PRO_PLANS). */
export const FULL_ACCESS_PLANS = ["pro", "enterprise", "dealer"] as const;

/** Listings a free / signed-out visitor can browse: all of them (no cap since Oct 2026). */
export function freeListingsVisibleTotal(marketTotal: number): number {
  return Math.max(0, Number.isFinite(marketTotal) ? marketTotal : 0);
}

/** Keep the newest N months of a period-sorted series for free teasers. */
export function takeLastMonths<T>(rows: T[], months: number): T[] {
  if (!Array.isArray(rows) || months <= 0) return [];
  if (rows.length <= months) return rows;
  return rows.slice(rows.length - months);
}

export const freePlanCopy = {
  listingsTitle: "Deal scores are on Pro",
  listingsBody:
    "Browse every live listing free. Pro adds fair-price deal scores, price history depth, and more alerts.",
  picksTitle: "More elite deals on Pro",
  picksBody: "Free shows a short teaser shortlist. Pro unlocks the full ranked Best Picks board and price-cut feed.",
  alertsTitle: "One free alert included",
  alertsBody: "Pro unlocks deeper alert watches, richer match refresh, and WhatsApp notifications.",
  scoresTitle: "Deal scores are a Pro signal",
  scoresBody: "Fair-price scoring on every listing, and sorting by deal quality, are coming with Pro.",
  pulseTitle: "Limited Official Pulse on Free",
  pulseBody: "Free shows the latest 6 signals. Pro unlocks the full pulse desk and history.",
  trendsTitle: "6-month trend window on Free",
  trendsBody: "Pro unlocks full history plus district and condition filters.",
  calcTitle: "Starter calculator on Free",
  calcBody: "The import tax calculator is free. Lease, running-cost and on-road fee calculators are coming with Pro.",
  indexTitle: "6-month index window on Free",
  indexBody: "Pro unlocks the full index history and segment breakdowns.",
  estimateTitle: "Starter valuation on Free",
  estimateBody: "Fair market range is open on Free. 1Y/3Y trajectory and seller fair-ask tools unlock on Pro.",
  dealerTitle: "Dealer workspace teaser",
  dealerBody: "Claim and basic yard tools are open. Deep dealer intelligence unlocks on Pro / Dealer.",
  genericCta: "Notify me",
} as const;

export type FreePlanCopyKey = keyof typeof freePlanCopy;

/** freePlanCopy line in the active language (keys `plan.free.<key>` in locales/strings.ts). */
export function freePlanText(
  t: (key: string, fallback?: string) => string,
  key: FreePlanCopyKey,
): string {
  return t(`plan.free.${key}`, freePlanCopy[key]);
}
