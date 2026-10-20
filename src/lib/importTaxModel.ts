// Indicative Sri Lanka vehicle import tax model.
//
// This mirrors the STRUCTURE of the post-2025 import regime:
//   CIF → Customs Import Duty (CID) → CID surcharge → Excise duty charged
//   PER cm³ (per kW for EVs) in capacity bands → Luxury Tax on the CIF
//   portion above a fuel-specific threshold → VAT on the duty-inclusive base.
//
// ALL RATES COME FROM src/data/importTaxRates.json — the canonical source
// shared (via a CI parity test) with the backend calculator. Edit the JSON,
// not this file, when a gazette changes rates.

import taxRates from "@/data/importTaxRates.json";

export const TAX_MODEL_REVIEWED = taxRates.reviewed;

/** Gazette expiry of the temporary 50% CID surcharge (3 months from 2026-05-16). */
export const SURCHARGE_EXPIRY_ISO = taxRates.surcharge_expiry;

export interface SurchargeCountdown {
  daysLeft: number;
  expired: boolean;
  expiryLabel: string;
}

/** Days until the 50% surcharge's gazetted expiry; negative days clamp to 0 with expired=true. */
export function getSurchargeCountdown(now: Date = new Date()): SurchargeCountdown {
  const expiry = new Date(`${SURCHARGE_EXPIRY_ISO}T00:00:00+05:30`); // Sri Lanka time
  const msLeft = expiry.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));
  return {
    daysLeft,
    expired: msLeft <= 0,
    expiryLabel: expiry.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  };
}

export type ImportFuelType = "petrol" | "diesel" | "hybrid" | "electric";

export interface ImportTaxInput {
  cifLkr: number;
  fuelType: ImportFuelType;
  /** Engine capacity in cm³ — required for petrol/diesel/hybrid. */
  engineCc?: number;
  /** Motor power in kW — required for electric. */
  motorKw?: number;
}

export interface ImportTaxLine {
  key: string;
  label: string;
  amount: number;
  note?: string;
}

export interface ImportTaxResult {
  lines: ImportTaxLine[];
  totalTax: number;
  totalOnRoad: number;
}

const CID_RATE = taxRates.cid_rate;
const CID_SURCHARGE_RATE = taxRates.cid_surcharge_rate; // surcharge applied on the CID amount
const SSCL_RATE = taxRates.sscl_rate;
const VAT_RATE = taxRates.vat_rate;

interface Band {
  upTo: number; // inclusive upper bound of the band (cc or kW)
  ratePerUnit: number; // LKR per cm³ or per kW, applied to the full capacity
}

type RawBand = (number | null)[];

function toBands(raw: RawBand[]): Band[] {
  return raw.map(([upTo, ratePerUnit]) => ({
    upTo: upTo ?? Infinity,
    ratePerUnit: ratePerUnit ?? 0,
  }));
}

const EXCISE_BANDS_PER_CC: Record<Exclude<ImportFuelType, "electric">, Band[]> = {
  petrol: toBands(taxRates.excise_bands_per_cc.petrol),
  diesel: toBands(taxRates.excise_bands_per_cc.diesel),
  hybrid: toBands(taxRates.excise_bands_per_cc.hybrid),
};

const EXCISE_BANDS_PER_KW: Band[] = toBands(taxRates.excise_bands_per_kw);

const LUXURY_TAX: Record<ImportFuelType, { thresholdLkr: number; rateOnExcess: number }> = {
  petrol: { thresholdLkr: taxRates.luxury_tax.petrol.threshold_lkr, rateOnExcess: taxRates.luxury_tax.petrol.rate_on_excess },
  diesel: { thresholdLkr: taxRates.luxury_tax.diesel.threshold_lkr, rateOnExcess: taxRates.luxury_tax.diesel.rate_on_excess },
  hybrid: { thresholdLkr: taxRates.luxury_tax.hybrid.threshold_lkr, rateOnExcess: taxRates.luxury_tax.hybrid.rate_on_excess },
  electric: { thresholdLkr: taxRates.luxury_tax.electric.threshold_lkr, rateOnExcess: taxRates.luxury_tax.electric.rate_on_excess },
};

