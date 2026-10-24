/**
 * Mileage anomaly / trust heuristics against typical annual km for Sri Lanka.
 * Cohort benchmarks are planning defaults (private daily + highway mix).
 * Labels come back translated through `t` (English when called without one).
 */
import { englishT, type TranslateFn } from "@/lib/translate";

export type MileageRiskLevel = "low" | "medium" | "high" | "unknown";

export interface MileageTrustInput {
  mileageKm: number | null | undefined;
  year: number | null | undefined;
  nowYear?: number;
}

export interface MileageTrustResult {
  risk: MileageRiskLevel;
  label: string;
  detail: string;
  kmPerYear: number | null;
  expectedKmPerYear: number;
  ageYears: number | null;
}

/** Typical annual km for Sri Lanka passenger cars used in anomaly checks. */
export const TYPICAL_KM_PER_YEAR = 12_000;

export function computeMileageTrust(input: MileageTrustInput, t: TranslateFn = englishT): MileageTrustResult {
  const expectedKmPerYear = TYPICAL_KM_PER_YEAR;
  const nowYear = input.nowYear ?? new Date().getFullYear();
  const year = Number(input.year);
  const mileage = Number(input.mileageKm);

  if (!Number.isFinite(year) || year < 1980 || year > nowYear + 1) {
    return {
      risk: "unknown",
      label: t("mileageTrust.unverified", "Mileage unverified"),
      detail: t("mileageTrust.yearMissing", "Year missing — cannot score km/year vs cohort."),
      kmPerYear: null,
      expectedKmPerYear,
      ageYears: null,
    };
  }

  if (input.mileageKm == null || !Number.isFinite(mileage) || mileage < 0) {
    return {
      risk: "unknown",
      label: t("mileageTrust.unverified", "Mileage unverified"),
      detail: t("mileageTrust.odometerMissing", "Odometer not listed."),
      kmPerYear: null,
      expectedKmPerYear,
      ageYears: Math.max(1, nowYear - year),
    };
  }

  const ageYears = Math.max(1, nowYear - year);
  const kmPerYear = mileage / ageYears;
  const ratio = kmPerYear / expectedKmPerYear;
  const kmLabel = Math.round(kmPerYear).toLocaleString();
  const typicalLabel = expectedKmPerYear.toLocaleString();

  // Extremely low km/year on older cars is a common fraud / rollback signal.
  if (ageYears >= 3 && ratio < 0.35) {
    return {
      risk: "high",
      label: t("mileageTrust.lowAnomaly", "Low km anomaly"),
      detail: t("mileageTrust.lowAnomalyDetail", "≈ {km} km/yr vs ~{typical} typical — verify odometer.", { km: kmLabel, typical: typicalLabel }),
      kmPerYear,
      expectedKmPerYear,
      ageYears,
    };
  }

  // Very high usage changes residual expectations but is less often fraud.
  if (ratio > 2.2) {
    return {
      risk: "medium",
      label: t("mileageTrust.highUsage", "High usage"),
      detail: t("mileageTrust.highUsageDetail", "≈ {km} km/yr — above typical SL private use.", { km: kmLabel }),
      kmPerYear,
      expectedKmPerYear,
      ageYears,
    };
  }

  if (ratio < 0.55 && ageYears >= 2) {
    return {
      risk: "medium",
      label: t("mileageTrust.belowAverage", "Below-average km"),
      detail: t("mileageTrust.belowAverageDetail", "≈ {km} km/yr — confirm service/history.", { km: kmLabel }),
      kmPerYear,
      expectedKmPerYear,
      ageYears,
    };
  }

  return {
    risk: "low",
    label: t("mileageTrust.typical", "Mileage looks typical"),
    detail: t("mileageTrust.typicalDetail", "≈ {km} km/yr vs ~{typical} cohort baseline.", { km: kmLabel, typical: typicalLabel }),
    kmPerYear,
    expectedKmPerYear,
    ageYears,
  };
}
