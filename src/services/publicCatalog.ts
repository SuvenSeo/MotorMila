import { SNAPSHOT_BASE } from "./api";

/**
 * Public-catalog headline for the admin console.
 *
 * The admin `/overview` endpoint counts rows in the backend's own database,
 * which drifts from the merged snapshot that powers the public site (the
 * pipeline's system of record). This reads the same `stats-summary.json`
 * the homepage uses, so the console's "Live listings" tile agrees with what
 * visitors see. Returns `null` when the snapshot is unavailable — callers
 * should fall back to the backend-DB count in that case.
 */
export async function getPublicCatalogTotal(): Promise<number | null> {
  if (!SNAPSHOT_BASE || typeof window === "undefined") return null;
  const file = "stats-summary.json";
  // Primary: the configured snapshot base (usually the production CDN, so
  // every deployment reads fresh data). Fallback: the same-origin bundled
  // snapshots. Mirrors fetchSnapshotJSON in ./api without the catalog weight.
  const primary = new URL(`${SNAPSHOT_BASE}/${file}`, window.location.origin).toString();
  const sameOrigin = new URL(`/snapshots/latest/${file}`, window.location.origin).toString();
  const urls = sameOrigin === primary ? [primary] : [primary, sameOrigin];

  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) continue;
      const data = (await response.json()) as Record<string, unknown>;
      const total = Number(data.total_listings ?? data.priced_listings ?? 0);
      if (Number.isFinite(total) && total > 0) return total;
      return null;
    } catch {
      // Try the next URL.
    }
  }
  return null;
}
