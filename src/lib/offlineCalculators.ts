/**
 * Offline calculator engine — a faithful client-side port of
 * `backend/app/api/v1/endpoints/calculators.py` plus
 * `backend/app/services/ownership_costs.py`.
 *
 * Why this exists: Neon Free transfer quota can take the live API down until
 * the 1st of the month. Every calculation here is pure math over user inputs
 * (plus a best-effort live fuel-price fetch that fails open to the same
 * fallbacks the backend uses), so the Calculator page and the ownership panel
 * keep working with zero database reads.
 *
 * Rule: any change to the backend schedules MUST be mirrored here (and the
 * `OFFLINE_ENGINE_VERSION` bumped) — search for the matching constant names.
 */
import type {
  ImportEligibilityResult,
  LandedCostInput,
  LandedCostResult,
  OwnershipBundleResult,
  OwnershipVehicleClass,
  TcoInput,
  TcoResult,
} from "@/services/api";
import {
  calculateLandedCost as apiCalculateLandedCost,
  calculateTco as apiCalculateTco,
  calculateOwnershipBundle as apiCalculateOwnershipBundle,
  checkImportEligibility as apiCheckImportEligibility,
} from "@/services/api";
import { getStoredAuthToken } from "@/lib/authToken";

/** Bump when the backend schedules change and this file is re-synced. */
export const OFFLINE_ENGINE_VERSION = "2026-09-21";

type FuelType = "petrol" | "diesel" | "hybrid" | "electric";
type VehicleClass = OwnershipVehicleClass;

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Landed cost (mirrors calculators.py) ─────────────────────────────────

const FALLBACK_PETROL_95 = 410.0;
const FALLBACK_DIESEL = 320.0;
const FALLBACK_ELECTRIC_KWH = 35.0;

const EXCISE_PETROL: Array<[number, number]> = [
  [1000, 2450.0],
  [1300, 3850.0],
  [1500, 4450.0],
  [1800, 5150.0],
  [2000, 6400.0],
  [2500, 7700.0],
  [Number.POSITIVE_INFINITY, 8900.0],
];

const EXCISE_HYBRID: Array<[number, number]> = [
  [1000, 2100.0],
  [1300, 3300.0],
  [1500, 3850.0],
  [1800, 4700.0],
  [2000, 5600.0],
  [2500, 7100.0],
  [Number.POSITIVE_INFINITY, 8400.0],
];

const EXCISE_DIESEL: Array<[number, number]> = [
  [1500, 5150.0],
  [1800, 6150.0],
  [2000, 7100.0],
  [2500, 8400.0],
  [Number.POSITIVE_INFINITY, 9650.0],
];

const EXCISE_ELECTRIC: Array<[number, number]> = [
  [50, 12500.0],
  [100, 25000.0],
  [200, 43000.0],
  [Number.POSITIVE_INFINITY, 55000.0],
];

const LUXURY_TAX_THRESHOLDS: Record<FuelType, [number, number]> = {
  petrol: [5000000.0, 1.0],
  diesel: [5000000.0, 1.2],
  hybrid: [5500000.0, 0.8],
  electric: [6000000.0, 0.6],
};

function bandRate(bands: Array<[number, number]>, value: number): number {
  for (const [limit, rate] of bands) {
    if (value <= limit) return rate;
  }
  return bands[bands.length - 1][1];
}