function bandRate(bands: Band[], units: number): number {
  const band = bands.find((item) => units <= item.upTo) ?? bands[bands.length - 1];
  return band.ratePerUnit;
}

/** Common Sri Lanka hybrid excise band boundary — many imports target ≤ this capacity. */
export const HYBRID_EXCISE_CLIFF_CC = 1500;

export function getExciseRatePerCc(
  fuelType: Exclude<ImportFuelType, "electric">,
  engineCc: number,
): number {
  const cc = Math.max(0, Number(engineCc) || 0);
  return bandRate(EXCISE_BANDS_PER_CC[fuelType], cc);
}

export interface HybridExciseCliffInsight {
  cliffCc: number;
  rateAtOrBelowCliff: number;
  rateAboveCliff: number;
  exciseAtCliff: number;
  exciseOneCcAbove: number;
  exciseStepUp: number;
  petrolRateAtCliff: number;
  exciseSavingVsPetrolAtCliff: number;
}

export function getHybridExciseCliffInsight(
  cliffCc: number = HYBRID_EXCISE_CLIFF_CC,
): HybridExciseCliffInsight {
  const rateAtOrBelowCliff = getExciseRatePerCc("hybrid", cliffCc);
  const rateAboveCliff = getExciseRatePerCc("hybrid", cliffCc + 1);
  const petrolRateAtCliff = getExciseRatePerCc("petrol", cliffCc);
  const exciseAtCliff = cliffCc * rateAtOrBelowCliff;
  const exciseOneCcAbove = (cliffCc + 1) * rateAboveCliff;

  return {
    cliffCc,
    rateAtOrBelowCliff,
    rateAboveCliff,
    exciseAtCliff,
    exciseOneCcAbove,
    exciseStepUp: exciseOneCcAbove - exciseAtCliff,
    petrolRateAtCliff,
    exciseSavingVsPetrolAtCliff: cliffCc * (petrolRateAtCliff - rateAtOrBelowCliff),
  };
}

export function isAtHybridExciseCliff(engineCc: number, toleranceCc = 50): boolean {
  const cc = Math.max(0, Number(engineCc) || 0);
  return Math.abs(cc - HYBRID_EXCISE_CLIFF_CC) <= toleranceCc;
}

export type HybridCliffBadgeKind = "tax_safe" | "at_cliff" | "above_cliff";

export interface HybridCliffBadgeInfo {
  kind: HybridCliffBadgeKind;
  label: string;
  detail: string;
  engineCc: number;
}

function isHybridFuel(fuelType: string | null | undefined): boolean {
  const fuel = String(fuelType || "").toLowerCase();
  return fuel.includes("hybrid") || fuel === "phev" || fuel.includes("plugin");
}

