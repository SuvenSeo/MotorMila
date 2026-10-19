// Server-rendered <head> for /listing/:id (crawlers, search engines and link
// unfurlers that do not run JS).
//
// vercel.json rewrites bot user-agents on /listing/:id here. The response is
// the real SPA shell (same body/JS as humans get) with per-listing title,
// description, canonical, Open Graph and Vehicle/Offer + BreadcrumbList JSON-LD
// injected, so it is dynamic rendering of identical content, not a separate page.
//
// Data comes from the static snapshot shard (idx/listings/<bucket>.json), so it
// works while the backend/DB is down; the live API is only a fallback.

const SITE_ORIGIN = "https://motormila.vercel.app";
const DEFAULT_BACKEND = "https://seo292-vehicle-platform-backend.hf.space/api/v1";
const FETCH_TIMEOUT_MS = 6000;
const DEFAULT_DESC =
  "Track Sri Lankan vehicle prices, trends, deal signals, and valuation tools in one market intelligence cockpit.";

function apiBase() {
  const configured = String(process.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
  if (!configured) return DEFAULT_BACKEND;
  if (configured.endsWith("/api") || configured.endsWith("/api/v1")) return configured;
  return `${configured}/api/v1`;
}

function requestOrigin(req) {
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "").split(",")[0].trim();
  const proto = String(req.headers?.["x-forwarded-proto"] || "https").split(",")[0].trim();
  return host ? `${proto}://${host}` : SITE_ORIGIN;
}