export function calculateLandedCostOffline(input: LandedCostInput): LandedCostResult {
  const cifLkr = input.cif_usd * input.exchange_rate;

  const cid = cifLkr * 0.2;
  const surcharge = input.apply_surcharge ? cid * 0.5 : 0.0;

  let excise = 0.0;
  if (input.fuel_type === "electric") {
    if (input.motor_kw == null) throw new Error("motor_kw is required for electric vehicles");
    excise = input.motor_kw * bandRate(EXCISE_ELECTRIC, input.motor_kw);
  } else {
    if (input.engine_cc == null) {
      throw new Error("engine_cc is required for petrol, diesel, and hybrid vehicles");
    }
    const bands =
      input.fuel_type === "petrol"
        ? EXCISE_PETROL
        : input.fuel_type === "hybrid"
          ? EXCISE_HYBRID
          : EXCISE_DIESEL;
    excise = input.engine_cc * bandRate(bands, input.engine_cc);
  }

  const sscl = input.apply_sscl ? (cifLkr + cid + surcharge + excise) * 0.025 : 0.0;
  const vat = (cifLkr + cid + surcharge + excise + sscl) * 0.18;

  const [threshold, rateExcess] = LUXURY_TAX_THRESHOLDS[input.fuel_type];
  const luxuryTax = Math.max(0, cifLkr - threshold) * rateExcess;

  const totalTax = cid + surcharge + excise + sscl + vat + luxuryTax;

  let notes = `Calculated with ${input.exchange_rate} USD/LKR rate. `;
  if (input.apply_surcharge) notes += "Includes 50% CID surcharge per gazette. ";
  if (input.fuel_type === "hybrid" && input.engine_cc && input.engine_cc <= 1500) {
    notes += "Sits under the 1500cc hybrid tax cliff band. ";
  }
  notes += "Computed on-device (offline engine).";

  return {
    cif_lkr: round2(cifLkr),
    cid: round2(cid),
    surcharge: round2(surcharge),
    excise: round2(excise),
    sscl: round2(sscl),
    vat: round2(vat),
    luxury_tax: round2(luxuryTax),
    total_tax: round2(totalTax),
    landed_cost: round2(cifLkr + totalTax),
    surcharge_applied: input.apply_surcharge,
    notes,
  };
}

// ── TCO (mirrors calculate_tco; Octane fetch fails open like the backend) ──

function fallbackFuelPrice(fuelType: FuelType): number {
  if (fuelType === "diesel") return FALLBACK_DIESEL;
  if (fuelType === "electric") return FALLBACK_ELECTRIC_KWH;
  return FALLBACK_PETROL_95;
}

async function liveFuelPrice(fuelType: FuelType): Promise<{ price: number; live: boolean }> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch("https://octane-smoky.vercel.app/api/fuel-price", {
        signal: controller.signal,
      });
      if (!res.ok) return { price: fallbackFuelPrice(fuelType), live: false };
      const data = (await res.json()) as { prices?: Record<string, unknown> };
      const prices = data.prices ?? {};
      const num = (v: unknown, fb: number): number => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : fb;
      };
      if (fuelType === "diesel") {
        return { price: num(prices.auto_diesel, FALLBACK_DIESEL), live: true };
      }
      if (fuelType === "electric") return { price: FALLBACK_ELECTRIC_KWH, live: false };
      return { price: num(prices.petrol_95, FALLBACK_PETROL_95), live: true };
    } finally {
      window.clearTimeout(timer);
    }
  } catch {
    return { price: fallbackFuelPrice(fuelType), live: false };
  }
}

export async function calculateTcoOffline(input: TcoInput): Promise<TcoResult> {
  const { price: fuelPrice, live } = await liveFuelPrice(input.fuel_type);
  const monthlyKm = input.daily_km * 30.0;
  const fuelMonthly = (monthlyKm / input.mileage_kmpl) * fuelPrice;
  const overheadMonthly =
    (input.insurance_annual + input.service_annual + input.tyres_annual + input.resale_loss_annual) /
    12.0;
  return {
    fuel_price_lkr: round2(fuelPrice),
    fuel_cost_monthly: round2(fuelMonthly),
    lease_cost_monthly: round2(input.lease_installment),
    overhead_cost_monthly: round2(overheadMonthly),
    total_tco_monthly: round2(fuelMonthly + input.lease_installment + overheadMonthly),
    notes: live
      ? "Using live fuel prices from Octane API. Computed on-device (offline engine)."
      : "Using fallback fuel prices. Computed on-device (offline engine).",
  };
}

// ── Ownership schedules (mirrors ownership_costs.py) ───────────────────────

const EMISSION_TEST_CAR_LKR = 1550.0;
const EMISSION_TEST_MOTORCYCLE_LKR = 1500.0;
const EMISSION_TEST_THREE_WHEELER_LKR = 2000.0;
const STAMP_DUTY_TP_LKR = 25.0;

const MOTOR_CAR_REVENUE_BANDS: Array<[number, number, number]> = [
  [762.0, 2500.0, 3900.0],
  [1016.0, 2600.0, 5000.0],
  [1270.0, 4000.0, 7500.0],
  [Number.POSITIVE_INFINITY, 5000.0, 10000.0],
];

