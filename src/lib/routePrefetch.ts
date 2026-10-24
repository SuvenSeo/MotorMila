/** Map of pathname prefixes → lazy page factories used by hover/idle prefetch. */

const exactLoaders: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/pages/Dashboard"),
  "/trends": () => import("@/pages/Trends"),
  "/estimate": () => import("@/pages/Estimate"),
  "/calculator": () => import("@/pages/Calculator"),
  "/ev-hub": () => import("@/pages/EVHub"),
  "/ev-chargers": () => import("@/pages/EVChargers"),
  "/best-picks": () => import("@/pages/BestPicks"),
  "/price-index": () => import("@/pages/Trends"), // redirects to /trends
  "/official-pulse": () => import("@/pages/OfficialPulse"),
  "/docs": () => import("@/pages/Docs"),
  "/pricing": () => import("@/pages/Pricing"),
  "/compare": () => import("@/pages/Compare"),
  "/permits": () => import("@/pages/Permits"),
  "/alerts": () => import("@/pages/Alerts"),
  "/settings": () => import("@/pages/Settings"),
  "/dealer": () => import("@/pages/DealerDashboard"),
  "/mobile-app": () => import("@/pages/MobileApp"),
  // The admin console is unlisted and credential-gated, so it is never warmed
  // from the public shell — only an explicit visit loads it.
  "/pro": () => import("@/pages/ProDashboard"),
  "/pro-preview": () => import("@/pages/ProPreview"),
  "/sign-in": () => import("@/pages/SignIn"),
  "/sign-up": () => import("@/pages/SignUp"),
  "/privacy": () => import("@/pages/PrivacyPolicy"),
  "/terms": () => import("@/pages/TermsOfService"),
};

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
  if (exactLoaders[pathname]) return pathname;
  if (pathname.startsWith("/listing/")) return "listing-detail";
  if (pathname.startsWith("/official-pulse/guide/")) return "pulse-guide";
  if (pathname.startsWith("/official-pulse/")) return "pulse-detail";
  if (pathname.startsWith("/locations/")) return "district-hub";
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "cars") return parts.length >= 3 ? "make-model-hub" : "make-hub";
  return null;
}

function loaderFor(pathname: string): (() => Promise<unknown>) | null {
  if (exactLoaders[pathname]) return exactLoaders[pathname];
  if (pathname.startsWith("/listing/")) return () => import("@/pages/ListingDetail");
  if (pathname.startsWith("/official-pulse/guide/")) return () => import("@/pages/OfficialPulseGuide");
  if (pathname.startsWith("/official-pulse/")) return () => import("@/pages/OfficialPulseDetail");
  if (pathname.startsWith("/locations/")) return () => import("@/pages/DistrictHub");
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "cars") {
    return parts.length >= 3
      ? () => import("@/pages/MakeModelHub")
      : () => import("@/pages/MakeHub");
  }
  return null;
}

/** Warm the JS chunk for a route so the next navigation skips the spinner. */
export function prefetchRoute(href: string): void {
  const pathname = pathnameOf(href);
  if (!pathname) return;
  const key = loaderKeyFor(pathname);
  const loader = loaderFor(pathname);
  if (!key || !loader) return;
  if (warmed.has(key)) return;
  warmed.add(key);
  void loader();
}

/** After first paint, warm the tabs users tap most. */
export function prefetchAppShellRoutes(): void {
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
