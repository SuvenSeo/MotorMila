import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isKnownRoutePath, isNoindexPath } from "@/lib/routeIndexing";

// vercel.json no longer rewrites *every* path to the SPA (that made unknown
// URLs soft-404s). Every <Route> in App.tsx must therefore be covered by an
// explicit SPA rewrite (or a prerendered file) — this test fails when a new
// route is added without updating vercel.json and RouteMeta.
const root = path.resolve(__dirname, "../..");
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")) as {
  rewrites: Array<{ source: string; destination: string; has?: unknown }>;
};

function sourceToRegex(source: string): RegExp {
  const pattern = source
    .replace(/:[a-zA-Z]+\*/g, ".*")
    .replace(/:[a-zA-Z]+/g, "[^/]+");
  return new RegExp(`^${pattern}/?$`);
}

const spaRules = vercel.rewrites
  .filter((r) => r.destination === "/index.html" && !r.has)
  .map((r) => sourceToRegex(r.source));

const routePaths = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((p) => p !== "*");

const sample = (p: string) => p.replace(/:year/g, "2018").replace(/:[a-zA-Z]+/g, "sample");

describe("vercel SPA routing", () => {
  it("found the App routes", () => {
    expect(routePaths.length).toBeGreaterThan(20);
  });

  it.each(routePaths)("serves %s as the SPA (not a 404)", (routePath) => {
    const url = sample(routePath);
    if (url === "/") return; // static index.html
    expect(spaRules.some((re) => re.test(url))).toBe(true);
    expect(isKnownRoutePath(url)).toBe(true);
  });

  it("treats unknown paths as 404/noindex", () => {
    expect(spaRules.some((re) => re.test("/this-does-not-exist-xyz"))).toBe(false);
    expect(isKnownRoutePath("/this-does-not-exist-xyz")).toBe(false);
    expect(isKnownRoutePath("/listings")).toBe(false);
  });

  it("marks utility routes noindex", () => {
    for (const p of ["/sign-in", "/sign-up", "/profile", "/alerts", "/pro", "/dealer", "/motormila/admin", "/hero-lab"]) {
      expect(isNoindexPath(p)).toBe(true);
    }
    for (const p of ["/", "/cars/toyota/aqua", "/locations/colombo", "/pricing", "/listing/1"]) {
      expect(isNoindexPath(p)).toBe(false);
    }
  });
});
