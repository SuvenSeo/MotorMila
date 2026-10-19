/**
 * "What can I afford?" — inverse of the cash-to-own maths.
 *
 * Given cash on hand and a monthly instalment budget, find the highest vehicle
 * price where:
 *   loan        ≤ LTV cap × price               (CBSL Directions No. 01 of 2026)
 *   instalment(loan) ≤ monthly budget            (amortising, editable rate/term)
 *   cash ≥ price − loan + stamp duty on loan + transfer fee + first-year insurance
 *
 * All rates are editable planning assumptions, not lender quotes.
 */
import {
  CBSL_LTV_CAPS,
  DEFAULT_INTEREST_RATE_PCT,
  DEFAULT_STAMP_DUTY_PCT,
  DEFAULT_TERM_YEARS,
  DRIVE_AWAY_TRANSFER_LKR,
  estimateInsuranceAnnual,
  maxPrincipalForInstalment,
  monthlyPaymentForPrincipal,
} from "@/lib/cashToOwn";

export interface AffordabilityAssumptions {
  /** Max loan share for registered (>1 yr) used vehicles. */
  ltvRegistered: number;
  /** Max loan share for unregistered / reconditioned / <1 yr vehicles. */
  ltvUnregistered: number;
  annualRatePct: number;
  termYears: number;
  /** Stamp duty + lender fees as % of the financed amount. */
  stampDutyPct: number;
  /** DMT ownership transfer allowance (LKR). */
  transferFeeLkr: number;
  /** Include first-year comprehensive insurance in cash needed today. */
  includeInsurance: boolean;
}

export const DEFAULT_AFFORDABILITY_ASSUMPTIONS: AffordabilityAssumptions = {
  ltvRegistered: CBSL_LTV_CAPS.registered_used,
  ltvUnregistered: CBSL_LTV_CAPS.unregistered,
  annualRatePct: DEFAULT_INTEREST_RATE_PCT,
  termYears: DEFAULT_TERM_YEARS,
  stampDutyPct: DEFAULT_STAMP_DUTY_PCT,
  transferFeeLkr: DRIVE_AWAY_TRANSFER_LKR,
  includeInsurance: true,
};

export interface AffordabilityBreakdown {
  maxPriceLkr: number;
  loanLkr: number;
  downPaymentLkr: number;
  upfrontCostsLkr: number;
  monthlyLkr: number;
  /** Which limit bound the answer. */
  limitedBy: "cash" | "monthly" | "ltv" | "none";
}

export interface AffordabilityResult {
  registered: AffordabilityBreakdown;
  unregistered: AffordabilityBreakdown;
}

function upfront(price: number, loan: number, a: AffordabilityAssumptions): number {
  const stamp = loan * (a.stampDutyPct / 100);
  const insurance = a.includeInsurance ? estimateInsuranceAnnual(price) : 0;
  return stamp + Math.max(0, a.transferFeeLkr) + insurance;
}

function solve(cash: number, monthly: number, ltv: number, a: AffordabilityAssumptions): AffordabilityBreakdown {
  const safeCash = Math.max(0, Number(cash) || 0);
  const loanCapByMonthly = monthly > 0 ? maxPrincipalForInstalment(monthly, a.annualRatePct, a.termYears) ?? 0 : 0;
  const cappedLtv = Math.min(0.9, Math.max(0, ltv));

  const feasible = (price: number) => {
    const loan = Math.min(cappedLtv * price, loanCapByMonthly);
    return price - loan + upfront(price, loan, a) <= safeCash;
  };

  let lo = 0;
  let hi = Math.max(1, safeCash + loanCapByMonthly) * 1.01;
  if (!feasible(1)) {
    return { maxPriceLkr: 0, loanLkr: 0, downPaymentLkr: 0, upfrontCostsLkr: 0, monthlyLkr: 0, limitedBy: "cash" };
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (feasible(mid)) lo = mid;
    else hi = mid;
  }
  // Round down to the nearest Rs 10,000 so we never overstate.
  const price = Math.floor(lo / 10_000) * 10_000;
  const loan = Math.min(cappedLtv * price, loanCapByMonthly);
  const limitedBy: AffordabilityBreakdown["limitedBy"] =
    loanCapByMonthly <= 0 ? "cash" : cappedLtv * price >= loanCapByMonthly - 1 ? "monthly" : "ltv";

  return {
    maxPriceLkr: price,
    loanLkr: Math.round(loan),
    downPaymentLkr: Math.round(price - loan),
    upfrontCostsLkr: Math.round(upfront(price, loan, a)),
    monthlyLkr: Math.round(monthlyPaymentForPrincipal(loan, a.annualRatePct, a.termYears)),
    limitedBy,
  };
}

export function computeAffordability(
  cashLkr: number,
  monthlyLkr: number,
  assumptions: AffordabilityAssumptions = DEFAULT_AFFORDABILITY_ASSUMPTIONS,
): AffordabilityResult {
  return {
    registered: solve(cashLkr, monthlyLkr, assumptions.ltvRegistered, assumptions),
    unregistered: solve(cashLkr, monthlyLkr, assumptions.ltvUnregistered, assumptions),
  };
}

/** Search URL for the home inventory filtered to an affordable price band. */
export function buildAffordableSearchUrl(maxPriceLkr: number, opts: { condition?: "used" | "reconditioned"; priceMinLkr?: number } = {}): string {
  const params = new URLSearchParams();
  if (opts.priceMinLkr && opts.priceMinLkr > 0) params.set("price_min", String(Math.round(opts.priceMinLkr)));
  params.set("price_max", String(Math.max(0, Math.round(maxPriceLkr))));
  if (opts.condition) params.set("condition", opts.condition);
  return `/?${params.toString()}`;
}
