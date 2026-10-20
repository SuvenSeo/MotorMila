import { readFileSync } from "node:fs";
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
};
const prerenderSource = readFileSync(path.join(root, "scripts/prerender-seo.mjs"), "utf8");

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
    expect(viaRewrite || viaShell).toBe(true);
    expect(isKnownRoutePath(url)).toBe(true);
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
