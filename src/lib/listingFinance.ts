/**
 * Small "est. /mo" figure for listing cards and the detail sticky bar.
 * Thin wrapper over cashToOwn so the CBSL LTV table stays in one place:
 * 60% for registered vehicles used >1 yr, 40% for unregistered / new
 * (CBSL Directions No. 01 of 2026, from 25 May 2026), default rate/term.
 */
import {
  CBSL_LTV_CAPS,
  DEFAULT_INTEREST_RATE_PCT,
  DEFAULT_TERM_YEARS,
  computeCashToOwn,
  inferFinanceClass,
  type VehicleFinanceClass,
} from "@/lib/cashToOwn";

export interface ListingMonthlyEstimate {
  monthlyLkr: number;
  financeClass: VehicleFinanceClass;
  ltvPct: number;
  ratePct: number;
  termYears: number;
}

export function estimateListingMonthly(input: {
  priceLkr: number | null | undefined;
  condition?: string | null;
  fuelType?: string | null;
  year?: number | null;
  isLeaseTakeover?: boolean;
  nowYear?: number;
}): ListingMonthlyEstimate | null {
  // A takeover price is not the full price: a loan figure on it would mislead.
  if (input.isLeaseTakeover) return null;
  const price = Number(input.priceLkr);
  if (!Number.isFinite(price) || price < 100_000 || price > 500_000_000) return null;
  const financeClass = inferFinanceClass({
    condition: input.condition,
    fuelType: input.fuelType,
    year: input.year,
    nowYear: input.nowYear,
  });
  const result = computeCashToOwn({ priceLkr: price, financeClass });
  if (!result || result.monthlyPaymentLkr <= 0) return null;
  return {
    monthlyLkr: result.monthlyPaymentLkr,
    financeClass,
    ltvPct: Math.round(CBSL_LTV_CAPS[financeClass] * 100),
    ratePct: DEFAULT_INTEREST_RATE_PCT,
    termYears: DEFAULT_TERM_YEARS,
  };
}

/** "Rs 98,500" — rounded to the nearest 500 so it doesn't look precise. */
export function formatMonthlyLkr(value: number): string {
  const rounded = Math.round(value / 500) * 500;
  return `Rs ${rounded.toLocaleString("en-LK")}`;
}
