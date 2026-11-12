/**
 * Parse the ways Sri Lankans type a vehicle price into whole rupees.
 *
 * Accepted (case-insensitive, spaces optional):
 *   "85L", "85 L", "85 lakh", "85 lakhs", "85 lks", "85 lacs"   → 8,500,000
 *   "8.5M", "8.5Mn", "8.5 mn", "8.5 million", "8.5 mil"          → 8,500,000
 *   "1.2 Cr", "1.2 crore"                                         → 12,000,000
 *   "850k", "850 K", "850 thousand"                              → 850,000
 *   "Rs 7,250,000", "Rs. 7,250,000", "LKR 7250000", "7250000/="  → 7,250,000
 *   Sinhala / Tamil units: "85 ලක්ෂ", "8.5 මිලියන", "85 லட்சம்", "8.5 மில்லியன்"
 *   A bare number under 1,000 ("8.5", "12") is read as millions — the unit
 *   every price on the site is shown in (Oct 2026: millions only). Lakh
 *   shorthand is still accepted when typed with its unit ("85L").
 *
 * Returns null for empty or unparseable input. Never returns cents.
 */

const UNIT_MULTIPLIERS: Array<{ re: RegExp; mult: number }> = [
  { re: /^(cr|crs|crore|crores|කෝටි|கோடி)$/u, mult: 10_000_000 },
  { re: /^(m|mn|mns|mil|mill|million|millions|මිලියන|மில்லியன்)$/u, mult: 1_000_000 },
  { re: /^(l|lk|lks|lkh|lakh|lakhs|lac|lacs|laks|ලක්ෂ|ලක්ෂය|ලක්ෂ්‍ය|லட்சம்|லட்ச)$/u, mult: 100_000 },
  { re: /^(k|thousand|දහස|ஆயிரம்)$/u, mult: 1_000 },
];

/** Bare numbers below this are interpreted as millions (the display unit). */
export const BARE_MN_CUTOFF = 1_000;

export function parsePriceInput(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().toLowerCase();
  if (!s) return null;

  // Currency markers and trailing "/=" (common in LK ads), "only", "neg".
  s = s
    .replace(/^(rs\.?|lkr|රු\.?|ரூ\.?)\s*/u, "")
    .replace(/\s*\/=?\s*$/u, "")
    .replace(/\s*(only|negotiable|neg\.?)\s*$/u, "")
    .trim();
  if (!s) return null;

  // number (with optional thousands commas / decimal) then optional unit.
  const match = s.match(/^([0-9][0-9,]*(?:\.[0-9]+)?|\.[0-9]+)\s*([^\s0-9.,].*)?$/u);
  if (!match) return null;
  const numeric = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return null;

  const unitRaw = (match[2] || "").trim().replace(/\.$/, "");
  if (unitRaw) {
    const unit = UNIT_MULTIPLIERS.find((u) => u.re.test(unitRaw));
    if (!unit) return null;
    return Math.round(numeric * unit.mult);
  }

  if (numeric > 0 && numeric < BARE_MN_CUTOFF) return Math.round(numeric * 1_000_000);
  return Math.round(numeric);
}

/**
 * Live display for a price text box: group digits with commas while the
 * user types a plain number ("7250000" → "7,250,000") but leave unit
 * shorthand ("85L", "8.5 mn") untouched so the user can finish typing.
 */
export function formatPriceInputDisplay(raw: string): string {
  const trimmed = raw.replace(/^\s+/, "");
  const plain = trimmed.replace(/^(rs\.?|lkr)\s*/i, "");
  if (/^[0-9,]+$/.test(plain) && plain.replace(/,/g, "").length > 3) {
    const digits = plain.replace(/,/g, "").replace(/^0+(?=\d)/, "");
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  return trimmed;
}