const DUAL_PURPOSE_REVENUE: [number, number] = [2500.0, 4500.0];
const MOTORCYCLE_REVENUE_LKR = 900.0;
const THREE_WHEELER_REVENUE_LKR = 550.0;

const TP_MOTOR_CAR_BY_CC: Array<[number, number]> = [
  [1000, 2750.0],
  [1500, 3250.0],
  [2000, 4000.0],
  [2500, 5000.0],
  [10000, 6500.0],
];
const TP_MOTORCYCLE_LKR = 850.0;
const TP_THREE_WHEELER_LKR = 1200.0;
const TP_DUAL_PURPOSE_LKR = 3500.0;

const TRANSFER_FEE_MOTOR_CAR_LKR = 6500.0;
const TRANSFER_FEE_MOTORCYCLE_LKR = 1500.0;
const TRANSFER_FEE_THREE_WHEELER_LKR = 2000.0;
const TRANSFER_FEE_DUAL_PURPOSE_LKR = 6500.0;
const TRANSFER_STAMP_DUTY_PCT = 0.03;

function estimateUnladenKg(engineCc?: number | null): number {
  if (engineCc == null || engineCc <= 0) return 1100.0;
  if (engineCc <= 1000) return 850.0;
  if (engineCc <= 1500) return 1120.0;
  if (engineCc <= 2000) return 1350.0;
  return 1550.0;
}

export interface OwnershipBundleInput {
  vehicle_class?: VehicleClass;
  fuel_type: FuelType;
  engine_cc?: number;
  unladen_kg?: number;
  consideration_lkr?: number;
  include_transfer?: boolean;
}

interface RevenueLicenceArgs {
  vehicle_class: VehicleClass;
  fuel_type: FuelType;
  unladen_kg?: number;
  engine_cc?: number;
}

function revenueLicence(
  input: RevenueLicenceArgs,
): OwnershipBundleResult["revenue_licence"] {
  const weight =
    input.unladen_kg && input.unladen_kg > 0
      ? input.unladen_kg
      : estimateUnladenKg(input.engine_cc);
  let base: number;
  let emission: number;
  let note: string;
  if (input.vehicle_class === "motorcycle") {
    base = MOTORCYCLE_REVENUE_LKR;
    emission = EMISSION_TEST_MOTORCYCLE_LKR;
    note = "Motorcycle flat revenue licence (Motor Traffic Fees Regulations schedule).";
  } else if (input.vehicle_class === "three_wheeler") {
    base = THREE_WHEELER_REVENUE_LKR;
    emission = EMISSION_TEST_THREE_WHEELER_LKR;
    note = "Three-wheeler / motor tricycle van flat revenue licence.";
  } else if (input.vehicle_class === "dual_purpose") {
    const [petrolF, dieselF] = DUAL_PURPOSE_REVENUE;
    if (input.fuel_type === "diesel") base = dieselF;
    else if (input.fuel_type === "electric") base = petrolF * 0.5;
    else base = petrolF;
    emission = input.fuel_type === "electric" ? 0.0 : EMISSION_TEST_CAR_LKR;
    note = "Dual-purpose <1000 kg GVW baseline band (confirm provincial / eRL figure).";
  } else {
    let petrolF = 0;
    let dieselF = 0;
    for (const [upper, p, d] of MOTOR_CAR_REVENUE_BANDS) {
      if (weight < upper) {
        petrolF = p;
        dieselF = d;
        break;
      }
    }
    if (petrolF === 0) {
      const last = MOTOR_CAR_REVENUE_BANDS[MOTOR_CAR_REVENUE_BANDS.length - 1];
      petrolF = last[1];
      dieselF = last[2];
    }
    if (input.fuel_type === "diesel") base = dieselF;
    else if (input.fuel_type === "electric") base = petrolF * 0.5;
    else base = petrolF;
    emission = input.fuel_type === "electric" ? 0.0 : EMISSION_TEST_CAR_LKR;
    note =
      `Motor car Schedule VI band for ~${Math.round(weight)} kg unladen ` +
      `(${input.fuel_type !== "diesel" ? "petrol-equivalent" : "diesel"}). ` +
      "Provincial eRL may differ — confirm before payment.";
  }
  // The web client never sends a delay band (backend defaults to "none"),
  // so the offline engine plans with zero delay penalty like the API does.
  const delayCharge = 0.0;
  return {
    base_fee_lkr: round2(base),
    delay_charge_lkr: delayCharge,
    emission_test_lkr: round2(emission),
    total_lkr: round2(base + delayCharge + emission),
    schedule_note: note,
  };
}

