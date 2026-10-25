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

/* ── Responsive variants for marketplace photos (no image CDN of our own) ──
 * ikman's image host serves any size from the same path
 * (`…/<uuid>/<w>/<h>/cropped.jpg`), so cards ask for 320–620px instead of the
 * 1080px original (≈160 kB → ≈40 kB). Other hosts have a single size: no srcset. */
const IKMAN_SIZED_RE = /^(https:\/\/i\.ikman-st\.com\/.+?\/)(\d{2,4})\/(\d{2,4})\/(cropped|fitted)\.(jpg|jpeg|webp)$/i;
const IKMAN_WIDTHS = [320, 480, 620, 1080] as const;

/** `srcset` for a marketplace photo when its host can resize, else undefined. */
export function marketplaceSrcSet(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const m = IKMAN_SIZED_RE.exec(url);
  if (!m) return undefined;
  const [, base, w, h, mode, ext] = m;
  const ratio = Number(h) / Number(w);
  if (!Number.isFinite(ratio) || ratio <= 0) return undefined;
  return IKMAN_WIDTHS.map((width) => `${base}${width}/${Math.round(width * ratio)}/${mode}.${ext} ${width}w`).join(", ");
}

/* ── Hot-link circuit breaker ───────────────────────────────────────────────
 * Some boards (riyasewana, saleme) refuse hot-linked photos from some
 * networks. Each card then fires a doomed request and shimmers until it 403s.
 * After a few failures from a host with no success this session, later cards
 * go straight to the branded placeholder. A single success keeps the host on
 * for good (Sri Lankan residential visitors usually get the photos). */
const HOST_FAIL_LIMIT = 4;
const hostFailures = new Map<string, number>();
const hostLoaded = new Set<string>();

function imageHost(url: string): string | null {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function noteImageResult(url: string, ok: boolean): void {
  const host = imageHost(url);
  if (!host) return;
  if (ok) {
    hostLoaded.add(host);
    hostFailures.delete(host);
  } else if (!hostLoaded.has(host)) {
    hostFailures.set(host, (hostFailures.get(host) ?? 0) + 1);
  }
}

/** True when this session has seen the host refuse photos repeatedly (and never serve one). */
export function imageHostBlocked(url: string): boolean {
  const host = imageHost(url);
  if (!host || hostLoaded.has(host)) return false;
  return (hostFailures.get(host) ?? 0) >= HOST_FAIL_LIMIT;
}

/** Third-party photo (hot-linked): sent without a Referer, as most boards' hot-link rules allow. */
export function isRemoteImage(url: string | null | undefined): boolean {
  return Boolean(url && /^https?:\/\//i.test(url));
}

/** Test hook. */
export function resetImageHostState(): void {
  hostFailures.clear();
  hostLoaded.clear();
}
