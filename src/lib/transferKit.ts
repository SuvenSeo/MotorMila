/**
 * Safe-Transfer Kit: pure helpers (deadline, cost estimate, agreement text).
 * Every figure is an indicative planning value: the UI says "check with DMT".
 */

/** DMT says it will strictly enforce the 14-day transfer rule from this date (announced Oct 2026). */
export const STRICT_ENFORCEMENT_DATE = "2026-12-01";
export const TRANSFER_DEADLINE_DAYS = 14;

export type TransferVehicleClass = "motor_car" | "dual_purpose" | "motorcycle" | "three_wheeler";

/** Indicative DMT ownership-transfer processing fees (mirrors backend ownership_costs.py). */
export const TRANSFER_FEES_LKR: Record<TransferVehicleClass, number> = {
  motor_car: 6_500,
  dual_purpose: 6_500,
  motorcycle: 1_500,
  three_wheeler: 2_000,
};

export const TRANSFER_CLASS_LABELS: Record<TransferVehicleClass, string> = {
  motor_car: "Car / SUV",
  dual_purpose: "Dual purpose (van, pickup, cab)",
  motorcycle: "Motorcycle",
  three_wheeler: "Three-wheeler",
};

/** YYYY-MM-DD + days → YYYY-MM-DD, calendar arithmetic (no timezone drift). */
export function addDaysIso(isoDate: string, days: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

export function transferDeadline(saleDateIso: string): { deadline: string | null; strict: boolean } {
  const deadline = addDaysIso(saleDateIso, TRANSFER_DEADLINE_DAYS);
  return { deadline, strict: !!deadline && deadline >= STRICT_ENFORCEMENT_DATE };
}

export interface TransferCostInput {
  vehicleClass: TransferVehicleClass;
  salePriceLkr: number;
  /** Optional stamp duty on the sale value (%), if your lawyer or lender applies one. */
  stampDutyPct: number;
  /** Optional extras: DMT online record, valuation, lawyer, inspection. */
  extrasLkr: number;
}

export interface TransferCostBreakdown {
  transferFeeLkr: number;
  stampDutyLkr: number;
  extrasLkr: number;
  totalLkr: number;
}

export function estimateTransferCost(input: TransferCostInput): TransferCostBreakdown {
  const transferFeeLkr = TRANSFER_FEES_LKR[input.vehicleClass] ?? TRANSFER_FEES_LKR.motor_car;
  const price = Math.max(0, Number(input.salePriceLkr) || 0);
  const stampDutyLkr = Math.round(price * Math.max(0, Number(input.stampDutyPct) || 0) / 100);
  const extrasLkr = Math.max(0, Math.round(Number(input.extrasLkr) || 0));
  return { transferFeeLkr, stampDutyLkr, extrasLkr, totalLkr: transferFeeLkr + stampDutyLkr + extrasLkr };
}

export interface SaleAgreementFields {
  sellerName: string;
  sellerNic: string;
  sellerAddress: string;
  buyerName: string;
  buyerNic: string;
  buyerAddress: string;
  regNo: string;
  makeModel: string;
  yearOfManufacture: string;
  chassisNo: string;
  engineNo: string;
  mileageKm: string;
  priceLkr: string;
  amountPaidLkr: string;
  saleDate: string;
  place: string;
}

export const EMPTY_AGREEMENT: SaleAgreementFields = {
  sellerName: "",
  sellerNic: "",
  sellerAddress: "",
  buyerName: "",
  buyerNic: "",
  buyerAddress: "",
  regNo: "",
  makeModel: "",
  yearOfManufacture: "",
  chassisNo: "",
  engineNo: "",
  mileageKm: "",
  priceLkr: "",
  amountPaidLkr: "",
  saleDate: "",
  place: "",
};

const blank = (v: string, width = 24) => (v && v.trim() ? v.trim() : "_".repeat(width));

/** Paragraphs for the printable agreement. Blank fields render as lines to fill by hand. */
export function buildAgreementParagraphs(f: SaleAgreementFields): string[] {
  const deadline = f.saleDate ? transferDeadline(f.saleDate).deadline : null;
  return [
    `This agreement is made at ${blank(f.place)} on ${blank(f.saleDate, 12)} between:`,
    `SELLER: ${blank(f.sellerName, 30)}, NIC ${blank(f.sellerNic, 14)}, of ${blank(f.sellerAddress, 40)}; and`,
    `BUYER: ${blank(f.buyerName, 30)}, NIC ${blank(f.buyerNic, 14)}, of ${blank(f.buyerAddress, 40)}.`,
    `1. VEHICLE. The Seller sells and the Buyer buys the motor vehicle bearing registration number ${blank(f.regNo, 12)}, ${blank(f.makeModel, 24)}, year of manufacture ${blank(f.yearOfManufacture, 6)}, chassis number ${blank(f.chassisNo, 20)}, engine number ${blank(f.engineNo, 16)}, odometer reading ${blank(f.mileageKm, 10)} km at handover (the "Vehicle").`,
    `2. PRICE. The total price is LKR ${blank(f.priceLkr, 14)}. The Buyer has paid LKR ${blank(f.amountPaidLkr, 14)} today, and the Seller acknowledges receipt. Any balance is payable as follows: ${"_".repeat(40)}.`,
    `3. TITLE. The Seller confirms they are the registered owner, that the Vehicle is free of any lease, hire-purchase, mortgage or other claim except: ${"_".repeat(30)}, and that the chassis and engine numbers match the Certificate of Registration (CR).`,
    `4. DOCUMENTS. On payment the Seller hands over the original CR, a duly signed transfer application (MTA-6), a copy of the Seller's NIC, the current revenue licence, the emission test certificate, all keys and the service records available.`,
    `5. TRANSFER. The parties will submit the ownership transfer to the Department of Motor Traffic within ${TRANSFER_DEADLINE_DAYS} days of this agreement${deadline ? `, that is on or before ${deadline}` : ""}. The Seller will not hand over signed but undated transfer papers ("open papers").`,
    `6. LIABILITY. From the date and time of handover (${"_".repeat(10)} hrs) the Buyer is responsible for the Vehicle, including fines, accidents and taxes. The Seller remains responsible for anything before that time.`,
    `7. CONDITION. The Buyer has inspected the Vehicle and accepts it in its present condition, except for the following disclosed defects: ${"_".repeat(36)}.`,
  ];
}