function thirdPartyInsurance(
  vehicleClass: VehicleClass,
  engineCc?: number,
): OwnershipBundleResult["third_party_insurance"] {
  let base: number;
  let note: string;
  if (vehicleClass === "motorcycle") {
    base = TP_MOTORCYCLE_LKR;
    note = "Indicative motorcycle CMT floor.";
  } else if (vehicleClass === "three_wheeler") {
    base = TP_THREE_WHEELER_LKR;
    note = "Indicative three-wheeler CMT floor.";
  } else if (vehicleClass === "dual_purpose") {
    base = TP_DUAL_PURPOSE_LKR;
    note = "Indicative dual-purpose CMT floor.";
  } else {
    const cc = engineCc && engineCc > 0 ? engineCc : 1500;
    base = TP_MOTOR_CAR_BY_CC[TP_MOTOR_CAR_BY_CC.length - 1][1];
    for (const [upper, premium] of TP_MOTOR_CAR_BY_CC) {
      if (cc <= upper) {
        base = premium;
        break;
      }
    }
    note =
      `Indicative IRCSL CMT private motor-car floor for ~${engineCc || 1500} cc. ` +
      "Insurers may charge more; cannot legally charge less than the tariff floor.";
  }
  return {
    base_premium_lkr: round2(base),
    stamp_duty_lkr: STAMP_DUTY_TP_LKR,
    total_lkr: round2(base + STAMP_DUTY_TP_LKR),
    schedule_note: note,
  };
}

function transferFees(
  vehicleClass: VehicleClass,
  considerationLkr: number,
): NonNullable<OwnershipBundleResult["transfer"]> {
  const processing =
    vehicleClass === "motorcycle"
      ? TRANSFER_FEE_MOTORCYCLE_LKR
      : vehicleClass === "three_wheeler"
        ? TRANSFER_FEE_THREE_WHEELER_LKR
        : vehicleClass === "dual_purpose"
          ? TRANSFER_FEE_DUAL_PURPOSE_LKR
          : TRANSFER_FEE_MOTOR_CAR_LKR;
  const stamp = considerationLkr > 0 ? round2(considerationLkr * TRANSFER_STAMP_DUTY_PCT) : 0.0;
  return {
    processing_fee_lkr: processing,
    stamp_duty_lkr: stamp,
    total_lkr: round2(processing + stamp),
    schedule_note:
      "DMT ownership-change processing fee (indicative) plus optional " +
      `${Math.round(TRANSFER_STAMP_DUTY_PCT * 100)}% stamp-duty estimate on consideration. ` +
      "Confirm Divisional Secretariat / RMV counter figures.",
  };
}

export function calculateOwnershipBundleOffline(input: OwnershipBundleInput): OwnershipBundleResult {
  const vehicleClass = input.vehicle_class ?? "motor_car";
  const licence = revenueLicence({
    vehicle_class: vehicleClass,
    fuel_type: input.fuel_type,
    unladen_kg: input.unladen_kg,
    engine_cc: input.engine_cc,
  });
  const tp = thirdPartyInsurance(vehicleClass, input.engine_cc);
  const transfer = input.include_transfer
    ? transferFees(vehicleClass, input.consideration_lkr ?? 0)
    : null;
  const total = licence.total_lkr + tp.total_lkr + (transfer ? transfer.total_lkr : 0);
  return {
    revenue_licence: licence,
    third_party_insurance: tp,
    transfer,
    first_year_statutory_total_lkr: round2(total),
    notes:
      "Statutory-leaning first-year cash outlay (licence + emission + TP). " +
      "Comprehensive insurance and lease payments are separate. Computed on-device (offline engine).",
  };
}

