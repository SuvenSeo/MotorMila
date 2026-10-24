/**
 * Hover / focus / idle prefetch of route chunks.
 *
 * This module imports no pages: App.tsx registers each route's loader (same
 * `import()` specifier as its lazy component, so the same chunk) through
 * `registerRouteLoaders`. That keeps routePrefetch out of the
 * page → ListingCard → routePrefetch import cycle.
 */

/** Exact pathnames that have their own chunk key. */
const EXACT_KEYS = new Set([
  "/",
  "/trends",
  "/estimate",
  "/calculator",
  "/ev-hub",
  "/ev-chargers",
  "/best-picks",
  "/price-index",
  "/official-pulse",
  "/docs",
  "/pricing",
  "/compare",
  "/permits",
  "/alerts",
  "/settings",
  "/dealer",
  "/mobile-app",
  // The admin console is unlisted and credential-gated, so it is never warmed
  // from the public shell — only an explicit visit loads it.
  "/pro",
  "/pro-preview",
  "/sign-in",
  "/sign-up",
  "/privacy",
  "/terms",
]);

/** Chunk key → loader, filled by App.tsx. */
const loaders: Record<string, () => Promise<unknown>> = {};

export function registerRouteLoaders(map: Record<string, () => Promise<unknown>>): void {
  Object.assign(loaders, map);
}

const warmed = new Set<string>();

export function pathnameOf(href: string): string {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("http") || trimmed.startsWith("mailto:")) return "";
  const withoutHash = trimmed.split("#")[0] || "/";
  if (!withoutHash || withoutHash === "/") return "/";
  return withoutHash.endsWith("/") && withoutHash.length > 1
    ? withoutHash.slice(0, -1)
    : withoutHash;
}

export function loaderKeyFor(pathname: string): string | null {
  if (EXACT_KEYS.has(pathname)) return pathname;
  if (pathname.startsWith("/listing/")) return "listing-detail";
  if (pathname.startsWith("/official-pulse/guide/")) return "pulse-guide";
  if (pathname.startsWith("/official-pulse/")) return "pulse-detail";
  if (pathname.startsWith("/locations/")) return "district-hub";
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "cars") return parts.length >= 3 ? "make-model-hub" : "make-hub";
  return null;
}

/** Warm the JS chunk for a route so the next navigation skips the spinner. */
export function prefetchRoute(href: string): void {
  const pathname = pathnameOf(href);
  if (!pathname) return;
  const key = loaderKeyFor(pathname);
  const loader = key ? loaders[key] : undefined;
  if (!key || !loader) return;
  if (warmed.has(key)) return;
  warmed.add(key);
  void loader().catch(() => {
    // A failed warm-up must not poison the key: the real navigation retries.
    warmed.delete(key);
  });
}

/** True when the visitor asked to save data or is on a slow connection. */
function constrainedNetwork(): boolean {
  if (typeof navigator === "undefined") return false;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!c) return false;
  return c.saveData === true || c.effectiveType === "slow-2g" || c.effectiveType === "2g" || c.effectiveType === "3g";
}

/** After first paint, warm the tabs users tap most (skipped on Save-Data / slow networks, where hover/tap intent still warms single routes). */
export function prefetchAppShellRoutes(): void {
  if (constrainedNetwork()) return;
  [
    "/trends",
    "/best-picks",
    "/calculator",
    "/estimate",
    "/ev-hub",
    "/official-pulse",
    "/compare",
    "/docs",
    "/mobile-app",
    "/listing/0",
    "/alerts",
  ].forEach(prefetchRoute);
}
