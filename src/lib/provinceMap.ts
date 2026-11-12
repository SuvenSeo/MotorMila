import type { DistrictVelocityPoint } from "@/types/car";

/** Official Sri Lanka provinces in conventional display order. */
export const SL_PROVINCES = [
  "Western",
  "Central",
  "Southern",
  "Northern",
  "Eastern",
  "North Western",
  "North Central",
  "Uva",
  "Sabaragamuwa",
] as const;

export type SLProvince = (typeof SL_PROVINCES)[number];

/** Locale key for a province name, e.g. "North Western" -> "province.northWestern". */
export function provinceKey(province: string): string {
  const words = province.trim().toLowerCase().split(/\s+/);
  return `province.${words[0]}${words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join("")}`;
}

/** District → province map covering all 25 administrative districts. */
export const DISTRICT_TO_PROVINCE: Record<string, SLProvince> = {
  Colombo: "Western",
  Gampaha: "Western",
  Kalutara: "Western",
  Kandy: "Central",
  Matale: "Central",
  "Nuwara Eliya": "Central",
  Galle: "Southern",
  Matara: "Southern",
  Hambantota: "Southern",
  Jaffna: "Northern",
  Kilinochchi: "Northern",
  Mannar: "Northern",
  Mullaitivu: "Northern",
  Vavuniya: "Northern",
  Batticaloa: "Eastern",
  Ampara: "Eastern",
  Trincomalee: "Eastern",
  Kurunegala: "North Western",
  Puttalam: "North Western",
  Anuradhapura: "North Central",
  Polonnaruwa: "North Central",
  Badulla: "Uva",
  Monaragala: "Uva",
  Ratnapura: "Sabaragamuwa",
  Kegalle: "Sabaragamuwa",
};

const DISTRICT_LOOKUP = new Map(
  Object.entries(DISTRICT_TO_PROVINCE).map(([district, province]) => [
    normalizeDistrictKey(district),
    province,
  ]),
);

function normalizeDistrictKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getProvinceForDistrict(district: string): SLProvince | null {
  if (!district) return null;
  return DISTRICT_LOOKUP.get(normalizeDistrictKey(district)) ?? null;
}

export interface ProvinceVelocityPoint {
  province: SLProvince;
  listing_count: number;
  new_7d_count: number;
  /** Listing-count-weighted average of district `velocity_score` values. */
  velocity_score: number;
  district_count: number;
}

/**
 * Roll district velocity points into province aggregates.
 * - `listing_count` / `new_7d_count` are sums
 * - `velocity_score` is a listing-count-weighted average
 */
export function aggregateDistrictVelocityByProvince(
  points: DistrictVelocityPoint[],
): ProvinceVelocityPoint[] {
  const buckets = new Map<
    SLProvince,
    { listing_count: number; new_7d_count: number; weightedVelocity: number; district_count: number }
  >();

  for (const province of SL_PROVINCES) {
    buckets.set(province, {
      listing_count: 0,
      new_7d_count: 0,
      weightedVelocity: 0,
      district_count: 0,
    });
  }

  for (const point of points) {
    const province = getProvinceForDistrict(point.district);
    if (!province) continue;

    const listingCount = Math.max(0, Number(point.listing_count) || 0);
    const new7d = Math.max(0, Number(point.new_7d_count) || 0);
    const score = Number(point.velocity_score);
    const velocity = Number.isFinite(score) ? score : 0;

    const bucket = buckets.get(province)!;
    bucket.listing_count += listingCount;
    bucket.new_7d_count += new7d;
    bucket.weightedVelocity += velocity * listingCount;
    bucket.district_count += 1;
  }

  return SL_PROVINCES.map((province) => {
    const bucket = buckets.get(province)!;
    const velocity_score =
      bucket.listing_count > 0 ? bucket.weightedVelocity / bucket.listing_count : 0;
    return {
      province,
      listing_count: bucket.listing_count,
      new_7d_count: bucket.new_7d_count,
      velocity_score,
      district_count: bucket.district_count,
    };
  }).filter((p) => p.district_count > 0 || p.listing_count > 0);
}
