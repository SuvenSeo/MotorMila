#!/usr/bin/env node
/**
 * build-snapshot-indexes.mjs
 *
 * Turns the monolithic listing catalogue (listing-catalog.json + parts) into
 * small, per-entity JSON files so a normal page view never downloads the whole
 * catalogue (~38 MB brotli / ~378 MB raw as of 2026-10).
 *
 * Output (under <snapshotDir>/idx/):
 *   manifest.json                     layout version, counts, shard size
 *   listings/<bucket>.json            listings whose floor(id / SHARD_SIZE) == bucket
 *   models/<makeKey>/<modelKey>.json  newest rows (capped) + compact comps for every row
 *   makes/<makeKey>.json              newest rows (capped) + totals
 *   districts/<districtKey>.json      newest rows (capped) + price stats + top makes
 *   latest.json                       newest rows across the market (unfiltered browse)
 *   search.json                       make/model suggestion index
 *   ev.json                           every electric listing (EV hub)
 *   aggregates.json                   precomputed counts (fuel mix, districts, sources, makes, deals)
 *   routes.json                       SEO route list (make, make/model, district) with counts
 *
 * Keys are compact keys: canonicalized display name, lower-cased, alnum only
 * ("Land Rover" -> "landrover", "C-HR" -> "chr"). The frontend computes the same
 * key with the same canonicalizers (src/lib/makeNormalization.ts is imported
 * directly so the two can never drift).
 *
 * It also writes ISO-8601 sitemaps into <publicDir> (sitemap-hubs.xml,
 * sitemap-listings-N.xml, sitemap-index.xml) so SEO does not depend on the DB.
 *
 * Usage: node scripts/build-snapshot-indexes.mjs [snapshotDir] [--public-dir=public] [--no-sitemaps]
 * Never throws for a missing catalogue: logs and exits 0 so builds keep going
 * (the frontend falls back to the legacy catalogue path when idx/ is absent).
 */
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load the frontend's own canonicalizers so index keys match what the SPA
 * computes. Node >= 22.18 strips TS types natively; older Node tries esbuild
 * (present wherever `npm ci` ran), and as a last resort a naive fallback
 * (aliases are then not merged, which only affects typo'd source rows).
 */
async function loadTsModule(rel) {
  const file = new URL(rel, import.meta.url);
  try {
    return await import(file.href);
  } catch {
    try {
      const { transform } = await import("esbuild");
      const source = await fs.readFile(fileURLToPath(file), "utf8");
      const { code } = await transform(source, { loader: "ts", format: "esm" });
      return await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    } catch {
      return null;
    }
  }
}
const titleCase = (v) => String(v ?? "").trim().replace(/\s+/g, " ").replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
const makeMod = (await loadTsModule("../src/lib/makeNormalization.ts")) || {
  canonicalizeMake: (v) => (String(v ?? "").trim() ? titleCase(v) : null),
  canonicalizeModel: (v) => titleCase(v),
  isJunkMake: () => false,
};
const districtMod = (await loadTsModule("../src/data/districts.ts")) || {
  normalizeDistrictName: (v) => (String(v ?? "").trim() ? titleCase(String(v).replace(/[-_]+/g, " ")) : null),
  SL_DISTRICT_COORDS: {},
};
const { canonicalizeMake, canonicalizeModel, isJunkMake } = makeMod;
const { normalizeDistrictName, SL_DISTRICT_COORDS } = districtMod;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flag = (name) => args.find((a) => a.startsWith(`--${name}`));
const SNAPSHOT_DIR = path.resolve(positional[0] || path.join(ROOT, "public", "snapshots", "latest"));
const PUBLIC_DIR = path.resolve((flag("public-dir=") || "").split("=")[1] || path.join(ROOT, "public"));
const WRITE_SITEMAPS = !flag("no-sitemaps");
const SITE_ORIGIN = (process.env.SITE_ORIGIN || "https://motormila.vercel.app").replace(/\/+$/, "");

export const INDEX_VERSION = 1;
export const SHARD_SIZE = 250;
const MODEL_ITEM_CAP = 600;
const MAKE_ITEM_CAP = 300;
const DISTRICT_ITEM_CAP = 300;
const LATEST_CAP = 600;
const SEARCH_CAP = 4000;
const SITEMAP_URLS_PER_FILE = 45000;
const MIN_PRICE = 100_000;

export function compactKey(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "Mon 2026-10-19 1:47 PM (UTC+05:30)" (export's human format) or ISO -> ISO UTC. */
export function toIso(value) {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  const human = raw.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?\s*(?:\(UTC([+-])(\d{2}):(\d{2})\))?/i);
  if (human && !/\d{4}-\d{2}-\d{2}T/.test(raw)) {
    let hour = Number(human[4]) % 12;
    if (human[6] && human[6].toUpperCase() === "PM") hour += 12;
    if (!human[6]) hour = Number(human[4]);
    const sign = human[7] === "-" ? -1 : 1;
    const offMin = human[7] ? sign * (Number(human[8]) * 60 + Number(human[9])) : 0;
    const ms = Date.UTC(Number(human[1]), Number(human[2]) - 1, Number(human[3]), hour, Number(human[5])) - offMin * 60_000;
    return new Date(ms).toISOString();
  }
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return null;
}

const TIME_FIELDS = ["first_seen_at", "last_seen_at", "scraped_at", "content_updated_at", "posted_at"];

/** Drop nulls/duplicates so a shard row is ~40% of the raw catalogue row. */
export function slimRow(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (key === "is_outlier" && value === false) continue;
    out[key] = value;
  }
  if (out.detail_url && out.detail_url === out.url) delete out.detail_url;
  if (out.external_url && out.external_url === out.url) delete out.external_url;
  if (out.engine_capacity !== undefined && (out.engine_cc === undefined || out.engine_cc === out.engine_capacity)) {
    out.engine_cc = out.engine_capacity;
    delete out.engine_capacity;
  }
  if (out.mileage !== undefined && (out.mileage_km === undefined || out.mileage_km === out.mileage)) {
    out.mileage_km = out.mileage;
    delete out.mileage;
  }
  for (const field of TIME_FIELDS) {
    if (out[field] !== undefined) {
      const iso = toIso(out[field]);
      if (iso) out[field] = iso;
    }
  }
  return out;
}

function priceOf(row) {
  const n = Number(row.price_lkr);
  return Number.isFinite(n) && n >= MIN_PRICE ? n : null;
}

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function fuelBucket(raw) {
  const key = String(raw || "").trim().toLowerCase().replace(/[ -]/g, "_");
  if (key === "petrol" || key === "gasoline") return "petrol";
  if (key === "diesel") return "diesel";
  if (["hybrid", "plugin_hybrid", "phev"].includes(key)) return "hybrid";
  if (["electric", "ev"].includes(key)) return "electric";
  return "other";
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJson(file, payload) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(payload));
}

