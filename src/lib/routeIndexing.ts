/** Utility / account routes: never indexed (auth, dashboards, admin, labs). */
const NOINDEX_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/profile",
  "/alerts",
  "/settings",
  "/dealer",
  "/pro",
  "/pro-preview",
  "/admin",
  "/motormila/admin",
  "/hero-lab",
  "/checkout",
  "/delete-account",
  // INTERIM (merge review 2026-10-19): legal pages stay out of the index until
  // the company is registered and a lawyer reviews the PDPA wording. Revert by
  // deleting the four lines below.
  "/privacy",
  "/terms",
  "/cookies",
  "/removal",
];

/** Mirrors the <Route> table in App.tsx (and the SPA allowlist in vercel.json). */
const KNOWN_ROUTE_PATTERNS: RegExp[] = [
  /^\/$/,
  /^\/(trends|estimate|calculator|ev-hub|ev-chargers|best-picks|sell|price-index|docs|pricing|privacy|terms|compare|valuation|permits|mobile-app|dealer|settings|alerts|profile|sign-in|sign-up|hero-lab|admin|pro|pro-preview|official-pulse|afford|safe-transfer|finance|leasing|inspection|insurance|cookies|removal|delete-account|how-we-price|bot)\/?$/,
  /^\/checkout\/return\/?$/,
  /^\/listing\/[^/]+\/?$/,
  /^\/cars\/[^/]+(\/[^/]+(\/\d{4})?)?\/?$/,
  /^\/locations\/[^/]+\/?$/,
  /^\/official-pulse\/(guide\/)?[^/]+\/?$/,
  /^\/compare\/[^/]+\/?$/,
  /^\/motormila\/admin\/?$/,
  // Typed-path redirects (App.tsx <Navigate>, 301 in vercel.json / _redirects).
  /^\/(prices|price|tools|calculators|tax-calculator|import-calculator|value|saved|watchlist|sell-my-car|plans|deals|app|login|signin|signup)\/?$/,
];

export function isNoindexPath(pathname: string): boolean {
  return NOINDEX_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isKnownRoutePath(pathname: string): boolean {
  return KNOWN_ROUTE_PATTERNS.some((re) => re.test(pathname));
}
