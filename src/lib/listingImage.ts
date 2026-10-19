const PLACEHOLDER_IMAGE_HOSTS = new Set([
  "placehold.co",
  "via.placeholder.com",
  "dummyimage.com",
  "placekitten.com",
]);

/** Motormila-hosted thumbs. Never resolve these against a listing source URL. */
const FIRST_PARTY_IMAGE_PREFIXES = ["/demo/", "/brand/", "/hero/", "/assets/", "/logo"];

const MARKETPLACE_HOST_RE =
  /(riyasewana|ikman|patpat|autolanka|hitad|cartivate|autodirect)\./i;

function isFirstPartyImagePath(value: string): boolean {
  if (!value.startsWith("/")) return false;
  return FIRST_PARTY_IMAGE_PREFIXES.some(
    (prefix) => value === prefix || value.startsWith(prefix),
  );
}

function prefersAppOrigin(path: string, baseCandidates: string[]): boolean {
  if (isFirstPartyImagePath(path)) return true;
  if (!path.startsWith("/")) return false;
  return baseCandidates.every((base) => {
    try {
      return !MARKETPLACE_HOST_RE.test(new URL(base).hostname);
    } catch {
      return true;
    }
  });
}

function isAbsoluteUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
}

function normalizeBaseUrls(baseUrls: Array<unknown>): string[] {
  const normalized: string[] = [];

  for (const base of baseUrls) {
    if (typeof base !== "string") continue;
    const trimmed = base.trim();
    if (!trimmed) continue;

    const candidate = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
    if (!isAbsoluteUrl(candidate)) continue;

    try {
      normalized.push(new URL(candidate).toString());
    } catch {
      // Ignore malformed base URLs from source payloads.
    }
  }

  return normalized;
}

function getBaseOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://localhost";
}

export function normalizeVehicleImageUrl(value: unknown): string | null {
  return normalizeVehicleImageUrlWithBase(value, []);
}

export function normalizeVehicleImageUrlWithBase(value: unknown, baseUrls: Array<unknown>): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:")) return null;

  const baseCandidates = normalizeBaseUrls(baseUrls);
  const parseCandidates: string[] = [];

  if (trimmed.startsWith("//")) {
    parseCandidates.push(`https:${trimmed}`);
  } else if (isAbsoluteUrl(trimmed)) {
    parseCandidates.push(trimmed);
  } else {
    const preferOrigin = prefersAppOrigin(trimmed, baseCandidates);
    if (preferOrigin) {
      parseCandidates.push(new URL(trimmed, getBaseOrigin()).toString());
    }
    for (const base of baseCandidates) {
      parseCandidates.push(new URL(trimmed, base).toString());
    }
    if (!preferOrigin) {
      parseCandidates.push(new URL(trimmed, getBaseOrigin()).toString());
    }
  }

  for (const candidate of parseCandidates) {
    try {
      const parsed = new URL(candidate, getBaseOrigin());
      if (PLACEHOLDER_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) {
        continue;
      }
      return parsed.toString();
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

export function pickVehicleImageUrl(candidates: Array<unknown>, baseUrls: Array<unknown> = []): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeVehicleImageUrlWithBase(candidate, baseUrls);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

export interface ListingImageListSource {
  thumbnail_url?: string | null;
  images?: unknown;
  url?: string | null;
  detail_url?: string | null;
  external_url?: string | null;
}

/**
 * Every photo for a listing as normalized absolute URLs, primary first.
 * The stored `images` gallery leads (scrapers put the primary photo first);
 * `thumbnail_url` is appended only when it isn't already in the gallery.
 * Empty when the listing has no usable image at all.
 */
export function getListingImageList(listing: ListingImageListSource): string[] {
  const baseUrls = [listing.url, listing.detail_url, listing.external_url];
  const ordered: string[] = [];
  const seen = new Set<string>();

  const push = (candidate: unknown) => {
    const normalized = normalizeVehicleImageUrlWithBase(candidate, baseUrls);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      ordered.push(normalized);
    }
  };

  if (Array.isArray(listing.images)) {
    for (const candidate of listing.images) push(candidate);
  }
  push(listing.thumbnail_url);
  return ordered;
}