async function* iterateCatalog(dir) {
  // Freshest rows first: the live-market overlay lists ads newer than the
  // weekly catalogue; first occurrence of an id wins.
  const live = path.join(dir, "live-market.json");
  if (existsSync(live)) {
    try {
      const snap = await readJson(live);
      for (const row of Array.isArray(snap.latest_listings) ? snap.latest_listings : []) yield row;
    } catch {
      /* ignore */
    }
  }
  const catalogFile = path.join(dir, "listing-catalog.json");
  const catalog = await readJson(catalogFile);
  if (Array.isArray(catalog.parts) && catalog.parts.length) {
    for (const part of catalog.parts) {
      const file = path.join(dir, String(part).replace(/^\/+/, ""));
      if (!existsSync(file)) throw new Error(`missing catalogue part ${part}`);
      const chunk = await readJson(file);
      for (const row of Array.isArray(chunk.items) ? chunk.items : []) yield row;
    }
  } else if (Array.isArray(catalog.items)) {
    for (const row of catalog.items) yield row;
  }
}

function sortNewest(rows) {
  return rows.sort((a, b) => String(b.first_seen_at || "").localeCompare(String(a.first_seen_at || "")) || Number(b.id) - Number(a.id));
}

function xmlEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function urlset(entries) {
  const body = entries
    .map((e) => `<url><loc>${xmlEscape(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export async function buildIndexes(dir = SNAPSHOT_DIR, { publicDir = PUBLIC_DIR, sitemaps = WRITE_SITEMAPS } = {}) {
  if (!existsSync(path.join(dir, "listing-catalog.json"))) {
    console.warn(`[idx] no listing-catalog.json in ${dir}; skipping index build`);
    return null;
  }
  const started = Date.now();
  const outDir = path.join(dir, "idx");
  const tmpDir = path.join(dir, `idx.tmp-${process.pid}`);
  await fs.rm(tmpDir, { recursive: true, force: true });

  const seen = new Set();
  const shards = new Map(); // bucket -> string[]
  const models = new Map(); // mk|mo -> {make, model, total, items[], comps[], prices[]}
  const makes = new Map();
  const districts = new Map();
  const latest = [];
  const fuel = { petrol: 0, hybrid: 0, electric: 0, diesel: 0, other: 0 };
  const sources = new Map();
  let goodDeals = 0;
  const evRows = [];
  const hotDeals = []; // [score, json]
  let total = 0;
  let newestIso = "";
  const now = Date.now();
  const weekAgo = now - 7 * 864e5;
  const dayAgo = now - 864e5;
  let new24h = 0;
  const listingSitemap = [];

  for await (const raw of iterateCatalog(dir)) {
    const id = Number(raw?.id);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    const row = slimRow(raw);
    total += 1;
    const json = JSON.stringify(row);
    const bucket = Math.floor(id / SHARD_SIZE);
    let shard = shards.get(bucket);
    if (!shard) shards.set(bucket, (shard = []));
    shard.push(json);

    const first = row.first_seen_at || row.scraped_at || "";
    if (first > newestIso) newestIso = first;
    const firstMs = Date.parse(first);
    if (firstMs >= dayAgo) new24h += 1;
    listingSitemap.push({ id, lastmod: (row.last_seen_at || first || "").slice(0, 10) || null });

    const price = priceOf(row);
    const dealScore = Number(row.deal_score || 0);
    if (dealScore >= 8) {
      goodDeals += 1;
      if (price !== null) {
        hotDeals.push([dealScore, json]);
        if (hotDeals.length > 200) {
          hotDeals.sort((a, b) => b[0] - a[0]);
          hotDeals.length = 50;
        }
      }
    }
    const fuelKind = fuelBucket(row.fuel_type);
    fuel[fuelKind] += 1;
    if (fuelKind === "electric") evRows.push(json);
    const src = String(row.source || "").trim().toLowerCase();
    if (src) sources.set(src, (sources.get(src) || 0) + 1);
    if (latest.length < LATEST_CAP * 3) latest.push(json);

    const make = canonicalizeMake(row.make);
    const model = canonicalizeModel(row.model);
    const makeKey = make && !isJunkMake(make) ? compactKey(make) : "";
    if (makeKey) {
      let m = makes.get(makeKey);
      if (!m) makes.set(makeKey, (m = { make, total: 0, items: [], models: new Map() }));
      m.total += 1;
      if (m.items.length < MAKE_ITEM_CAP * 2) m.items.push(json);
      const modelKey = compactKey(model);
      if (modelKey) {
        const key = `${makeKey}/${modelKey}`;
        let mo = models.get(key);
        if (!mo) {
          models.set(key, (mo = { make, model, makeKey, modelKey, total: 0, items: [], comps: [], prices: [], lastmod: "" }));
          m.models.set(modelKey, mo);
        }
        mo.total += 1;
        const y = Number(row.year) || 0;
        if (y > (mo.maxYear || 0) && y <= new Date().getUTCFullYear() + 1) mo.maxYear = y;
        if (mo.items.length < MODEL_ITEM_CAP * 2) mo.items.push(json);
        if (first > mo.lastmod) mo.lastmod = first;
        if (price !== null) {
          mo.prices.push(price);
          mo.priceSum = (mo.priceSum || 0) + price;
        }
        mo.comps.push([
          id,
          price,
          Number(row.year) || null,
          Number.isFinite(Number(row.mileage_km)) ? Number(row.mileage_km) : null,
          row.district || null,
          row.condition || null,
          first ? first.slice(0, 10) : null,
          row.fuel_type || null,
        ]);
      }
    }

    const district = normalizeDistrictName(row.district || "");
    if (district) {
      const dk = compactKey(district);
      let d = districts.get(dk);
      if (!d) districts.set(dk, (d = { district, total: 0, new7d: 0, items: [], prices: [], makes: new Map(), models: new Map() }));
      d.total += 1;
      if (firstMs >= weekAgo) d.new7d += 1;
      if (price !== null) d.prices.push(price);
      if (d.items.length < DISTRICT_ITEM_CAP * 2) d.items.push(json);
      if (make) d.makes.set(make, (d.makes.get(make) || 0) + 1);
      if (make && model && price !== null) {
        const mk = `${make}\u0000${model}`;
        const e = d.models.get(mk) || { make, model, listing_count: 0, total: 0 };
        e.listing_count += 1;
        e.total += price;
        d.models.set(mk, e);
      }
    }
  }

  if (total === 0) {
    console.warn("[idx] catalogue is empty; leaving any previous idx/ in place");
    return null;
  }

  // List indexes keep at most 3 photos per row (cards show a short carousel);
  // the per-listing shard keeps the full gallery for the detail page.
  const parseRows = (arr, cap) =>
    sortNewest(arr.map((s) => JSON.parse(s)))
      .slice(0, cap)
      .map((row) => (Array.isArray(row.images) && row.images.length > 3 ? { ...row, images: row.images.slice(0, 3) } : row));

  let files = 0;
  for (const [bucket, rows] of shards) {
    await fs.mkdir(path.join(tmpDir, "listings"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "listings", `${bucket}.json`), `{"items":[${rows.join(",")}]}`);
    files += 1;
  }

  const routes = { makes: [], models: [], districts: [] };
  const searchRows = [];
  for (const mo of models.values()) {
    const prices = mo.prices;
    await writeJson(path.join(tmpDir, "models", mo.makeKey, `${mo.modelKey}.json`), {
      make: mo.make,
      model: mo.model,
      total: mo.total,
      priced_count: prices.length,
      avg_price_lkr: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
      median_price_lkr: prices.length ? Math.round(median(prices)) : null,
      min_price_lkr: prices.length ? Math.min(...prices) : null,
      max_price_lkr: prices.length ? Math.max(...prices) : null,
      // [id, price_lkr, year, mileage_km, district, condition, first_seen_date, fuel_type] for every row
      comp_fields: ["id", "price_lkr", "year", "mileage_km", "district", "condition", "first_seen_at", "fuel_type"],
      comps: mo.comps,
      items: parseRows(mo.items, MODEL_ITEM_CAP),
    });
    files += 1;
    if (mo.total >= 3) {
      routes.models.push({ path: `/cars/${slugify(mo.make)}/${slugify(mo.model)}`, make: mo.make, model: mo.model, count: mo.total, median_price_lkr: prices.length ? Math.round(median(prices)) : null, lastmod: mo.lastmod.slice(0, 10) || null });
    }
    searchRows.push([mo.make, mo.model, mo.total, mo.maxYear || null, prices.length ? Math.round(median(prices)) : null]);
  }
  for (const [makeKey, m] of makes) {
    await writeJson(path.join(tmpDir, "makes", `${makeKey}.json`), {
      make: m.make,
      total: m.total,
      models: [...m.models.values()].sort((a, b) => b.total - a.total).map((mo) => ({ model: mo.model, count: mo.total })),
      items: parseRows(m.items, MAKE_ITEM_CAP),
    });
    files += 1;
    if (m.total >= 3) routes.makes.push({ path: `/cars/${slugify(m.make)}`, make: m.make, count: m.total });
  }
  const districtRows = [];
  for (const [dk, d] of districts) {
    const topMakes = [...d.makes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([make, count]) => ({ make, count }));
    const payload = {
      district: d.district,
      listing_count: d.total,
      new_7d_count: d.new7d,
      priced_count: d.prices.length,
      avg_price_lkr: d.prices.length ? Math.round(d.prices.reduce((a, b) => a + b, 0) / d.prices.length) : null,
      median_price_lkr: d.prices.length ? Math.round(median(d.prices)) : null,
      min_price_lkr: d.prices.length ? Math.min(...d.prices) : null,
      max_price_lkr: d.prices.length ? Math.max(...d.prices) : null,
      top_makes: topMakes,
      top_models: [...d.models.values()]
        .sort((a, b) => b.listing_count - a.listing_count)
        .slice(0, 5)
        .map((e) => ({ make: e.make, model: e.model, listing_count: e.listing_count, avg_price_lkr: Math.round(e.total / e.listing_count) })),
      items: parseRows(d.items, DISTRICT_ITEM_CAP),
    };
    await writeJson(path.join(tmpDir, "districts", `${dk}.json`), payload);
    files += 1;
    districtRows.push({ district: d.district, listing_count: d.total, new_7d_count: d.new7d, median_price_lkr: payload.median_price_lkr });
    if (Object.prototype.hasOwnProperty.call(SL_DISTRICT_COORDS, d.district)) routes.districts.push({ path: `/locations/${slugify(d.district)}`, district: d.district, count: d.total });
  }

  searchRows.sort((a, b) => b[2] - a[2]);
  await writeJson(path.join(tmpDir, "search.json"), { fields: ["make", "model", "count", "max_year", "median_price_lkr"], rows: searchRows.slice(0, SEARCH_CAP) });
  await writeJson(path.join(tmpDir, "latest.json"), { items: parseRows(latest, LATEST_CAP), total });
  await writeJson(path.join(tmpDir, "ev.json"), { listing_count: total, items: evRows.map((j) => JSON.parse(j)) });
  hotDeals.sort((a, b) => b[0] - a[0]);
  await writeJson(path.join(tmpDir, "aggregates.json"), {
    listing_count: total,
    hot_deals: hotDeals.slice(0, 12).map(([, j]) => JSON.parse(j)),
    top_models: [...models.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
      .map((mo) => ({ make: mo.make, model: mo.model, listing_count: mo.total, price_sum: mo.priceSum || 0 })),
    good_deals_count: goodDeals,
    new_listings_24h: new24h,
    fuel_mix: fuel,
    sources: [...sources.entries()].sort((a, b) => b[1] - a[1]).map(([source, count]) => ({ source, count })),
    makes: [...makes.values()].sort((a, b) => b.total - a.total).map((m) => ({ make: m.make, count: m.total })),
    districts: districtRows.sort((a, b) => b.listing_count - a.listing_count),
    generated_at: new Date().toISOString(),
  });
  routes.models.sort((a, b) => b.count - a.count);
  routes.makes.sort((a, b) => b.count - a.count);
  routes.districts.sort((a, b) => b.count - a.count);
  await writeJson(path.join(tmpDir, "routes.json"), routes);
  const manifest = {
    version: INDEX_VERSION,
    shard_size: SHARD_SIZE,
    listing_count: total,
    newest_first_seen_at: newestIso || null,
    caps: { model_items: MODEL_ITEM_CAP, make_items: MAKE_ITEM_CAP, district_items: DISTRICT_ITEM_CAP, latest: LATEST_CAP },
    counts: { shards: shards.size, models: models.size, makes: makes.size, districts: districts.size, files: files + 7 },
    generated_at: new Date().toISOString(),
  };
  await writeJson(path.join(tmpDir, "manifest.json"), manifest);

  // Atomic-ish swap so a half-written idx/ is never served.
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.rename(tmpDir, outDir);

  if (sitemaps) {
    const today = new Date().toISOString().slice(0, 10);
    const hubs = [
      ...routes.makes.map((r) => ({ loc: `${SITE_ORIGIN}${r.path}`, lastmod: today })),
      ...routes.models.map((r) => ({ loc: `${SITE_ORIGIN}${r.path}`, lastmod: r.lastmod || today })),
      ...routes.districts.map((r) => ({ loc: `${SITE_ORIGIN}${r.path}`, lastmod: today })),
    ];
    await fs.mkdir(publicDir, { recursive: true });
    await fs.writeFile(path.join(publicDir, "sitemap-hubs.xml"), urlset(hubs));
    const listingFiles = [];
    for (let i = 0; i * SITEMAP_URLS_PER_FILE < listingSitemap.length; i += 1) {
      const name = `sitemap-listings-${i}.xml`;
      const slice = listingSitemap.slice(i * SITEMAP_URLS_PER_FILE, (i + 1) * SITEMAP_URLS_PER_FILE);
      await fs.writeFile(path.join(publicDir, name), urlset(slice.map((r) => ({ loc: `${SITE_ORIGIN}/listing/${r.id}`, lastmod: /^\d{4}-\d{2}-\d{2}$/.test(r.lastmod || "") ? r.lastmod : null }))));
      listingFiles.push(name);
    }
    const index = ["sitemap.xml", "sitemap-hubs.xml", ...listingFiles]
      .map((name) => `<sitemap><loc>${SITE_ORIGIN}/${name}</loc><lastmod>${today}</lastmod></sitemap>`)
      .join("\n");
    await fs.writeFile(
      path.join(publicDir, "sitemap-index.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${index}\n</sitemapindex>\n`,
    );
  }

  console.log(
    `[idx] ${total} listings -> ${shards.size} shards, ${models.size} models, ${makes.size} makes, ${districts.size} districts in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  return manifest;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  buildIndexes().catch((err) => {
    // Never fail a deploy over the index: the frontend falls back gracefully.
    console.warn(`[idx] index build failed: ${err?.stack || err}`);
  });
}

