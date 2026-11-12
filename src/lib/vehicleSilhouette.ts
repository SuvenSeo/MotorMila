/**
 * Moody vehicle-type silhouettes for listings with no usable photo (no ad
 * photo, or the source refuses to serve it). Generated plates: a rim-lit,
 * unbranded vehicle in a dark studio (no badges, no plates). AVIF + WebP,
 * 960w / 480w, ~3–13 kB each, so a whole results page of riyasewana ads shares
 * one cached file per vehicle type.
 */
import carAvif from "../../assets/silhouette_car.avif";
import carAvifSm from "../../assets/silhouette_car-sm.avif";
import carWebp from "../../assets/silhouette_car.webp";
import carWebpSm from "../../assets/silhouette_car-sm.webp";
import suvAvif from "../../assets/silhouette_suv.avif";
import suvAvifSm from "../../assets/silhouette_suv-sm.avif";
import suvWebp from "../../assets/silhouette_suv.webp";
import suvWebpSm from "../../assets/silhouette_suv-sm.webp";
import bikeAvif from "../../assets/silhouette_bike.avif";
import bikeAvifSm from "../../assets/silhouette_bike-sm.avif";
import bikeWebp from "../../assets/silhouette_bike.webp";
import bikeWebpSm from "../../assets/silhouette_bike-sm.webp";
import tukAvif from "../../assets/silhouette_tuk.avif";
import tukAvifSm from "../../assets/silhouette_tuk-sm.avif";
import tukWebp from "../../assets/silhouette_tuk.webp";
import tukWebpSm from "../../assets/silhouette_tuk-sm.webp";
import vanAvif from "../../assets/silhouette_van.avif";
import vanAvifSm from "../../assets/silhouette_van-sm.avif";
import vanWebp from "../../assets/silhouette_van.webp";
import vanWebpSm from "../../assets/silhouette_van-sm.webp";
import lorryAvif from "../../assets/silhouette_lorry.avif";
import lorryAvifSm from "../../assets/silhouette_lorry-sm.avif";
import lorryWebp from "../../assets/silhouette_lorry.webp";
import lorryWebpSm from "../../assets/silhouette_lorry-sm.webp";

export type SilhouetteKind = "car" | "suv" | "bike" | "tuk" | "van" | "lorry";

export type Silhouette = {
  kind: SilhouetteKind;
  avif: string;
  avifSm: string;
  webp: string;
  webpSm: string;
};

const SETS: Record<SilhouetteKind, Silhouette> = {
  car: { kind: "car", avif: carAvif, avifSm: carAvifSm, webp: carWebp, webpSm: carWebpSm },
  suv: { kind: "suv", avif: suvAvif, avifSm: suvAvifSm, webp: suvWebp, webpSm: suvWebpSm },
  bike: { kind: "bike", avif: bikeAvif, avifSm: bikeAvifSm, webp: bikeWebp, webpSm: bikeWebpSm },
  tuk: { kind: "tuk", avif: tukAvif, avifSm: tukAvifSm, webp: tukWebp, webpSm: tukWebpSm },
  van: { kind: "van", avif: vanAvif, avifSm: vanAvifSm, webp: vanWebp, webpSm: vanWebpSm },
  lorry: { kind: "lorry", avif: lorryAvif, avifSm: lorryAvifSm, webp: lorryWebp, webpSm: lorryWebpSm },
};

/** Vehicle type from the listing's category, then body type, then title words. */
export function silhouetteKind(listing: {
  vehicle_category?: string | null;
  body_type?: string | null;
  title?: string | null;
}): SilhouetteKind {
  const text = [listing.vehicle_category, listing.body_type].map((v) => String(v ?? "").toLowerCase()).join(" ");
  const has = (re: RegExp) => re.test(text);
  if (has(/motor ?bike|motorcycle|scooter|bicycle|\bbikes?\b/)) return "bike";
  if (has(/three[- ]?wheel|tuk|auto ?rickshaw/)) return "tuk";
  if (has(/lorr|truck|heavy|tractor|tipper|bowser|crane/)) return "lorry";
  if (has(/\bvans?\b|bus|minivan|mpv/)) return "van";
  if (has(/suv|jeep|pickup|pick-up|crew|cab|4x4|crossover/)) return "suv";
  const title = String(listing.title ?? "").toLowerCase();
  if (/\b(scooter|motorbike|motorcycle)\b/.test(title)) return "bike";
  if (/\b(three ?wheel|tuk)\b/.test(title)) return "tuk";
  return "car";
}

export function silhouetteFor(listing: Parameters<typeof silhouetteKind>[0]): Silhouette {
  return SETS[silhouetteKind(listing)];
}
