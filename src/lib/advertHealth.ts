/**
 * Advert merchandising health (0–100): completeness of listing fields that
 * help buyers trust and convert. Seven equal checklist items.
 */
import { englishT, type TranslateFn } from "@/lib/translate";

export interface AdvertHealthListingLike {
  thumbnail_url?: string | null;
  images?: unknown;
  mileage_km?: number | null;
  engine_cc?: number | null;
  fuel_type?: string | null;
  district?: string | null;
  title?: string | null;
  year?: number | null;
}

export type AdvertHealthCheckKey =
  | "thumbnail"
  | "mileage"
  | "engine_cc"
  | "fuel_type"
  | "district"
  | "title"
  | "year";

export interface AdvertHealthCheck {
  key: AdvertHealthCheckKey;
  label: string;
  passed: boolean;
}

export type AdvertHealthBand = "strong" | "fair" | "weak";

export interface AdvertHealthResult {
  score: number;
  band: AdvertHealthBand;
  label: string;
  detail: string;
  checks: AdvertHealthCheck[];
  passedCount: number;
  totalCount: number;
}

const CHECK_META: { key: AdvertHealthCheckKey; label: string }[] = [
  { key: "thumbnail", label: "Photo" },
  { key: "mileage", label: "Mileage" },
  { key: "engine_cc", label: "Engine CC" },
  { key: "fuel_type", label: "Fuel" },
  { key: "district", label: "District" },
  { key: "title", label: "Title" },
  { key: "year", label: "Year" },
];

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasThumbnail(listing: AdvertHealthListingLike): boolean {
  if (hasNonEmptyString(listing.thumbnail_url)) return true;
  if (Array.isArray(listing.images)) {
    return listing.images.some((img) => hasNonEmptyString(img));
  }
  return false;
}

function hasMileage(listing: AdvertHealthListingLike): boolean {
  const n = Number(listing.mileage_km);
  return listing.mileage_km != null && Number.isFinite(n) && n >= 0;
}

function hasEngineCc(listing: AdvertHealthListingLike): boolean {
  const n = Number(listing.engine_cc);
  return listing.engine_cc != null && Number.isFinite(n) && n > 0;
}

function hasYear(listing: AdvertHealthListingLike): boolean {
  const n = Number(listing.year);
  return listing.year != null && Number.isFinite(n) && n >= 1980;
}

function evaluateCheck(key: AdvertHealthCheckKey, listing: AdvertHealthListingLike): boolean {
  switch (key) {
    case "thumbnail":
      return hasThumbnail(listing);
    case "mileage":
      return hasMileage(listing);
    case "engine_cc":
      return hasEngineCc(listing);
    case "fuel_type":
      return hasNonEmptyString(listing.fuel_type);
    case "district":
      return hasNonEmptyString(listing.district);
    case "title":
      return hasNonEmptyString(listing.title) && String(listing.title).trim().length > 10;
    case "year":
      return hasYear(listing);
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

function bandFromScore(score: number): AdvertHealthBand {
  if (score >= 85) return "strong";
  if (score >= 55) return "fair";
  return "weak";
}

function labelForBand(band: AdvertHealthBand, t: TranslateFn): string {
  switch (band) {
    case "strong":
      return t("adHealth.strong", "Ad health strong");
    case "fair":
      return t("adHealth.fair", "Ad health fair");
    case "weak":
      return t("adHealth.weak", "Ad health weak");
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

/**
 * Score merchandising completeness of a listing-like object (0–100).
 */
export function computeAdvertHealth(listing: AdvertHealthListingLike, t: TranslateFn = englishT): AdvertHealthResult {
  const checks: AdvertHealthCheck[] = CHECK_META.map(({ key, label }) => ({
    key,
    label: t(`adHealth.check.${key}`, label),
    passed: evaluateCheck(key, listing),
  }));

  const totalCount = checks.length;
  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / totalCount) * 100);
  const band = bandFromScore(score);
  const label = labelForBand(band, t);
  const missing = checks.filter((c) => !c.passed).map((c) => c.label);
  const detail =
    missing.length === 0
      ? t("adHealth.complete", "All merchandising fields present")
      : t("adHealth.missing", "Missing: {fields}", { fields: missing.join(", ") });

  return {
    score,
    band,
    label,
    detail,
    checks,
    passedCount,
    totalCount,
  };
}
