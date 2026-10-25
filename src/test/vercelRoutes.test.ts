import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isKnownRoutePath, isNoindexPath } from "@/lib/routeIndexing";

// vercel.json no longer rewrites *every* path to the SPA (that made unknown
// URLs soft-404s, and the static rewrites shadowed the prerendered SEO
// shells). Every <Route> in App.tsx must therefore be covered by either:
//   - an explicit SPA rewrite to "/" (dynamic routes), or
//   - a prerendered shell from scripts/prerender-seo.mjs STATIC_ROUTES
//     (served via cleanUrls as dist/<route>.html — it IS the SPA shell,
//     with per-route SEO meta, and React boots over it).
// This test fails when a new route is added without updating vercel.json,
// scripts/prerender-seo.mjs, and RouteMeta.
const root = path.resolve(__dirname, "../..");
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")) as {
  rewrites: Array<{ source: string; destination: string; has?: unknown }>;
  redirects?: Array<{ source: string; destination: string; permanent?: boolean }>;
};
const cfRedirects = readFileSync(path.join(root, "public/_redirects"), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const [from, to, status] = line.split(/\s+/);
    return { from, to, status: Number(status || 302) };
  });
const prerenderSource = readFileSync(path.join(root, "scripts/prerender-seo.mjs"), "utf8");

// Cloudflare Pages Functions (functions/listing/[id].js, functions/cars/[make]/...)
// serve their own HTML shells, so those routes need no _redirects rule.
function functionRoutes(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_")) continue;
    const seg = entry.name.replace(/\.js$/, "").replace(/^\[\[?([^\]]+)\]?\]$/, ":$1");
    if (entry.isDirectory()) out.push(...functionRoutes(path.join(dir, entry.name), `${prefix}/${seg}`));
    else if (entry.name.endsWith(".js")) out.push(seg === "index" ? prefix || "/" : `${prefix}/${seg}`);
  }
  return out;
}
const pagesFunctions = functionRoutes(path.join(root, "functions"))
  .filter((r) => !r.startsWith("/api/"))
  .map((r) => sourceToRegex(r));

function sourceToRegex(source: string): RegExp {
  const pattern = source
    .replace(/:[a-zA-Z]+\*/g, ".*")
    .replace(/:[a-zA-Z]+/g, "[^/]+");
  return new RegExp(`^${pattern}/?$`);
}

// With cleanUrls on, Vercel has no "/index.html" route (it 308s to "/"), so a
// rewrite to "/index.html" 404s on production. SPA rewrites must target "/".
const spaRules = vercel.rewrites
  .filter((r) => r.destination === "/" && !r.has)
  .map((r) => sourceToRegex(r.source));

// Static routes with a prerendered SEO shell (STATIC_ROUTES keys), served via
// Vercel cleanUrls as dist/<route>.html.
const prerendered = new Set(
  [...prerenderSource.matchAll(/"(\/[^"]*)":\s*\[/g)].map((m) => m[1]),
);

const routePaths = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((p) => p !== "*");

const sample = (p: string) => p.replace(/:year/g, "2018").replace(/:[a-zA-Z]+/g, "sample");

describe("vercel SPA routing", () => {
  it("never rewrites to /index.html while cleanUrls is on (it 404s on Vercel)", () => {
    const cfg = vercel as unknown as { cleanUrls?: boolean };
    if (cfg.cleanUrls) {
      expect(vercel.rewrites.filter((r) => /\.html$/.test(r.destination))).toEqual([]);
    }
  });

  it("found the App routes", () => {
    expect(routePaths.length).toBeGreaterThan(20);
  });

  it.each(routePaths)("serves %s as the SPA (not a 404)", (routePath) => {
    const url = sample(routePath);
    if (url === "/") return; // static index.html
    const viaRewrite = spaRules.some((re) => re.test(url));
    const viaShell = prerendered.has(url);
    const viaRedirect = (vercel.redirects ?? []).some((r) => sourceToRegex(r.source).test(url));
    expect(viaRewrite || viaShell || viaRedirect).toBe(true);
    expect(isKnownRoutePath(url)).toBe(true);
  });

  it.each(routePaths)("Cloudflare _redirects / shells cover %s", (routePath) => {
    const url = sample(routePath);
    if (url === "/") return;
    const viaShell = prerendered.has(url);
    const viaRule = cfRedirects.some((r) => sourceToRegex(r.from.replace(/\*$/, ":splat*")).test(url));
    const viaFunction = pagesFunctions.some((re) => re.test(url));
    expect(viaShell || viaRule || viaFunction).toBe(true);
  });

  it("301s retired paths instead of serving the indexable home shell", () => {
    const expected: Record<string, string> = {
      "/leasing": "/finance",
      "/admin": "/motormila/admin",
      "/price-index": "/trends",
      "/valuation": "/estimate",
    };
    for (const [from, to] of Object.entries(expected)) {
      expect(vercel.redirects).toContainEqual({ source: from, destination: to, permanent: true });
      expect(cfRedirects).toContainEqual({ from, to, status: 301 });
    }
  });

  it("never lets a _redirects 200 rule shadow a prerendered shell", () => {
    for (const r of cfRedirects.filter((x) => x.status === 200 && x.to === "/")) {
      for (const shell of prerendered) {
        expect(sourceToRegex(r.from.replace(/\*$/, ":splat*")).test(shell)).toBe(false);
      }
    }
  });

  it("treats unknown paths as 404/noindex", () => {
    expect(spaRules.some((re) => re.test("/this-does-not-exist-xyz"))).toBe(false);
    expect(prerendered.has("/this-does-not-exist-xyz")).toBe(false);
    expect(isKnownRoutePath("/this-does-not-exist-xyz")).toBe(false);
    expect(isKnownRoutePath("/listings")).toBe(false);
  });

  it("marks utility routes noindex", () => {
    for (const p of ["/sign-in", "/sign-up", "/profile", "/alerts", "/pro", "/dealer", "/motormila/admin", "/hero-lab"]) {
      expect(isNoindexPath(p)).toBe(true);
    }
    // INTERIM (merge review 2026-10-19): legal pages stay noindex until the
    // company is registered and a lawyer reviews the PDPA wording.
    for (const p of ["/privacy", "/terms", "/cookies", "/removal", "/delete-account"]) {
      expect(isNoindexPath(p)).toBe(true);
    }
    for (const p of ["/", "/cars/toyota/aqua", "/locations/colombo", "/pricing", "/listing/1", "/bot"]) {
      expect(isNoindexPath(p)).toBe(false);
    }
  });
});