export function checkImportEligibilityOffline(input: {
  fuel_type: FuelType;
  model_year?: number | null;
  asOfYear?: number;
}): ImportEligibilityResult {
  const asOfYear = input.asOfYear ?? new Date().getFullYear();
  if (asOfYear < 2025) {
    return {
      eligible: false,
      status: "restricted",
      reasons: ["Passenger vehicle import freeze was still in force before Feb 2025."],
      notes: "Import ban era — commercial clearance generally blocked for private cars.",
    };
  }
  const reasons = [
    "Passenger import freeze lifted (Feb 2025); compound CID/excise/VAT still apply.",
  ];
  let status: ImportEligibilityResult["status"] = "likely_allowed";
  if (input.model_year != null) {
    const age = asOfYear - input.model_year;
    if (age > 8) {
      status = "restricted";
      reasons.push(
        `Model year ${input.model_year} is ~${age} years old — typically outside practical ` +
          "used-import windows even after the ban lift.",
      );
    } else if (age > 5 && input.fuel_type !== "electric") {
      status = "needs_review";
      reasons.push(
        `Model year ${input.model_year} is ~${age} years old — used ICE/hybrid imports ` +
          "often face age caps or extra scrutiny; verify current Customs circulars.",
      );
    } else {
      reasons.push(`Model year ${input.model_year} is within a common used-import age window.`);
    }
  }
  if (input.fuel_type === "electric") {
    reasons.push(
      "Pure EV — often preferred under remittance / special-permit pathways; check permit stock.",
    );
  } else if (input.fuel_type === "diesel") {
    if (status === "likely_allowed") status = "needs_review";
    reasons.push(
      "Diesel passenger cars face higher excise and revenue-licence bands — cost and policy risk higher.",
    );
  }
  return {
    eligible: status !== "restricted",
    status,
    reasons,
    notes:
      "Planning screen only. Final eligibility depends on HS code, gazette duties, " +
      "Letters of Credit timing, and any active permit scheme.",
  };
}

// ── Resilient wrappers: live API first, offline engine on any failure ───────
// Consumers get the exact API result shapes plus an `offline` flag so the UI
// can badge on-device computation. The offline engine never throws for valid
// inputs, so these only reject on programmer error (bad input shapes).

/** Present when a result was computed on-device instead of by the API. */
export interface OfflineFlag {
  offline?: boolean;
}

async function tryApi<T>(fn: () => Promise<T>): Promise<T | null> {
  // The calculator endpoints are POSTs, and the API refuses every write that
  // lacks an Authorization Bearer token (403). Signed-out visitors would only
  // collect a console error and a wasted round trip before the on-device
  // fallback, so go straight to it.
  if (!getStoredAuthToken()) return null;
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function calculateLandedCostResilient(
  input: LandedCostInput,
): Promise<LandedCostResult & OfflineFlag> {
  const live = await tryApi(() => apiCalculateLandedCost(input));
  if (live) return live;
  return { ...calculateLandedCostOffline(input), offline: true };
}

export async function calculateTcoResilient(
  input: TcoInput,
): Promise<TcoResult & OfflineFlag> {
  const live = await tryApi(() => apiCalculateTco(input));
  if (live) return live;
  return { ...(await calculateTcoOffline(input)), offline: true };
}

export async function calculateOwnershipBundleResilient(input: {
  vehicle_class?: OwnershipVehicleClass;
  fuel_type: "petrol" | "diesel" | "hybrid" | "electric";
  engine_cc?: number;
  unladen_kg?: number;
  consideration_lkr?: number;
  include_transfer?: boolean;
}): Promise<OwnershipBundleResult & OfflineFlag> {
  const live = await tryApi(() => apiCalculateOwnershipBundle(input));
  if (live) return live;
  return {
    ...calculateOwnershipBundleOffline({
      vehicle_class: input.vehicle_class,
      fuel_type: input.fuel_type,
      engine_cc: input.engine_cc,
      unladen_kg: input.unladen_kg,
      consideration_lkr: input.consideration_lkr,
      include_transfer: input.include_transfer,
    }),
    offline: true,
  };
}

export async function checkImportEligibilityResilient(input: {
  fuel_type: "petrol" | "diesel" | "hybrid" | "electric";
  model_year?: number;
}): Promise<ImportEligibilityResult & OfflineFlag> {
  const live = await tryApi(() => apiCheckImportEligibility(input));
  if (live) return live;
  return {
    ...checkImportEligibilityOffline({ fuel_type: input.fuel_type, model_year: input.model_year }),
    offline: true,
  };
}
