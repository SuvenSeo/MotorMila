import { parseFlexibleTime } from "@/lib/parseTime";

export const MIN_REASONABLE_LISTING_PRICE_LKR = 100_000;

export function isReasonableListingPrice(price: number | null | undefined): boolean {
  const numeric = Number(price);
  return Number.isFinite(numeric) && numeric >= MIN_REASONABLE_LISTING_PRICE_LKR;
}

export function formatPriceLkrMillions(price: number | null | undefined): string {
  if (price === null || price === undefined || !Number.isFinite(price)) {
    return "N/A";
  }

  return `Rs. ${(price / 1000000).toFixed(2)}M`;
}

// Backward-compatible alias for older imports; prefer formatPriceLkrMillions.
export const formatPriceLkrLakhs = formatPriceLkrMillions;

export function formatPriceTickMillions(value: number | string | null | undefined): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "N/A";
  return `${(numeric / 1000000).toFixed(0)}M`;
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