import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { isKnownRoutePath, isNoindexPath } from "@/lib/routeIndexing";

// Cloudflare Pages serves the SPA from public/_redirects (200 rules to "/")
// plus prerendered shells from scripts/prerender-seo.mjs STATIC_ROUTES
// (served as dist/<route>.html — it IS the SPA shell, with per-route SEO
// meta, and React boots over it). Every <Route> in App.tsx must therefore
// be covered by either an explicit _redirects 200 rule or a prerendered
// shell. This test fails when a new route is added without updating
// public/_redirects, scripts/prerender-seo.mjs, and RouteMeta.
const root = path.resolve(__dirname, "../..");
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
const cfRedirects = readFileSync(path.join(root, "public/_redirects"), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const [from, to, status] = line.split(/\s+/);
    return { from, to, status: Number(status || 302) };
  });
const prerenderSource = readFileSync(path.join(root, "scripts/prerender-seo.mjs"), "utf8");

function sourceToRegex(source: string): RegExp {
  const pattern = source
    .replace(/:[a-zA-Z]+\*/g, ".*")
    .replace(/:[a-zA-Z]+\+/g, ".+")
    .replace(/:[a-zA-Z]+/g, "[^/]+");
  return new RegExp(`^${pattern}/?$`);
}

// SPA rules are the _redirects 200 rules that serve "/" (dynamic routes).
const spaRules = cfRedirects
  .filter((r) => r.status === 200 && r.to === "/")
  .map((r) => sourceToRegex(r.from.replace(/\*$/, ":splat*")));

// Static routes with a prerendered SEO shell (STATIC_ROUTES keys).
const prerendered = new Set(
  [...prerenderSource.matchAll(/"(\/[^"]*)":\s*\[/g)].map((m) => m[1]),
);

// Resolve relative child routes against their parent instead of treating
// <Route path="users"> as a top-level URL. Use the TSX tree so pathless
// layout routes and index routes keep the correct parent scope.
function collectRoutePaths(source: string): string[] {
  const paths = new Set<string>();
  const file = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node: ts.Node, parent = "") {
    const opening = ts.isJsxElement(node) ? node.openingElement
      : ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening?.tagName.getText(file) === "Route") {
      const attr = opening.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(file) === "path");
      const value = attr && ts.isJsxAttribute(attr) && attr.initializer && ts.isStringLiteral(attr.initializer)
        ? attr.initializer.text : undefined;
      const resolved = value === undefined ? parent
        : value.startsWith("/") ? value : `${parent.replace(/\/$/, "")}/${value}`;
      if (value !== undefined && !value.includes("*")) paths.add(resolved);
      if (ts.isJsxElement(node)) node.children.forEach((child) => visit(child, resolved));
      return;
    }
    ts.forEachChild(node, (child) => visit(child, parent));
  }
  visit(file);
  return [...paths];
}
const routePaths = collectRoutePaths(appSource);

const sample = (p: string) => p.replace(/:year/g, "2018").replace(/:[a-zA-Z]+/g, "sample");

describe("Pages SPA routing", () => {
  it("resolves nested routes through pathless layouts", () => {
    expect(collectRoutePaths(`<Route path="/motormila/admin"><Route element={<Layout />}>
      <Route index element={<Home />} /><Route path="users" element={<Users />} />
      <Route path="*" element={<Fallback />} /></Route></Route>`))
      .toEqual(["/motormila/admin", "/motormila/admin/users"]);
    expect(routePaths).toContain("/motormila/admin/users");
    expect(routePaths).not.toContain("users");
  });

  it("found the App routes", () => {
    expect(routePaths.length).toBeGreaterThan(20);
  });

  it.each(routePaths)("serves %s as the SPA (not a 404)", (routePath) => {
    const url = sample(routePath);
    if (url === "/") return; // static index.html
    const viaRewrite = spaRules.some((re) => re.test(url));
    const viaShell = prerendered.has(url);
    const viaRedirect = cfRedirects.some((r) => r.status === 301 && sourceToRegex(r.from).test(url));
    expect(viaRewrite || viaShell || viaRedirect).toBe(true);
    expect(isKnownRoutePath(url)).toBe(true);
  });

  it.each(routePaths)("Cloudflare _redirects / shells cover %s", (routePath) => {
    const url = sample(routePath);
    if (url === "/") return;
    const viaShell = prerendered.has(url);
    const viaRule = cfRedirects.some((r) => sourceToRegex(r.from.replace(/\*$/, ":splat*")).test(url));
    expect(viaShell || viaRule).toBe(true);
  });

  it("301s retired paths instead of serving the indexable home shell", () => {
    const expected: Record<string, string> = {
      "/leasing": "/finance",
      "/admin": "/motormila/admin",
      "/price-index": "/trends",
      "/valuation": "/estimate",
    };
    for (const [from, to] of Object.entries(expected)) {
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

  it("keeps admin deep links noindex at both hosts", () => {
    for (const routePath of routePaths.filter((p) => p.startsWith("/motormila/admin/"))) {
      expect(isNoindexPath(routePath)).toBe(true);
    }
    expect(readFileSync(path.join(root, "public/_headers"), "utf8"))
      .toMatch(/\/motormila\/admin\/\*\n\s+X-Robots-Tag: noindex, nofollow/);
  });

  it("marks utility routes noindex", () => {
    for (const p of ["/sign-in", "/sign-up", "/profile", "/alerts", "/pro", "/dealer", "/motormila/admin", "/motormila/admin/users", "/hero-lab"]) {
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
