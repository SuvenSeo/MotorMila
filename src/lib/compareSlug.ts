/**
 * Canonical compare-slug helpers (TRACK B2-C SEO rescue).
 *
 * Legacy share links use `/compare?ids=12,45`. The canonical form is the
 * slug path `/compare/12-vs-45` (numeric ascending, max 3 ids). crawlers
 * only ever see the slug path via canonical + sitemap; the query form
 * 301s to it (see docs/seo-runbook.md).
 *
 * Slug grammar shared with scripts/generate-routes.ts and
 * backend/app/api/v1/endpoints/seo.py — keep the three in sync.
 */

export const MAX_COMPARE_IDS = 3;
export const COMPARE_SLUG_PATTERN = /^\d+(?:-vs-\d+){0,2}$/;

function cleanIds(ids: Array<number | string>): number[] {
  const seen = new Set<number>();
  for (const raw of ids) {
    const n = typeof raw === "number" ? raw : Number.parseInt(String(raw).trim(), 10);
    if (Number.isInteger(n) && n > 0) seen.add(n);
  }
  return [...seen].sort((a, b) => a - b).slice(0, MAX_COMPARE_IDS);
}

/** [12, 45] -> "12-vs-45". Returns "" when fewer than 2 valid ids. */
export function toCompareSlug(ids: Array<number | string>): string {
  const clean = cleanIds(ids);
  return clean.length >= 2 ? clean.join("-vs-") : "";
}

/** "12-vs-45" -> [12, 45]. Returns [] for malformed slugs. */
export function fromCompareSlug(slug: string): number[] {
  const raw = String(slug || "").trim();
  if (!COMPARE_SLUG_PATTERN.test(raw)) return [];
  return cleanIds(raw.split("-vs-"));
}

/** Canonical path for a set of ids, or "/compare" when not comparable. */
export function canonicalComparePath(ids: Array<number | string>): string {
  const slug = toCompareSlug(ids);
  return slug ? `/compare/${slug}` : "/compare";
}

/** True when `pathname` is a canonical /compare/{slug} path. */
export function isCompareSlugPath(pathname: string): boolean {
  const segment = String(pathname || "").replace(/^\/compare\/?/, "");
  return segment.length > 0 && COMPARE_SLUG_PATTERN.test(segment);
}
