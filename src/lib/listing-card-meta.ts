import { pickVehicleImageUrl } from "@/lib/listingImage";
import { parseFlexibleTime } from "@/lib/parseTime";

type ListingImageSource = {
  thumbnail_url?: string | null;
  images?: unknown[];
  url?: string | null;
  detail_url?: string | null;
  external_url?: string | null;
};

export function getListingImageUrl(listing: ListingImageSource): string | null {
  const baseUrls = [listing.url, listing.detail_url, listing.external_url];
  return pickVehicleImageUrl(
    [
      listing.thumbnail_url,
      ...(Array.isArray(listing.images) ? listing.images : []),
    ],
    baseUrls,
  );
}

export function getListingDealLabel(rawScore: number): "Good Deal" | "Fair Price" | "Overpriced" {
  if (Number.isFinite(rawScore) && rawScore >= 8) return "Good Deal";
  if (Number.isFinite(rawScore) && rawScore <= -5) return "Overpriced";
  return "Fair Price";
}

export function getListingDaysOnMarket(iso: string | null | undefined): number | null {
  const listedAt = parseFlexibleTime(iso);
  if (listedAt === null) return null;
  const diffMs = Date.now() - listedAt;
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / 86_400_000);
}

export function getListingDaysOnMarketLabel(iso: string | null | undefined): string | null {
  const days = getListingDaysOnMarket(iso);
  if (days === null) return null;
  if (days === 0) return "Listed today";
  if (days === 1) return "Listed 1 day";
  return `Listed ${days} days`;
}

export function getListingRecencyLabel(iso: string | null): string {
  const ts = parseFlexibleTime(iso);
  if (ts === null) return "Today";
  const d = new Date(ts);
  const now = new Date();
  const diffHrs = Math.floor((now.getTime() - d.getTime()) / 3_600_000);
  if (diffHrs < 1) return "Just now";
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-LK", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Absolute "listed" date + time for a listing detail page, rendered in
 * Sri Lanka time (e.g. "19 May 2026, 3:42 PM"). Backed by `first_seen_at` —
 * the moment Motormila first spotted the ad, which is the closest the
 * pipeline gets to the true publication time (scrapes run 3x daily).
 */
export function formatListedDateTime(iso: string | null | undefined): string | null {
  const ts = parseFlexibleTime(iso);
  if (ts === null) return null;
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-GB", {
    timeZone: "Asia/Colombo",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    timeZone: "Asia/Colombo",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${date}, ${time}`;
}
