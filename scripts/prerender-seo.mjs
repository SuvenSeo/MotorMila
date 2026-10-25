#!/usr/bin/env node
/**
 * prerender-seo.mjs — static SEO shells, run after `vite build`.
 *
 * Crawlers and link unfurlers that do not run JS used to see the identical SPA
 * shell (title "Motormila", canonical -> home) on every URL. This writes a copy
 * of dist/index.html per indexable route with its own <title>, description,
 * canonical (self), Open Graph/Twitter tags, robots and JSON-LD, plus a short
 * crawlable summary inside #root (React replaces it on mount).
 *
 *   dist/<route>.html      served for /<route> (vercel.json cleanUrls, CF Pages default)
 *   dist/404.html          noindex shell, served with a real 404 status for unknown paths
 *
 * Hub routes (makes, make/model, districts) come from the snapshot index
 * (idx/routes.json + idx/models/*), so this works without the database. When
 * the index is missing only the static routes are written.
 */
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.resolve(process.argv[2] || path.join(ROOT, "dist"));
const ORIGIN = (process.env.SITE_ORIGIN || "https://motormila.vercel.app").replace(/\/+$/, "");
const SITE = "Motormila";
const MAX_MODEL_PAGES = Number(process.env.PRERENDER_MAX_MODELS || 1500);
const DEFAULT_DESC =
  "Track Sri Lankan vehicle prices, trends, deal signals, and valuation tools in one market intelligence cockpit.";

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const jsonLdSafe = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");
const lkr = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? `Rs. ${(Number(n) / 1_000_000).toFixed(2)}M` : null);
const slugify = (v) =>
  String(v ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const compactKey = (v) =>
  String(v ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/** Static routes: path -> [title, description, indexable]. Keep in sync with RouteMeta. */
const STATIC_ROUTES = {
  "/trends": [`Market Trends — ${SITE}`, "Sri Lankan vehicle price trends over time, by make, model, and district.", true],
  "/estimate": [`Valuation — ${SITE}`, "Estimate a fair market price for any Sri Lankan vehicle from live listing data.", true],
  "/calculator": [`Import & Cost Calculator — ${SITE}`, "Break down import duty, taxes, and total cost of ownership for vehicles in Sri Lanka.", true],
  "/ev-hub": [`EV Hub — ${SITE}`, "Electric vehicle pricing, range, battery health, and charging intelligence for Sri Lanka.", true],
  "/ev-chargers": [`EV Chargers — ${SITE}`, "Map of electric vehicle charging stations across Sri Lanka.", true],
  "/best-picks": [`Best Picks — ${SITE}`, "The best-value vehicles on the Sri Lankan market right now, ranked by fair-value signals.", true],
  "/sell": [`Sell Your Vehicle — ${SITE}`, "List your vehicle and see what similar cars are selling for in Sri Lanka before you set a price.", true],
  "/official-pulse": [`Official Pulse — ${SITE}`, "Government, customs and import-parity signals for the Sri Lankan vehicle market.", true],
  "/docs": [`Docs — ${SITE}`, "How Motormila works: data sources, valuation method and API notes.", true],
  "/pricing": [`Pricing — ${SITE}`, "Free, Pro, Dealer, and Custom access for Sri Lanka vehicle market intelligence.", true],
  // INTERIM (merge review 2026-10-19): privacy/terms stay noindex until the
  // company is registered and a lawyer reviews the wording. Flip back to true after.
  "/privacy": [`Privacy Policy — ${SITE}`, "How Motormila collects, uses and protects personal data.", false],
  "/terms": [`Terms of Service — ${SITE}`, "The terms that govern use of Motormila.", false],
  "/how-we-price": [`How We Price — ${SITE}`, "How MotorMila estimates fair market value from Sri Lankan asking prices: comparable listings, confidence, and the limits of the data.", true],
  "/compare": [`Compare Vehicles — ${SITE}`, "Side-by-side Sri Lankan vehicle comparison: price, mileage, district and fair-value verdict.", true],
  "/permits": [`Vehicle Permits — ${SITE}`, "Sri Lankan vehicle import permit types and current market prices.", true],
  "/mobile-app": [`Android App — ${SITE}`, "Download the MotorMila Android app: Sri Lankan vehicle prices, deal alerts and valuations on your phone.", true],
  "/bot": [`MotorMilaBot — ${SITE}`, "About the MotorMilaBot web crawler: what it collects, how politely it crawls, and how to contact us or opt out.", true],
  "/afford": [`What Can I Afford — ${SITE}`, "Find Sri Lankan vehicles that fit your down payment and monthly budget, with local lease rates and CBSL loan limits.", true],
  "/safe-transfer": [`Safe Vehicle Transfer Kit — ${SITE}`, "Transfer vehicle ownership safely in Sri Lanka: checklist, sale agreement, transfer costs and the 14-day rule.", true],
  "/finance": [`Vehicle Finance — ${SITE}`, "Request lease and finance quotes for your vehicle purchase in Sri Lanka.", true],
  "/inspection": [`Vehicle Inspection — ${SITE}`, "Book a pre-purchase vehicle inspection in Sri Lanka.", true],
  "/insurance": [`Vehicle Insurance — ${SITE}`, "Request motor insurance quotes in Sri Lanka.", true],
  "/cookies": [`Cookie Notice — ${SITE}`, "How MotorMila uses cookies and browser storage.", false],
  "/removal": [`Request Data Removal — ${SITE}`, "Ask MotorMila to remove your listing data or photos.", false],
  "/delete-account": [`Delete Your Account — ${SITE}`, "Delete your MotorMila account and associated data.", false],
  // Utility routes: real shells so the raw HTML already says noindex.
  "/sign-in": [`Sign In — ${SITE}`, DEFAULT_DESC, false],
  "/sign-up": [`Create Account — ${SITE}`, DEFAULT_DESC, false],
  "/profile": [`Profile — ${SITE}`, DEFAULT_DESC, false],
  "/alerts": [`Alerts — ${SITE}`, DEFAULT_DESC, false],
  "/settings": [`Settings — ${SITE}`, DEFAULT_DESC, false],
  "/dealer": [`Dealer Dashboard — ${SITE}`, DEFAULT_DESC, false],
  "/pro": [`Pro Dashboard — ${SITE}`, DEFAULT_DESC, false],
  "/pro-preview": [`Pro Preview — ${SITE}`, DEFAULT_DESC, false],
  "/hero-lab": [`Hero Lab — ${SITE}`, DEFAULT_DESC, false],
  "/motormila/admin": [`Admin — ${SITE}`, DEFAULT_DESC, false],
  "/checkout/return": [`Checkout — ${SITE}`, DEFAULT_DESC, false],
};

function crumbs(list) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: list.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${ORIGIN}${c.path}` })),
  };
}

export function renderShell(template, { path: routePath, title, description, indexable = true, jsonLd = null, body = "" }) {
  const url = `${ORIGIN}${routePath === "/" ? "/" : routePath}`;
  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta\s+name="description"[\s\S]*?\/>/, `<meta name="description" content="${esc(description)}" />`);
  html = html.replace(/<meta name="robots" content="[^"]*" \/>/, `<meta name="robots" content="${indexable ? "index, follow" : "noindex, nofollow"}" />`);
  html = html.replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(title)}" />`);
  html = html.replace(/<meta\s+property="og:description"[\s\S]*?\/>/, `<meta property="og:description" content="${esc(description)}" />`);
  html = html.replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${esc(title)}" />`);
  html = html.replace(/<meta\s+name="twitter:description"[\s\S]*?\/>/, `<meta name="twitter:description" content="${esc(description)}" />`);
  const extra = [
    indexable ? `<link rel="canonical" href="${esc(url)}" />` : "",
    `<meta property="og:url" content="${esc(url)}" />`,
    jsonLd ? `<script type="application/ld+json" id="motormila-jsonld">${jsonLdSafe(jsonLd)}</script>` : "",
  ]
    .filter(Boolean)
    .join("\n    ");
  html = html.replace("<!-- seo:route -->", extra);
  if (body) {
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root"><main data-prerender style="max-width:960px;margin:0 auto;padding:96px 20px 40px;font-family:system-ui,sans-serif;line-height:1.5">${body}</main></div>`,
    );
  }
  return html;
}