/** Classify a listing for hybrid excise cliff messaging (import planning). */
export function getHybridCliffBadge(
  fuelType: string | null | undefined,
  engineCc: number | null | undefined,
): HybridCliffBadgeInfo | null {
  if (!isHybridFuel(fuelType)) return null;
  const cc = Number(engineCc);
  if (!Number.isFinite(cc) || cc <= 0) return null;

  const insight = getHybridExciseCliffInsight();

  if (cc <= HYBRID_EXCISE_CLIFF_CC) {
    const nearCliff = cc >= HYBRID_EXCISE_CLIFF_CC - 50;
    return {
      kind: nearCliff ? "at_cliff" : "tax_safe",
      label: nearCliff ? "Near 1,500cc cliff" : "Tax-safe ≤1,500cc HV",
      detail: nearCliff
        ? `Hybrid at ${cc.toLocaleString()}cc sits at the preferred ≤${HYBRID_EXCISE_CLIFF_CC}cc excise band (≈ Rs. ${insight.rateAtOrBelowCliff.toLocaleString()}/cc). Crossing adds roughly Rs. ${Math.round(insight.exciseStepUp / 1_000_000)}M+.`
        : `Hybrid ${cc.toLocaleString()}cc is inside the ≤${HYBRID_EXCISE_CLIFF_CC}cc band (≈ Rs. ${insight.rateAtOrBelowCliff.toLocaleString()}/cc).`,
      engineCc: cc,
    };
  }

  return {
    kind: "above_cliff",
    label: `Cliff: ${cc.toLocaleString()}cc`,
    detail: `Hybrid above ${HYBRID_EXCISE_CLIFF_CC}cc moves to ≈ Rs. ${insight.rateAboveCliff.toLocaleString()}/cc. Prefer a ≤${HYBRID_EXCISE_CLIFF_CC}cc alternative when import tax matters.`,
    engineCc: cc,
  };
}

export function computeImportTaxes(input: ImportTaxInput): ImportTaxResult {
  const cif = Math.max(0, Number(input.cifLkr) || 0);

  const cid = cif * CID_RATE;
  const surcharge = cid * CID_SURCHARGE_RATE;

  let excise = 0;
  let exciseNote = "";
  if (input.fuelType === "electric") {
    const kw = Math.max(0, Number(input.motorKw) || 0);
    const rate = bandRate(EXCISE_BANDS_PER_KW, kw);
    excise = kw * rate;
    exciseNote = kw > 0 ? `Rs. ${rate.toLocaleString()} × ${kw.toLocaleString()} kW` : "Enter motor power (kW)";
  } else {
    const cc = Math.max(0, Number(input.engineCc) || 0);
    const rate = bandRate(EXCISE_BANDS_PER_CC[input.fuelType], cc);
    excise = cc * rate;
    exciseNote = cc > 0 ? `Rs. ${rate.toLocaleString()} × ${cc.toLocaleString()} cc` : "Enter engine capacity";
  }

  const luxury = LUXURY_TAX[input.fuelType];
  const luxuryExcess = Math.max(0, cif - luxury.thresholdLkr);
  const luxuryTax = luxuryExcess * luxury.rateOnExcess;

  // SSCL on (CIF + CID + Surcharge + Excise)
  const sscl = (cif + cid + surcharge + excise) * SSCL_RATE;

  // VAT (18%) on top of duty-inclusive + SSCL base
  const vat = (cif + cid + surcharge + excise + sscl) * VAT_RATE;

  const lines: ImportTaxLine[] = [
    { key: "cid", label: `Customs Import Duty (${Math.round(CID_RATE * 100)}%)`, amount: cid },
    { key: "surcharge", label: `CID Surcharge (${Math.round(CID_SURCHARGE_RATE * 100)}% of CID)`, amount: surcharge },
    {
      key: "excise",
      label: input.fuelType === "electric" ? "Excise Duty (per kW band)" : "Excise Duty (per cm³ band)",
      amount: excise,
      note: exciseNote,
    },
    { key: "sscl", label: `SSCL Levy (${(SSCL_RATE * 100).toFixed(1)}%)`, amount: sscl },
    { key: "vat", label: `VAT (${Math.round(VAT_RATE * 100)}% on duty-inclusive + SSCL base)`, amount: vat },
  ];

  if (luxuryTax > 0) {
    lines.push({
      key: "luxury",
      label: `Luxury Tax (${Math.round(luxury.rateOnExcess * 100)}% of CIF above Rs. ${(luxury.thresholdLkr / 1_000_000).toFixed(1)}M)`,
      amount: luxuryTax,
    });
  }

  const totalTax = lines.reduce((sum, line) => sum + line.amount, 0);

  return {
    lines,
    totalTax,
    totalOnRoad: cif + totalTax,
  };
}
