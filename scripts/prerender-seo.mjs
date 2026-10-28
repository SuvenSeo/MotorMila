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
const ORIGIN = (process.env.SITE_ORIGIN || "https://motormila.pages.dev").replace(/\/+$/, "");
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
  "/trends": [`Sri Lanka Vehicle Price Trends — By Make, Model & District | ${SITE}`, "Sri Lanka vehicle price trends over time, by make, model, and district — live asking prices in LKR, not guesses.", true],
  "/estimate": [`Vehicle Valuation Sri Lanka — What Is My Car Worth? | ${SITE}`, "Estimate a fair market price for any Sri Lankan vehicle from live listing data, before you buy or sell.", true],
  "/calculator": [`Sri Lanka Vehicle Import & Cost Calculator — Duty, Taxes & Total Cost | ${SITE}`, "Break down import duty, taxes, and total cost of ownership for vehicles in Sri Lanka.", true],
  "/ev-hub": [`EV Prices Sri Lanka — Electric Vehicle Pricing, Range & Charging | ${SITE}`, "Electric vehicle pricing, range, battery health, and charging intelligence for Sri Lanka.", true],
  "/ev-chargers": [`EV Chargers Sri Lanka — Charging Station Map | ${SITE}`, "Map of electric vehicle charging stations across Sri Lanka.", true],
  "/best-picks": [`Best Vehicle Deals Sri Lanka — Priced Below Market Value | ${SITE}`, "The best-value vehicles on the Sri Lankan market right now, ranked by fair-value signals.", true],
  "/sell": [`Sell Your Vehicle — ${SITE}`, "List your vehicle and see what similar cars are selling for in Sri Lanka before you set a price.", true],
  "/official-pulse": [`Official Pulse — ${SITE}`, "Government, customs and import-parity signals for the Sri Lankan vehicle market.", true],
  "/docs": [`Docs — ${SITE}`, "How Motormila works: data sources, valuation method and API notes.", true],
  "/pricing": [`Pricing — ${SITE}`, "Free, Pro, Dealer, and Custom access for Sri Lanka vehicle market intelligence.", true],
  // INTERIM (merge review 2026-10-19): privacy/terms stay noindex until the
  // company is registered and a lawyer reviews the wording. Flip back to true after.
  "/privacy": [`Privacy Policy — ${SITE}`, "How Motormila collects, uses and protects personal data.", false],
  "/terms": [`Terms of Service — ${SITE}`, "The terms that govern use of Motormila.", false],
  "/how-we-price": [`How We Price — Fair Vehicle Values in Sri Lanka Explained | ${SITE}`, "How MotorMila estimates fair market value from Sri Lankan asking prices: comparable listings, confidence, and the limits of the data.", true],
  "/compare": [`Compare Vehicles Sri Lanka — Side-by-Side Price & Fair-Value Verdict | ${SITE}`, "Side-by-side Sri Lankan vehicle comparison: price, mileage, district and fair-value verdict.", true],
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

const HOME_TITLE = `${SITE} — Sri Lanka Vehicle Prices, Fair Values & Deal Alerts`;
const HOME_DESC =
  "Motormila tracks Sri Lanka vehicle prices across the major marketplaces — live listings, fair-value estimates, price trends and deal alerts, so you can check a fair price before buying or selling a car, van, bike or three-wheeler.";
// Honest, affiliation-free answers: Motormila is NOT ikman, riyasewana or
// patpat, and is not affiliated with them. It tracks prices across them.
// These Q&As target the queries buyers actually type before they trust a
// marketplace price ("is this ikman price fair?"), not the marketplaces'
// own brand queries, which Motormila cannot and should not try to outrank.
const HOME_FAQS = [
  {
    q: "What is Motormila?",
    a: "Motormila is Sri Lanka vehicle price intelligence. It tracks live vehicle listings across Sri Lanka's major marketplaces, with price trends, fair-value estimates and deal alerts, so buyers and sellers can agree on a fair price faster.",
  },
  {
    q: "Is Motormila the same as ikman or riyasewana?",
    a: "No. Motormila is not ikman, riyasewana or patpat, and is not affiliated with them. Those are marketplaces where sellers post ads. Motormila tracks prices across marketplaces, so you can check whether a price you saw on any of them is fair before you buy or sell.",
  },
  {
    q: "How do I check if a price on ikman or riyasewana is fair?",
    a: "Search the make and model on Motormila, compare its median asking price and price range with similar listings, then use the valuation tool for a fair-value estimate. A price far above the median for the same year and mileage deserves a second look.",
  },
  {
    q: "What does Motormila's fair value mean?",
    a: "A fair value is an estimate from comparable live asking prices in Sri Lanka, with a confidence level based on how many similar listings exist. Asking prices are not final sale prices, so a fair value is a guide for negotiation, not a guaranteed sale price.",
  },
  {
    q: "Which vehicles and districts does Motormila cover?",
    a: "Cars, vans, bikes, three-wheelers and lorries across Sri Lanka, by make, model and district — including Toyota, Honda, Suzuki, Nissan and the most-searched models such as Prius, Aqua, Fit, Vezel and Alto.",
  },
];

