/**
 * Lease-takeover detector (shared util — listing UI, charts, alerts).
 *
 * Sri Lankan ads often put the *takeover amount* in the price field
 * ("Rs 2,175,000 + Leasing 199,000*59", "Ongoing lease", "Lease settle").
 * That number is not the full price, so it must never be scored as a deal or
 * fed into price averages. This module only reads the ad text — it never
 * invents a full price.
 *
 * Deliberately conservative on the negative side: "Leasing can be arranged",
 * "lease facilities available" and "lease fully settled" are ordinary ads.
 */

export interface LeaseTakeoverResult {
  isLeaseTakeover: boolean;
  /** The phrase that triggered the match (lower-cased), for debugging/tooltips. */
  matched: string | null;
  /** Monthly instalment when the ad states "199,000 x 59" style terms. */
  monthlyLkr: number | null;
  /** Instalments remaining when stated alongside the monthly figure. */
  monthsRemaining: number | null;
}

export interface LeaseTakeoverTextSource {
  title?: string | null;
  description?: string | null;
  variant?: string | null;
}

const NONE: LeaseTakeoverResult = {
  isLeaseTakeover: false,
  matched: null,
  monthlyLkr: null,
  monthsRemaining: null,
};

/** Phrases that mean the buyer takes over / settles an existing lease. */
const POSITIVE_PATTERNS: RegExp[] = [
  // "lease takeover", "lease take over", "leasing take-over", "lease transfer"
  /\bleas(?:e|ing)\s*(?:-|\s)?\s*(?:take\s*-?\s*over|transfer)\b/i,
  // "takeover", "take over" (vehicle ads use it almost only for leases)
  /\btake\s*-?\s*over\b/i,
  /\bcan\s+be\s+taken\s+over\b/i,
  // "lease settle", "settle the lease", "lease settlement" — NOT "settled"
  /\bleas(?:e|ing)\s*settle(?:ment)?\b(?!d)/i,
  /\bsettle\s+(?:the\s+)?leas(?:e|ing)\b/i,
  // "ongoing lease", "existing lease", "running lease", "continue the lease"
  /\b(?:ongoing|on-going|existing|running|current)\s+leas(?:e|ing)\b/i,
  /\bcontinu(?:e|ing)\s+(?:the\s+|with\s+the\s+)?(?:existing\s+)?leas(?:e|ing)\b/i,
  // "balance 24 installments", "balance of the instalments", "remaining installments"
  /\bbalance\b[^.\n]{0,40}?\binstal+ments?\b/i,
  /\bremaining\s+(?:\d{1,3}\s+)?instal+ments?\b/i,
  // "leasing balance 2.1M", "loan balance", "balance lease"
  /\b(?:leas(?:e|ing)|loan|facility)\s+balance\b/i,
  /\bbalance\s+(?:leas(?:e|ing)|loan)\b/i,
  // "Leasing 199,000*59", "lease rs.45,000 x 36"
  /\bleas(?:e|ing)\b[^.\n\d]{0,20}[\d,]{4,}(?:\.\d+)?\s*(?:\/=)?\s*[x×*]\s*\d{1,3}\b/i,
];

/** Ordinary leasing-finance phrases that must not trigger on their own. */
const NEGATIVE_PATTERNS: RegExp[] = [
  /\bleas(?:e|ing)\s+(?:can\s+be\s+)?(?:arranged|facilit(?:y|ies)|available|options?)\b/i,
  /\bleas(?:e|ing)\s+(?:is\s+)?(?:fully\s+)?(?:settled|cleared|closed|free)\b/i,
  /\b(?:no|without)\s+leas(?:e|ing)\b/i,
];

const TERMS_PATTERN = /([\d,]{4,})(?:\.\d+)?\s*(?:\/=)?\s*[x×*]\s*(\d{1,3})\b/i;

function normaliseText(input: string | Array<string | null | undefined> | null | undefined): string {
  if (input == null) return "";
  const parts = Array.isArray(input) ? input : [input];
  return parts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .join(" \n ");
}

function extractTerms(text: string): { monthlyLkr: number | null; monthsRemaining: number | null } {
  const m = text.match(TERMS_PATTERN);
  if (!m) return { monthlyLkr: null, monthsRemaining: null };
  const monthly = Number(m[1].replace(/,/g, ""));
  const months = Number(m[2]);
  // Sanity: a monthly lease instalment between Rs 5k and Rs 2M, 1–96 months.
  if (!Number.isFinite(monthly) || monthly < 5_000 || monthly > 2_000_000) {
    return { monthlyLkr: null, monthsRemaining: null };
  }
  if (!Number.isFinite(months) || months < 1 || months > 96) {
    return { monthlyLkr: monthly, monthsRemaining: null };
  }
  return { monthlyLkr: monthly, monthsRemaining: months };
}

/** Detect a lease takeover from raw ad text (title, description, …). */
export function detectLeaseTakeover(
  input: string | Array<string | null | undefined> | null | undefined,
): LeaseTakeoverResult {
  const text = normaliseText(input);
  if (!text) return NONE;

  // Strip the harmless phrases first so "Leasing can be arranged. Lease settled."
  // can't be re-matched by a broader positive pattern.
  let scrubbed = text;
  for (const neg of NEGATIVE_PATTERNS) scrubbed = scrubbed.replace(new RegExp(neg.source, "gi"), " ");

  for (const pattern of POSITIVE_PATTERNS) {
    const hit = scrubbed.match(pattern);
    if (hit) {
      const terms = extractTerms(scrubbed);
      return {
        isLeaseTakeover: true,
        matched: hit[0].trim().toLowerCase(),
        ...terms,
      };
    }
  }
  return NONE;
}

/** Convenience wrapper for listing-shaped objects. */
export function detectListingLeaseTakeover(listing: LeaseTakeoverTextSource | null | undefined): LeaseTakeoverResult {
  if (!listing) return NONE;
  return detectLeaseTakeover([listing.title, listing.variant, listing.description]);
}

export function isLeaseTakeoverListing(listing: LeaseTakeoverTextSource | null | undefined): boolean {
  return detectListingLeaseTakeover(listing).isLeaseTakeover;
}
