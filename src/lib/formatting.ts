import { parseFlexibleTime } from "@/lib/parseTime";
import { formatLkrAxis, formatLkrCompact } from "@/lib/price";

export const MIN_REASONABLE_LISTING_PRICE_LKR = 100_000;

export function isReasonableListingPrice(price: number | null | undefined): boolean {
  const numeric = Number(price);
  return Number.isFinite(numeric) && numeric >= MIN_REASONABLE_LISTING_PRICE_LKR;
}

/**
 * Compact card/list price. Delegates to the canonical formatter in
 * `@/lib/price` (millions only: "Rs 0.35 Mn", "Rs 8.5 Mn", "Rs 12.5 Mn").
 * Every
 * `formatPrice()` call in the app routes through here.
 * @deprecated import `formatLkrCompact` from `@/lib/price` in new code.
 */
export function formatPriceLkrMillions(price: number | null | undefined): string {
  return formatLkrCompact(price, "N/A");
}

/** Compact price — millions only since Oct 2026 ("Rs 8.5 Mn"); name kept for callers. */
export function formatPriceLkrLakhs(price: number | null | undefined): string {
  return formatLkrCompact(price, "N/A");
}

/** Chart-axis tick from a raw LKR value ("7 Mn", "15 Mn"). */
export function formatPriceTickMillions(value: number | string | null | undefined): string {
  return formatLkrAxis(value, "N/A");
}

export function formatRelativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "never";

  const ts = parseFlexibleTime(iso);
  if (ts === null) return "never";
  const parsed = new Date(ts);

  const diffMs = now.getTime() - parsed.getTime();
  if (diffMs < 0 || diffMs < 3600000) return "just now";

  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return `${diffHours}h ago`;

  return `${Math.floor(diffHours / 24)}d ago`;
}

type TranslateFn = (
  key: string,
  fallback?: string,
  vars?: Record<string, string | number | null | undefined>,
) => string;

/** Locale-aware relative time using common.* keys via a translator (e.g. useAppPreferences().t). */
export function formatRelativeTimeI18n(
  iso: string | null | undefined,
  t: TranslateFn,
  now: Date = new Date(),
): string {
  if (!iso) return t("common.never", "never");

  const ts = parseFlexibleTime(iso);
  if (ts === null) return t("common.never", "never");

  const diffMs = now.getTime() - ts;
  if (diffMs < 0 || diffMs < 3600000) return t("common.justNow", "just now");

  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return t("common.hoursAgo", "{n}h ago", { n: diffHours });

  return t("common.daysAgo", "{n}d ago", { n: Math.floor(diffHours / 24) });
}