function homeShell(template, routes) {
  const topModels = (routes?.models || []).slice(0, 12);
  const topMakes = (routes?.makes || []).slice(0, 12);
  const districts = (routes?.districts || []).slice(0, 12);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: SITE,
        url: `${ORIGIN}/`,
        logo: `${ORIGIN}/logo.png`,
        slogan: "The fair mila for every motor.",
        description: HOME_DESC,
        areaServed: { "@type": "Country", name: "Sri Lanka" },
        knowsAbout: ["Sri Lanka vehicle prices", "Sri Lanka used car prices", "vehicle fair value", "vehicle price trends", "vehicle deal alerts"],
      },
      {
        "@type": "WebSite",
        name: SITE,
        url: `${ORIGIN}/`,
        description: HOME_DESC,
        inLanguage: "en",
        publisher: { "@type": "Organization", name: SITE, url: `${ORIGIN}/` },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${ORIGIN}/?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: HOME_FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
      crumbs([{ name: "Home", path: "/" }]),
    ],
  };
  const body =
    `<h1>Sri Lanka vehicle prices, checked before you buy or sell</h1><p>${esc(HOME_DESC)}</p>` +
    `<h2>Not a marketplace — a price check across marketplaces</h2><p>Motormila is not ikman, riyasewana or patpat, and is not affiliated with them. It tracks live listings across Sri Lanka's major marketplaces, so the price you saw on any of them can be checked against the whole market: median price, price range, trends and a fair-value estimate.</p>` +
    `<h2>Check a fair price in three steps</h2><ol><li>Find the make and model below, or search it.</li><li>Compare its median asking price in LKR with similar listings.</li><li>Use the <a href="/estimate">valuation tool</a> before you negotiate, and <a href="/how-we-price">read how fair values are calculated</a> — including their limits.</li></ol>` +
    `<p><a href="/trends">Price trends</a> · <a href="/best-picks">Best deals</a> · <a href="/calculator">Import &amp; cost calculator</a> · <a href="/compare">Compare vehicles</a> · <a href="/docs">How Motormila works</a></p>` +
    (topModels.length
      ? `<h2>Most-searched vehicle prices in Sri Lanka</h2><ul>${topModels.map((m) => `<li><a href="${esc(m.path)}">${esc(`${m.make} ${m.model}`)} price in Sri Lanka</a>${m.count ? ` (${m.count} listings${lkr(m.median_price_lkr) ? `, median ${lkr(m.median_price_lkr)}` : ""})` : ""}</li>`).join("")}</ul>`
      : `<h2>Most-searched vehicle prices in Sri Lanka</h2><ul><li><a href="/cars/toyota/prius">Toyota Prius price in Sri Lanka</a></li><li><a href="/cars/toyota/aqua">Toyota Aqua price in Sri Lanka</a></li><li><a href="/cars/honda/fit">Honda Fit price in Sri Lanka</a></li><li><a href="/cars/honda/vezel">Honda Vezel price in Sri Lanka</a></li><li><a href="/cars/suzuki/alto">Suzuki Alto price in Sri Lanka</a></li><li><a href="/cars/suzuki/wagon-r">Suzuki Wagon R price in Sri Lanka</a></li></ul>`) +
    (topMakes.length ? `<h2>Browse by make</h2><ul>${topMakes.map((m) => `<li><a href="${esc(m.path)}">${esc(m.make)} prices in Sri Lanka</a></li>`).join("")}</ul>` : "") +
    (districts.length ? `<h2>Browse by district</h2><ul>${districts.map((d) => `<li><a href="${esc(d.path)}">Vehicles in ${esc(d.district)}, Sri Lanka</a></li>`).join("")}</ul>` : "") +
    `<h2>Questions buyers ask before trusting a marketplace price</h2>${HOME_FAQS.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}`;
  return renderShell(template, { path: "/", title: HOME_TITLE, description: HOME_DESC, jsonLd, body });
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
    // Homepage still gets its shell (fallback model links), so brand search
    // and AI crawlers always see a real homepage, not an empty SPA shell.
    await fs.writeFile(path.join(DIST, "index.html"), homeShell(template, null));
    count += 1;
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

  // Homepage shell: dist/index.html doubles as the SPA fallback for
  // /listing/* etc., so its canonical/FAQ describe the homepage, not the
  // fallback URL — RouteMeta sets the per-route canonical client-side, and
  // React replaces this body on mount. That tradeoff already existed for
  // the generic shell; this version at least gives crawlers a real homepage.
  await fs.writeFile(path.join(DIST, "index.html"), homeShell(template, routes));
  count += 1;
  console.log(`[prerender] wrote ${count} route shells + 404.html`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  prerender().catch((err) => {
    console.warn(`[prerender] failed (site still works as SPA): ${err?.stack || err}`);
  });
}
