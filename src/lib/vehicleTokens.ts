/**
 * Translated labels for the enum-ish listing fields scrapers hand us
 * (condition, transmission, fuel, body). Known values map to locale keys;
 * anything else is title-cased as-is so a new source value still renders.
 */
import { englishT, type TranslateFn } from "@/lib/translate";

export type VehicleTokenKind = "condition" | "transmission" | "fuel" | "body";

const KEYS: Record<VehicleTokenKind, Record<string, readonly [string, string]>> = {
  condition: {
    used: ["condition.used", "Used"],
    "pre owned": ["condition.used", "Used"],
    reconditioned: ["condition.reconditioned", "Reconditioned"],
    recondition: ["condition.reconditioned", "Reconditioned"],
    recon: ["condition.reconditioned", "Reconditioned"],
    "brand new": ["condition.brandNew", "Brand New"],
    new: ["condition.newShort", "New"],
  },
  transmission: {
    manual: ["trans.manual", "Manual"],
    automatic: ["trans.automatic", "Automatic"],
    auto: ["trans.automatic", "Automatic"],
    tiptronic: ["trans.tiptronic", "Tiptronic"],
    cvt: ["trans.cvt", "CVT"],
  },
  fuel: {
    petrol: ["fuel.petrol", "Petrol"],
    gasoline: ["fuel.petrol", "Petrol"],
    diesel: ["fuel.diesel", "Diesel"],
    hybrid: ["fuel.hybrid", "Hybrid"],
    "petrol hybrid": ["fuel.hybrid", "Hybrid"],
    electric: ["fuel.electric", "Electric"],
    ev: ["fuel.electric", "Electric"],
    "plug in hybrid": ["fuel.pluginHybrid", "Plug-in Hybrid"],
    "plugin hybrid": ["fuel.pluginHybrid", "Plug-in Hybrid"],
    phev: ["fuel.pluginHybrid", "Plug-in Hybrid"],
  },
  body: {
    sedan: ["body.sedan", "Sedan"],
    saloon: ["body.sedan", "Sedan"],
    hatchback: ["body.hatch", "Hatch"],
    hatch: ["body.hatch", "Hatch"],
    suv: ["body.suv", "SUV"],
    jeep: ["body.jeep", "Jeep"],
    wagon: ["body.wagon", "Wagon"],
    "station wagon": ["body.wagon", "Wagon"],
    van: ["body.van", "Van"],
    mpv: ["body.mpv", "MPV"],
    minivan: ["body.mpv", "MPV"],
    pickup: ["body.pickup", "Pickup"],
    "double cab": ["body.pickup", "Pickup"],
    coupe: ["body.coupe", "Coupe"],
    crossover: ["body.crossover", "Crossover"],
    convertible: ["body.cabrio", "Cabrio"],
    cabrio: ["body.cabrio", "Cabrio"],
  },
};

function normalize(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function titleCase(clean: string): string {
  return clean
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

/** True for the placeholder values scrapers use for "not stated". */
export function isUnknownToken(value: string | null | undefined): boolean {
  if (!value) return true;
  const clean = normalize(value);
  return !clean || /^(unknown|n\/?a|none|other|-)$/.test(clean);
}

/**
 * Display label for a listing field value, translated when the value is one we
 * know. Returns null for empty / "unknown" values so callers can hide the pill.
 */
export function vehicleTokenLabel(
  kind: VehicleTokenKind,
  value: string | null | undefined,
  t: TranslateFn = englishT,
): string | null {
  if (isUnknownToken(value)) return null;
  const clean = normalize(String(value));
  const hit = KEYS[kind][clean];
  if (hit) return t(hit[0], hit[1]);
  return titleCase(String(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim());
}
