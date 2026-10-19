export const SRI_LANKA_DISTRICTS = [
  "Colombo", "Gampaha", "Kalutara", "Kandy", "Matale", "Nuwara Eliya",
  "Galle", "Matara", "Hambantota", "Jaffna", "Kilinochchi", "Mannar",
  "Mullaitivu", "Vavuniya", "Batticaloa", "Ampara", "Trincomalee",
  "Kurunegala", "Puttalam", "Anuradhapura", "Polonnaruwa", "Badulla",
  "Monaragala", "Ratnapura", "Kegalle",
];

/** Canonical district center coordinates (matches backend SL_DISTRICT_COORDS). */
export const SL_DISTRICT_COORDS: Record<string, { lat: number; lng: number }> = {
  Colombo: { lat: 6.9271, lng: 79.8612 },
  Gampaha: { lat: 7.084, lng: 80.0098 },
  Kalutara: { lat: 6.5854, lng: 79.9607 },
  Kandy: { lat: 7.2906, lng: 80.6337 },
  Matale: { lat: 7.4675, lng: 80.6234 },
  "Nuwara Eliya": { lat: 6.9497, lng: 80.7891 },
  Galle: { lat: 6.0535, lng: 80.221 },
  Matara: { lat: 5.9549, lng: 80.555 },
  Hambantota: { lat: 6.1243, lng: 81.1185 },
  Jaffna: { lat: 9.6615, lng: 80.0255 },
  Kilinochchi: { lat: 9.3803, lng: 80.377 },
  Mannar: { lat: 8.981, lng: 79.9044 },
  Vavuniya: { lat: 8.7514, lng: 80.4971 },
  Mullaitivu: { lat: 9.2671, lng: 80.8142 },
  Batticaloa: { lat: 7.731, lng: 81.6747 },
  Ampara: { lat: 7.2964, lng: 81.6747 },
  Trincomalee: { lat: 8.5874, lng: 81.2152 },
  Kurunegala: { lat: 7.4863, lng: 80.3647 },
  Puttalam: { lat: 8.0362, lng: 79.8283 },
  Anuradhapura: { lat: 8.3114, lng: 80.4037 },
  Polonnaruwa: { lat: 7.9403, lng: 81.0188 },
  Badulla: { lat: 6.9934, lng: 81.055 },
  Monaragala: { lat: 6.8728, lng: 81.3507 },
  Ratnapura: { lat: 6.6828, lng: 80.3992 },
  Kegalle: { lat: 7.2513, lng: 80.3464 },
  "Sri Lanka": { lat: 7.8731, lng: 80.7718 },
};

const DISTRICT_ALIASES: Record<string, string> = {
  nuwaraeliya: "Nuwara Eliya",
  "nuwara eliya": "Nuwara Eliya",
  "gampaha district": "Gampaha",
  "colombo district": "Colombo",
  "kegalle district": "Kegalle",
};

export function normalizeDistrictName(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = String(value).trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  if (!cleaned) return null;
  // "Sri Lanka" is the country, not a district — never surface it as one.
  if (/^sri\s*lanka$/i.test(cleaned)) return null;
  const alias = DISTRICT_ALIASES[cleaned.toLowerCase()];
  if (alias) return alias;
  const title = cleaned.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  return Object.prototype.hasOwnProperty.call(SL_DISTRICT_COORDS, title) ? title : title;
}

export function districtCoords(district: string | null | undefined): { lat: number; lng: number } | null {
  const normalized = normalizeDistrictName(district);
  if (!normalized) return null;
  return SL_DISTRICT_COORDS[normalized] ?? null;
}