async function writeRoute(routePath, html) {
  const rel = routePath.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!rel) return;
  const file = path.join(DIST, `${rel}.html`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html);
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function findIdxDir() {
  for (const dir of [path.join(DIST, "snapshots", "latest", "idx"), path.join(ROOT, "public", "snapshots", "latest", "idx")]) {
    if (existsSync(path.join(dir, "routes.json"))) return dir;
  }
  return null;
}

export async function prerender() {
  const templatePath = path.join(DIST, "index.html");
  if (!existsSync(templatePath)) {
    console.warn(`[prerender] ${templatePath} missing; run vite build first`);
    return;
  }
  const template = await fs.readFile(templatePath, "utf8");
  let count = 0;

  for (const [routePath, [title, description, indexable]] of Object.entries(STATIC_ROUTES)) {
    const jsonLd = indexable
      ? { "@context": "https://schema.org", "@graph": [{ "@type": "WebPage", name: title, url: `${ORIGIN}${routePath}`, description }, crumbs([{ name: "Home", path: "/" }, { name: title.split(" — ")[0], path: routePath }])] }
      : null;
    await writeRoute(routePath, renderShell(template, { path: routePath, title, description, indexable, jsonLd }));
    count += 1;
  }

  // Optional role mailbox for security.txt (never a personal address).
  const securityEmail = String(process.env.SECURITY_CONTACT_EMAIL || "").trim();
  const securityTxt = path.join(DIST, ".well-known", "security.txt");
  if (securityEmail && existsSync(securityTxt)) {
    const current = await fs.readFile(securityTxt, "utf8");
    if (!current.includes(`mailto:${securityEmail}`)) {
      await fs.writeFile(securityTxt, current.replace(/^Contact:/m, `Contact: mailto:${securityEmail}\nContact:`));
    }
  }

  // Real 404 shell (vercel.json routes unknown paths here with status 404).
  await fs.writeFile(
    path.join(DIST, "404.html"),
    renderShell(template, { path: "/404", title: `Page not found — ${SITE}`, description: DEFAULT_DESC, indexable: false }),
  );

  const idx = findIdxDir();
  if (!idx) {
    console.warn("[prerender] no snapshot idx/routes.json; hub pages not prerendered");
    console.log(`[prerender] wrote ${count} static route shells + 404.html`);
    return;
  }
  const routes = (await readJson(path.join(idx, "routes.json"))) || { makes: [], models: [], districts: [] };
  const modelsByMake = new Map();
  for (const m of routes.models || []) {
    const list = modelsByMake.get(m.make) || [];
    list.push(m);
    modelsByMake.set(m.make, list);
  }

  for (const r of routes.makes || []) {
    const title = `${r.make} Price Sri Lanka — Models, Listings & Trends | ${SITE}`;
    const description = `${r.count.toLocaleString("en-US")} ${r.make} listings in Sri Lanka (LKR): every tracked model with live listings, trends and fair-value signals on ${SITE}.`;
    const models = (modelsByMake.get(r.make) || []).slice(0, 40);
    const body =
      `<h1>${esc(r.make)} prices in Sri Lanka</h1><p>${esc(description)}</p>` +
      (models.length
        ? `<ul>${models.map((m) => `<li><a href="${esc(m.path)}">${esc(`${m.make} ${m.model}`)}</a> (${m.count} listings${lkr(m.median_price_lkr) ? `, median ${lkr(m.median_price_lkr)}` : ""})</li>`).join("")}</ul>`
        : "");
    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "CollectionPage", name: title, url: `${ORIGIN}${r.path}`, description, about: { "@type": "Brand", name: r.make } },
        crumbs([{ name: "Home", path: "/" }, { name: r.make, path: r.path }]),
      ],
    };
    await writeRoute(r.path, renderShell(template, { path: r.path, title, description, jsonLd, body }));
    count += 1;
  }

  for (const r of (routes.models || []).slice(0, MAX_MODEL_PAGES)) {
    const vehicle = `${r.make} ${r.model}`;
    const detail = await readJson(path.join(idx, "models", compactKey(r.make), `${compactKey(r.model)}.json`));
    const median = lkr(detail?.median_price_lkr ?? r.median_price_lkr);
    const title = `${vehicle} Price Sri Lanka — Live Listings, Trends & Fair Value | ${SITE}`;
    const description = `${r.count.toLocaleString("en-US")} ${vehicle} listings in Sri Lanka${median ? `, median ${median}` : ""}. Live prices (LKR), district breakdown, price trends and fair-value signals on ${SITE}.`;
    const offers = {
      "@type": "AggregateOffer",
      priceCurrency: "LKR",
      offerCount: r.count,
      availability: "https://schema.org/InStock",
    };
    if (detail?.min_price_lkr) offers.lowPrice = Math.round(detail.min_price_lkr);
    if (detail?.max_price_lkr) offers.highPrice = Math.round(detail.max_price_lkr);
    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Vehicle", name: `${vehicle} — Sri Lanka market`, url: `${ORIGIN}${r.path}`, brand: { "@type": "Brand", name: r.make }, model: r.model, offers },
        crumbs([
          { name: "Home", path: "/" },
          { name: r.make, path: `/cars/${slugify(r.make)}` },
          { name: vehicle, path: r.path },
        ]),
      ],
    };
    const items = Array.isArray(detail?.items) ? detail.items.slice(0, 12) : [];
    const body =
      `<h1>${esc(vehicle)} prices in Sri Lanka</h1><p>${esc(description)}</p>` +
      (items.length
        ? `<h2>Latest ${esc(vehicle)} listings</h2><ul>${items
            .map((it) => `<li><a href="/listing/${Number(it.id)}">${esc([it.year, vehicle].filter(Boolean).join(" "))}</a>${lkr(it.price_lkr) ? ` — ${lkr(it.price_lkr)}` : ""}${it.district ? `, ${esc(it.district)}` : ""}</li>`)
            .join("")}</ul>`
        : "") +
      `<p><a href="/cars/${esc(slugify(r.make))}">All ${esc(r.make)} models</a></p>`;
    await writeRoute(r.path, renderShell(template, { path: r.path, title, description, jsonLd, body }));
    count += 1;
  }

  for (const r of routes.districts || []) {
    const title = `${r.district} Vehicle Prices — District Market Hub | ${SITE}`;
    const description = `${r.count.toLocaleString("en-US")} live vehicle listings in ${r.district} district (LKR): listings, model mix, price heatmap and market velocity on ${SITE}.`;
    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "CollectionPage", name: title, url: `${ORIGIN}${r.path}`, description, about: { "@type": "Place", name: `${r.district}, Sri Lanka` } },
        crumbs([{ name: "Home", path: "/" }, { name: r.district, path: r.path }]),
      ],
    };
    const body = `<h1>Used vehicles in ${esc(r.district)}, Sri Lanka</h1><p>${esc(description)}</p>`;
    await writeRoute(r.path, renderShell(template, { path: r.path, title, description, jsonLd, body }));
    count += 1;
  }

  // dist/index.html is left as-is: it is also the SPA fallback for /listing/*
  // etc., so it must not carry a canonical (RouteMeta sets one client-side).
  console.log(`[prerender] wrote ${count} route shells + 404.html`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  prerender().catch((err) => {
    console.warn(`[prerender] failed (site still works as SPA): ${err?.stack || err}`);
  });
}
