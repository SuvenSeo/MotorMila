import { formatRelativeTime, formatRelativeTimeI18n } from "@/lib/formatting";
import type { TranslateFn } from "@/lib/translate";
import { parseFlexibleTime } from "@/lib/parseTime";

export const LISTING_DATA_STALE_HOURS = 6;
export const LISTING_DATA_STALE_MS = LISTING_DATA_STALE_HOURS * 60 * 60 * 1000;

export type FreshnessTone = "live" | "recent" | "stale" | "unknown";

export interface ListingDataFreshness {
  listingAt: string | null;
  statsAt: string | null;
  primaryAt: string | null;
  tone: FreshnessTone;
  isStale: boolean;
  relativeLabel: string;
  compactLabel: string;
  absoluteLabel: string;
  dataAsOfLabel: string;
  staleNotice: string | null;
}

function parseTimestamp(iso: string | null | undefined): Date | null {
  const t = parseFlexibleTime(iso);
  return t === null ? null : new Date(t);
}

export function getListingAgeMs(iso: string | null | undefined, now: Date = new Date()): number | null {
  const parsed = parseTimestamp(iso);
  if (!parsed) return null;
  return Math.max(0, now.getTime() - parsed.getTime());
}

export function isListingDataStale(
  iso: string | null | undefined,
  now: Date = new Date(),
  staleMs: number = LISTING_DATA_STALE_MS,
): boolean {
  const ageMs = getListingAgeMs(iso, now);
  if (ageMs === null) return false;
  return ageMs > staleMs;
}

export function formatCompactAge(iso: string | null | undefined, now: Date = new Date()): string {
  const ageMs = getListingAgeMs(iso, now);
  if (ageMs === null) return "—";
  if (ageMs < 60_000) return "now";

  const mins = Math.round(ageMs / 60_000);
  if (mins < 60) return `${mins}m`;

  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;

  return `${Math.round(hrs / 24)}d`;
}

export function formatTimestampLocal(iso: string | null | undefined): string {
  const parsed = parseTimestamp(iso);
  if (!parsed) return "unknown";

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function resolveTone(ageMs: number | null): FreshnessTone {
  if (ageMs === null) return "unknown";
  if (ageMs <= 60 * 60 * 1000) return "live";
  if (ageMs <= LISTING_DATA_STALE_MS) return "recent";
  return "stale";
}

export function getListingDataFreshness(
  options: {
    latestListingAt?: string | null;
    lastUpdated?: string | null;
    now?: Date;
    /** Translator (useAppPreferences().t); English when omitted. */
    t?: TranslateFn;
  } = {},
): ListingDataFreshness {
  const now = options.now ?? new Date();
  const listingAt = options.latestListingAt ?? null;
  const statsAt = options.lastUpdated ?? null;
  const primaryAt = listingAt ?? statsAt;
  const ageMs = getListingAgeMs(primaryAt, now);
  const tone = resolveTone(ageMs);
  const isStale = tone === "stale";
  const t = options.t;
  const tr = (key: string, fallback: string, vars?: Record<string, string>) =>
    t ? t(key, fallback, vars) : fallback.replace(/\{(\w+)\}/g, (m, k: string) => vars?.[k] ?? m);
  const relativeLabel = primaryAt
    ? t
      ? formatRelativeTimeI18n(primaryAt, t, now)
      : formatRelativeTime(primaryAt, now)
    : tr("freshness.awaitingSync", "awaiting sync");
  const compactLabel = primaryAt ? formatCompactAge(primaryAt, now) : "—";
  const absoluteLabel = formatTimestampLocal(primaryAt);
  const dataAsOfLabel = primaryAt
    ? tr("freshness.dataAsOf", "Data as of {age}", { age: relativeLabel })
    : tr("freshness.dataAsOfPending", "Data as of — · awaiting sync");
  const staleNotice = isStale
    ? tr("freshness.staleNotice", "Listing data is {age} old — counts and deal scores may lag live sources.", { age: compactLabel })
    : null;

  return {
    listingAt,
    statsAt,
    primaryAt,
    tone,
    isStale,
    relativeLabel,
    compactLabel,
    absoluteLabel,
    dataAsOfLabel,
    staleNotice,
  };
}
