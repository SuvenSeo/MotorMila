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
/** Free users only see page 1 of the market feed. */
export const FREE_MAX_LISTING_PAGES = 1;
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

export function freeListingsVisibleTotal(marketTotal: number): number {
  return Math.min(Math.max(0, marketTotal), FREE_LISTINGS_PAGE_SIZE * FREE_MAX_LISTING_PAGES);
}

/** Keep the newest N months of a period-sorted series for free teasers. */
export function takeLastMonths<T>(rows: T[], months: number): T[] {
  if (!Array.isArray(rows) || months <= 0) return [];
  if (rows.length <= months) return rows;
  return rows.slice(rows.length - months);
}

export const freePlanCopy = {
  listingsTitle: "Free browse limit reached",
  listingsBody:
    "You’re seeing the first 12 live listings. Pro unlocks the full market feed, deal scores, and unlimited pagination.",
  picksTitle: "More elite deals on Pro",
  picksBody: "Free shows a short teaser shortlist. Pro unlocks the full ranked Best Picks board and price-cut feed.",
  alertsTitle: "One free alert included",
  alertsBody: "Pro unlocks deeper alert watches, richer match refresh, and WhatsApp notifications.",
  scoresTitle: "Deal scores are a Pro signal",
  scoresBody: "Upgrade to see fair-price scoring on every listing and sort by deal quality.",
  pulseTitle: "Limited Official Pulse on Free",
  pulseBody: "Free shows the latest 6 signals. Pro unlocks the full pulse desk and history.",
  trendsTitle: "6-month trend window on Free",
  trendsBody: "Pro unlocks full history plus district and condition filters.",
  calcTitle: "Starter calculator on Free",
  calcBody: "Landed-cost is open on Free. Lease, TCO, on-road fees, permits, and retention curves unlock on Pro.",
  indexTitle: "6-month index window on Free",
  indexBody: "Pro unlocks the full index history and segment breakdowns.",
  estimateTitle: "Starter valuation on Free",
  estimateBody: "Fair market range is open on Free. 1Y/3Y trajectory and seller fair-ask tools unlock on Pro.",
  dealerTitle: "Dealer workspace teaser",
  dealerBody: "Claim and basic yard tools are open. Deep dealer intelligence unlocks on Pro / Dealer.",
  genericCta: "Upgrade to Pro",
} as const;
