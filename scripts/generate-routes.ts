/**
 * TRACK B2-C SEO rescue — static route manifest generator.
 *
 * Pulls hub aggregates from the backend (`GET /api/v1/seo/route-manifest`)
 * and emits:
 *   - public/seo/routes.json               (manifest, top 500, capped)
 *   - public/seo/sample-toyota-aqua.html   (1 pre-rendered sample hub page)
 *
 * No full SSG build yet — this is the manifest + sample step. When the
 * backend is unreachable (CI, offline), falls back to a curated seed list
 * so the manifest/sample stay reproducible.
 *
 * Usage:
 *   node scripts/generate-routes.ts [--check]
 *   --check  verify every internal link in the sample page exists in the
 *            manifest (link check, exit 1 on failure).
 *
 * Slug grammar shared with src/lib/compareSlug.ts and
 * backend/app/api/v1/endpoints/seo.py — keep the three in sync.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE_ORIGIN = "https://motormila.pages.dev";
const API_BASE =
  process.env.SEO_API_BASE?.replace(/\/+$/, "") ||
  "https://seo292-vehicle-platform-backend.hf.space/api/v1";
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "seo");
const MANIFEST_PATH = join(OUT_DIR, "routes.json");
const SAMPLE_PATH = join(OUT_DIR, "sample-toyota-aqua.html");
const MAX_URLS = 500;

interface ManifestRow {
  path: string;
  kind: "make-model" | "make-model-year" | "district" | "compare";
  make?: string;
  model?: string;
  year?: number;
  district?: string;
  slug?: string;
}

interface Manifest {
  generated_at: string;
  source: "backend" | "seed";
  site_origin: string;
  cap: number;
  counts: Record<string, number> & { total: number };
  urls: ManifestRow[];
}

export function slugify(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function toCompareSlug(ids: number[]): string {
  const clean = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))]
    .sort((a, b) => a - b)
    .slice(0, 4);
  return clean.length >= 2 ? clean.join("-vs-") : "";
}

/** Curated fallback: top SL makes/models, districts, example compares. */
function seedRows(): ManifestRow[] {
  const models: Array<[string, string, number[]]> = [
    ["Toyota", "Aqua", [2014, 2017, 2019]],
    ["Toyota", "Prius", [2016, 2019]],
    ["Toyota", "Corolla", [2018]],
    ["Toyota", "Premio", [2017]],
    ["Toyota", "Vitz", [2016]],
    ["Toyota", "Hilux", [2019]],
    ["Honda", "Fit", [2015, 2018]],
    ["Honda", "Vezel", [2017]],
    ["Honda", "Civic", [2018]],
    ["Honda", "Freed", [2017]],
    ["Suzuki", "Swift", [2017]],
    ["Suzuki", "Wagon R", [2018]],
    ["Suzuki", "Alto", [2019]],
    ["Suzuki", "Baleno", [2017]],
    ["Nissan", "Leaf", [2018]],
    ["Nissan", "Note", [2017]],
    ["Nissan", "X-Trail", [2016]],
    ["Mitsubishi", "Mirage", [2016]],
    ["Mazda", "Demio", [2016]],
    ["Mazda", "Axela", [2015]],
    ["Hyundai", "Tucson", [2018]],
    ["Kia", "Sportage", [2018]],
    ["Daihatsu", "Mira", [2017]],
    ["Toyota", "Land Cruiser", []],
    ["Toyota", "Allion", [2016]],
  ];
  const districts = [
    "colombo", "gampaha", "kalutara", "kandy", "matale", "nuwara-eliya",
    "galle", "matara", "hambantota", "jaffna", "kilinochchi", "mannar",
    "vavuniya", "mullaitivu", "batticaloa", "ampara", "trincomalee",
    "kurunegala", "puttalam", "anuradhapura", "polonnaruwa", "badulla",
    "moneragala", "ratnapura", "kegalle",
  ];
  const rows: ManifestRow[] = [];
  for (const [make, model, years] of models) {
    const makeSlug = slugify(make);
    const modelSlug = slugify(model);
    rows.push({
      path: `/cars/${makeSlug}/${modelSlug}`,
      kind: "make-model",
      make,
      model,
    });
    for (const year of years) {
      rows.push({
        path: `/cars/${makeSlug}/${modelSlug}/${year}`,
        kind: "make-model-year",
        make,
        model,
        year,
      });
    }
  }
  for (const district of districts) {
    rows.push({ path: `/locations/${district}`, kind: "district", district });
  }
  const examplePairs: Array<[number, number]> = [
    [101, 202], [303, 404], [505, 606], [707, 808], [909, 1010],
    [111, 222], [333, 444], [555, 666], [777, 888], [999, 1001],
  ];
  for (const pair of examplePairs) {
    const slug = toCompareSlug(pair);
    if (slug) rows.push({ path: `/compare/${slug}`, kind: "compare", slug });
  }
  return rows;
}