function snapshotBases(origin) {
  const configured = String(process.env.VITE_SNAPSHOT_BASE_URL || "").trim().replace(/\/+$/, "");
  const bases = [];
  if (configured && !/^(off|none|false|0)$/i.test(configured)) bases.push(new URL(configured, origin).toString().replace(/\/+$/, ""));
  bases.push(`${origin}/snapshots/latest`);
  return [...new Set(bases)];
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPriceLkr(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 100_000) return null;
  return `Rs. ${(numeric / 1_000_000).toFixed(2)}M`;
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchWithTimeout(url, accept = "application/json") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Accept: accept }, signal: controller.signal });
    return response.ok ? response : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url) {
  const res = await fetchWithTimeout(url);
  if (!res) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchListingFromSnapshot(id, origin) {
  for (const base of snapshotBases(origin)) {
    const manifest = await fetchJson(`${base}/idx/manifest.json`);
    const shardSize = Number(manifest?.shard_size);
    if (!shardSize) continue;
    const shard = await fetchJson(`${base}/idx/listings/${Math.floor(Number(id) / shardSize)}.json`);
    const row = Array.isArray(shard?.items) ? shard.items.find((it) => Number(it?.id) === Number(id)) : null;
    if (row) return row;
  }
  return null;
}

async function fetchListing(id, origin) {
  return (await fetchListingFromSnapshot(id, origin)) || (await fetchJson(`${apiBase()}/listings/${id}`));
}

export function buildListingMeta(listing, id) {
  const url = `${SITE_ORIGIN}/listing/${encodeURIComponent(id)}`;
  if (!listing || !(listing.make || listing.title)) {
    return {
      url,
      title: "Vehicle Listing — Motormila",
      description: DEFAULT_DESC,
      image: `${SITE_ORIGIN}/og-card.jpg`,
      jsonLd: null,
      found: false,
    };
  }
  const name = [listing.year, listing.make, listing.model].filter(Boolean).join(" ") || listing.title;
  const price = formatPriceLkr(listing.price_lkr);
  const mileage = Number(listing.mileage_km ?? listing.mileage);
  const parts = [price || "Price on request"];
  if (listing.district) parts.push(String(listing.district));
  if (Number.isFinite(mileage) && mileage > 0) parts.push(`${mileage.toLocaleString("en-US")} km`);
  if (listing.fuel_type) parts.push(String(listing.fuel_type));
  if (listing.source) parts.push(`via ${listing.source}`);
  const thumb = String(listing.thumbnail_url || (Array.isArray(listing.images) ? listing.images[0] : "") || "").trim();
  const image = /^https:\/\//.test(thumb) ? thumb : `${SITE_ORIGIN}/og-card.jpg`;
  const vehicle = {
    "@type": "Vehicle",
    name,
    url,
    image,
    brand: listing.make ? { "@type": "Brand", name: String(listing.make) } : undefined,
    model: listing.model || undefined,
    vehicleModelDate: listing.year ? String(listing.year) : undefined,
    fuelType: listing.fuel_type || undefined,
    vehicleTransmission: listing.transmission || undefined,
    mileageFromOdometer:
      Number.isFinite(mileage) && mileage > 0 ? { "@type": "QuantitativeValue", value: mileage, unitCode: "KMT" } : undefined,
    offers: price
      ? {
          "@type": "Offer",
          price: Math.round(Number(listing.price_lkr)),
          priceCurrency: "LKR",
          availability: listing.is_active === false ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
          url,
          areaServed: listing.district ? { "@type": "Place", name: `${listing.district}, Sri Lanka` } : undefined,
        }
      : undefined,
  };
  const crumbs = [{ name: "Home", path: "/" }];
  if (listing.make) crumbs.push({ name: String(listing.make), path: `/cars/${slugify(listing.make)}` });
  if (listing.make && listing.model) {
    crumbs.push({ name: `${listing.make} ${listing.model}`, path: `/cars/${slugify(listing.make)}/${slugify(listing.model)}` });
  }
  crumbs.push({ name, path: `/listing/${id}` });
  return {
    url,
    title: `${name}${price ? ` — ${price}` : ""} | Motormila`,
    description: `${parts.join(" · ")} — live market data on Motormila.`,
    image,
    found: true,
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        JSON.parse(JSON.stringify(vehicle)),
        {
          "@type": "BreadcrumbList",
          itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${SITE_ORIGIN}${c.path}` })),
        },
      ],
    },
  };
}

export function injectHead(shell, meta) {
  const t = escapeHtml(meta.title);
  const d = escapeHtml(meta.description);
  const img = escapeHtml(meta.image);
  const u = escapeHtml(meta.url);
  let html = shell;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`);
  html = html.replace(/<meta\s+name="description"[\s\S]*?\/>/, `<meta name="description" content="${d}" />`);
  html = html.replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${t}" />`);
  html = html.replace(/<meta\s+property="og:description"[\s\S]*?\/>/, `<meta property="og:description" content="${d}" />`);
  html = html.replace(/<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${img}" />`);
  html = html.replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${t}" />`);
  html = html.replace(/<meta\s+name="twitter:description"[\s\S]*?\/>/, `<meta name="twitter:description" content="${d}" />`);
  html = html.replace(/<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${img}" />`);
  if (!meta.found) html = html.replace(/<meta name="robots" content="[^"]*" \/>/, '<meta name="robots" content="noindex, follow" />');
  const extra = [
    `<link rel="canonical" href="${u}" />`,
    `<meta property="og:url" content="${u}" />`,
    meta.jsonLd ? `<script type="application/ld+json" id="motormila-jsonld">${JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c")}</script>` : "",
  ]
    .filter(Boolean)
    .join("\n    ");
  return html.includes("<!-- seo:route -->") ? html.replace("<!-- seo:route -->", extra) : html.replace("</head>", `${extra}\n</head>`);
}

function minimalShell(meta) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><title></title><meta name="description" content="" />
<meta name="robots" content="index, follow" /><meta property="og:title" content="" /><meta property="og:description" content="" />
<meta property="og:image" content="" /><meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="" />
<meta name="twitter:description" content="" /><meta name="twitter:image" content="" /><!-- seo:route --></head>
<body><p><a href="${escapeHtml(meta.url)}">${escapeHtml(meta.title)}</a></p></body></html>`;
}

export default async function handler(req, res) {
  const id = String(req.query?.id || "").trim();
  const origin = requestOrigin(req);
  const listing = /^\d+$/.test(id) ? await fetchListing(id, origin) : null;
  const meta = buildListingMeta(listing, id);

  // The real SPA shell (static index.html) so bots see the same document as humans.
  const shellRes = await fetchWithTimeout(`${origin}/`, "text/html");
  const shell = shellRes ? await shellRes.text() : null;
  const html = injectHead(shell && shell.includes('<div id="root">') ? shell : minimalShell(meta), meta);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  // Unknown ids get noindex (not 404) so a transient snapshot miss never deindexes a live ad.
  res.status(200).send(html);
}