async function fetchBackendRows(): Promise<ManifestRow[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(`${API_BASE}/seo/route-manifest?limit=${MAX_URLS}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { urls?: ManifestRow[] };
    if (!Array.isArray(data?.urls) || data.urls.length === 0) return null;
    return data.urls.filter((r) => typeof r?.path === "string" && r.path.startsWith("/"));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function renderSample(urls: string[]): string {
  const vehicle = "Toyota Aqua";
  const title = `${vehicle} Price Sri Lanka — Live Listings, Trends & Fair Value | Motormila`;
  const description = `${vehicle} prices in Sri Lanka (LKR): live listings, district breakdown, price trends and fair-value signals on Motormila.`;
  const canonical = `${SITE_ORIGIN}/cars/toyota/aqua`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Car",
        name: `${vehicle} — Sri Lanka market`,
        url: canonical,
        brand: { "@type": "Brand", name: "Toyota" },
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "LKR",
          availability: "https://schema.org/InStock",
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: "Toyota", item: `${SITE_ORIGIN}/cars/toyota` },
          { "@type": "ListItem", position: 3, name: vehicle, item: canonical },
        ],
      },
    ],
  };
  const links = urls
    .slice(0, 12)
    .map((u) => `    <li><a href="${u}">${titleCase(u.split("/").filter(Boolean).slice(-1)[0])}</a></li>`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<meta name="description" content="${description}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Motormila" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${SITE_ORIGIN}/og-card.jpg" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${SITE_ORIGIN}/og-card.jpg" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>body{background:#09090b;color:#f4f4f5;font-family:system-ui,sans-serif;margin:0;padding:2rem}a{color:#0a7aff}</style>
</head>
<body>
<h1>${vehicle} Price Sri Lanka — Live Listings, Trends &amp; Fair Value</h1>
<p>${description}</p>
<nav aria-label="Related markets">
<ul>
${links}
</ul>
</nav>
</body>
</html>
`;
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes("--check");
  if (checkOnly) {
    if (!existsSync(MANIFEST_PATH) || !existsSync(SAMPLE_PATH)) {
      console.error("link-check: manifest or sample missing — run without --check first.");
      process.exit(1);
    }
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
    const known = new Set(manifest.urls.map((u) => u.path));
    const html = readFileSync(SAMPLE_PATH, "utf8");
    const hrefs = [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
    const internal = hrefs.filter((h) => !h.startsWith("/assets/"));
    const missing = internal.filter((h) => !known.has(h));
    console.log(`link-check: ${internal.length} internal links, ${missing.length} missing.`);
    if (missing.length > 0) {
      for (const m of missing) console.error(`  missing from manifest: ${m}`);
      process.exit(1);
    }
    console.log("link-check: OK");
    return;
  }

  const backendRows = await fetchBackendRows();
  const source: Manifest["source"] = backendRows ? "backend" : "seed";
  const rows = (backendRows ?? seedRows()).slice(0, MAX_URLS);
  const counts: Manifest["counts"] = {
    "make-model": 0,
    "make-model-year": 0,
    district: 0,
    compare: 0,
    total: rows.length,
  };
  for (const row of rows) {
    if (row.kind in counts) counts[row.kind] += 1;
  }
  const manifest: Manifest = {
    generated_at: new Date().toISOString(),
    source,
    site_origin: SITE_ORIGIN,
    cap: MAX_URLS,
    counts,
    urls: rows,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  // Sample links must be manifest members so --check passes: prefer real
  // hub paths, always including the canonical Toyota Aqua page itself.
  const manifestPaths = rows.map((r) => r.path);
  const sampleLinks = [
    "/cars/toyota/aqua",
    ...manifestPaths.filter((p) => p !== "/cars/toyota/aqua"),
  ];
  writeFileSync(SAMPLE_PATH, renderSample(sampleLinks));
  console.log(
    `generate-routes: source=${source} total=${rows.length} ` +
      `(make-model=${counts["make-model"]}, year=${counts["make-model-year"]}, ` +
      `district=${counts.district}, compare=${counts.compare})`,
  );
  console.log(`  manifest: ${MANIFEST_PATH}`);
  console.log(`  sample:   ${SAMPLE_PATH}`);
}

await main();
