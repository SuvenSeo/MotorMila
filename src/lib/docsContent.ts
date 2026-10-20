export type DocsSection = {
  id: string;
  title: string;
  summary: string;
  body: string[];
  bullets?: string[];
  relatedRoutes?: { label: string; to: string }[];
};

export const DOCS_SECTIONS: DocsSection[] = [
  {
    id: "overview",
    title: "What Motormila is",
    summary: "Sri Lanka vehicle market intelligence — listings, deal scores, and decision tools in one cockpit.",
    body: [
      "Motormila is a vehicle intelligence platform built for the Sri Lankan used and import market. It aggregates public listings, scores how asking prices sit against condition-aware peers, and surfaces tools dealers, brokers, importers, and serious buyers actually use before they negotiate.",
      "The public dashboard is the front door: browse live inventory, filter by make, model, district, and fuel type, then drill into deal signals, trends, and valuation. Paid workspaces add depth — history, exports, dealer inventory ops, and Official Pulse signals from DMT, Customs, and import policy.",
      "This docs set explains how the pieces fit together: where data comes from, how deal scores are computed, what Official Pulse covers, and which routes belong to Free, Pro, Dealer, and Custom access.",
    ],
    bullets: [
      "Public market browse on the main dashboard",
      "Deal scores and fair-ask context on listings",
      "Trends, price index, alerts, and calculator",
      "Pro terminal and Dealer workspace for paid teams",
    ],
    relatedRoutes: [
      { label: "Dashboard", to: "/" },
      { label: "Pricing", to: "/pricing" },
      { label: "Docs", to: "/docs" },
    ],
  },
  {
    id: "data-sources",
    title: "Data sources",
    summary: "Listings sync from major Sri Lankan marketplaces — ikman, riyasewana, and other high-volume boards.",
    body: [
      "Motormila scrapes and normalizes vehicle ads from the boards Sri Lankans already use — not cars only. Marketplace sources pull cars, bikes, three-wheelers, vans, buses, lorries/trucks, and related for-sale vehicle categories (parts/rentals/services skipped). Primary coverage includes ikman (public JSON API with a Playwright safety net) and riyasewana, with additional volume from AutoLanka, Patpat, AutoDirect, HitAd, Cartivate, and related classified or dealer sources as the pipeline expands.",
      "Each listing is deduplicated where possible, mapped to a shared make/model schema, and tagged with district, fuel type, year, mileage, and asking price. Incomplete ads still appear, but deal confidence drops when peer samples are thin or fields are missing.",
      "Source mix matters for interpretation: one board may skew newer stock; another may skew older private sellers. Pro views expose source coverage so you can see whether a lane is dominated by a single site.",
    ],
    bullets: [
      "ikman — high-volume national classifieds",
      "riyasewana — strong vehicle-specific inventory",
      "AutoLanka, Patpat, AutoDirect, HitAd, Cartivate — supplemental lanes",
      "Normalized schema across boards for comparable medians",
    ],
    relatedRoutes: [
      { label: "Dashboard", to: "/" },
      { label: "Pro preview", to: "/pro-preview" },
      { label: "Best picks", to: "/best-picks" },
    ],
  },
  {
    id: "deal-scores",
    title: "How deal scores work",
    summary: "Scores compare asking price to a market median — Good Deal, Fair, or Overpriced.",
    body: [
      "A deal score answers one question: is this asking price cheap, fair, or rich versus peers? The core formula is score = (1 − price / median) × 100. Positive scores mean under-median; negative scores mean over-median.",
      "Bands align with the deal ladder used across the app: Good Deal when score ≥ 8 (about 8% or more under median), Overpriced when score ≤ −5 (about 5% or more over median), and Fair otherwise. Medians are built from recent comparable listings — same lane where possible, with district and condition context when sample depth allows.",
      "Treat strong scores with thin samples as provisional. Always check freshness, peer count, and district mix before you treat a score as a negotiation floor. Best Picks ranks listings that clear both score and confidence thresholds.",
    ],
    bullets: [
      "Good Deal: score ≥ 8 (asking ≤ ~92% of median)",
      "Fair: between the Good Deal and Overpriced bands",
      "Overpriced: score ≤ −5 (asking ≥ ~105% of median)",
      "Confidence rises with sample size and fresh comps",
    ],
    relatedRoutes: [
      { label: "Best picks", to: "/best-picks" },
      { label: "Valuation", to: "/estimate" },
      { label: "Dashboard", to: "/" },
    ],
  },
  {
    id: "official-pulse",
    title: "Official Pulse",
    summary: "DMT, Customs, and import-policy signals that sit beside marketplace prices.",
    body: [
      "Official Pulse tracks government and regulatory signals that move landed cost and registration risk — DMT process notes, Customs duty context, and import-policy changes that dealers and importers watch weekly.",
      "Marketplace asking prices react after policy shifts; Pulse is meant to surface those shifts earlier so you are not pricing off last month’s duty assumptions. Free shows the latest 6 signals; Pro and Dealer unlock the full pulse desk, richer timelines, and exportable briefs.",
      "Pulse is not a substitute for a lawyer or clearing agent. It is a structured feed of signals linked to how Motormila models import cost and market pressure.",
    ],
    bullets: [
      "DMT and registration-side process signals",
      "Customs and duty context for import lanes",
      "Import-policy and surcharge timing cues",
      "History and depth on paid plans",
    ],
    relatedRoutes: [
      { label: "Official Pulse", to: "/official-pulse" },
      { label: "Import calculator", to: "/calculator" },
      { label: "Pricing", to: "/pricing" },
    ],
  },
  {
    id: "dealer-workspace",
    title: "Dealer workspace",
    summary: "Inventory health, price gaps, URL benchmarks, and team seats for dealer lots.",
    body: [
      "The Dealer workspace at /dealer is built for yard operators who need turnover and pricing discipline, not just browsing. It surfaces inventory that is aging, asks that sit above or below peer medians, and demand cues by lane and district.",
      "URL benchmark lets you paste a public listing link and see how that ask compares to Motormila comps — useful when a walk-in buyer quotes another yard’s ad. Team seats (Dealer plan) keep sales staff on the same read of the market.",
      "Dealer access is a paid tier. Start from /dealer after sign-in and claim your yard with a seller name and/or listing URL so Motormila can match live inventory.",
    ],
    bullets: [
      "Aging and price-gap views on your stock",
      "URL benchmark against live comps",
      "Demand and district context for popular lanes",
      "Team seats on the Dealer plan",
    ],
    relatedRoutes: [
      { label: "Dealer workspace", to: "/dealer" },
      { label: "Sign in", to: "/sign-in" },
      { label: "Pricing", to: "/pricing" },
    ],
  },
  {
    id: "pro-terminal",
    title: "Pro terminal",
    summary: "Lane drill-downs, source coverage, exports, and pulse history for power users.",
    body: [
      "The Pro terminal (/pro) is the paid market cockpit: deeper lane tables, district profiles, source-quality views, and export packs (CSV, PDF, and related briefs). /pro-preview shows a locked tour of the same surface before you sign in.",
      "Pro is aimed at brokers, serious buyers, and analysts who need history and exports beyond the public dashboard. It pairs with Official Pulse history and alert depth so you can watch a lane without refreshing the homepage all day.",
      "Sign in unlocks /pro when the subscription is active. Use /pro-preview anytime to see layout and sample depth.",
    ],
    bullets: [
      "Lane and district drill-downs",
      "Source coverage and quality signals",
      "Export packs for briefs and data",
      "Preview available without a subscription",
    ],
    relatedRoutes: [
      { label: "Pro terminal", to: "/pro" },
      { label: "Pro preview", to: "/pro-preview" },
      { label: "Sign in", to: "/sign-in" },
    ],
  },
  {
    id: "calculator",
    title: "Import duty calculator",
    summary: "Landed cost, surcharge assumptions, lease, TCO, and permit context for imports.",
    body: [
      "The calculator at /calculator models landed cost from CIF, live CBSL-linked FX, fuel type, engine capacity or motor kW, and common surcharges (including SSCL where applicable). It is built for Sri Lanka import math — not a generic overseas duty estimator.",
      "Additional tabs cover lease repayment sketches, total cost of ownership, on-road fees (revenue licence, emission test, third-party insurance, transfer), import eligibility after the Feb 2025 ban lift, permit notes, and depreciation framing. Shareable URL params let you send a scenario to a colleague without retyping inputs.",
      "Always cross-check duty rates with your clearing agent; Motormila keeps the model aligned with published rules, but official gazettes and agent quotes remain the source of truth for a live clearance.",
    ],
    bullets: [
      "CIF → LKR landed cost with fuel and CC/kW inputs",
      "Live USD/LKR FX (CBSL via macro publisher, open.er-api fallback)",
      "On-road statutory fees: revenue licence, VET, CMT, transfer",
      "Post-ban import eligibility screen",
      "Lease / TCO / permit / retention tabs",
      "Surcharge and SSCL toggles where relevant",
      "Shareable query-string scenarios",
    ],
    relatedRoutes: [
      { label: "Calculator", to: "/calculator" },
      { label: "Official Pulse", to: "/official-pulse" },
      { label: "EV Hub", to: "/ev-hub" },
      { label: "EV Chargers", to: "/ev-chargers" },
    ],
  },
  {
    id: "alerts-trends",
    title: "Alerts, trends & price index",
    summary: "Watch the market over time — alerts, trend charts, and the national price index.",
    body: [
      "Alerts (/alerts) watch for listings that match your rules — make, model, price band, and related filters — and surface current matches when the pipeline refreshes. Free includes 1 alert without WhatsApp; Pro deepens watches, match refresh, and notifications.",
      "Trends (/trends) charts price movement by lane. Free shows a 6-month national window; Pro unlocks full history plus district and condition filters. The Price Index (/price-index) compresses the used market into a mix-adjusted benchmark — Free keeps the overall 6-month window; Pro unlocks segments and longer history.",
      "District demand also lives on the home dashboard via the velocity strip and district map widget — use those when geography matters as much as the ask.",
    ],
    bullets: [
      "/alerts — 1 free watch; Pro for depth + WhatsApp",
      "/trends — 6-month Free window; Pro for full lane history",
      "/price-index — overall Free teaser; Pro for segments",
      "Home dashboard — district demand velocity",
    ],
    relatedRoutes: [
      { label: "Alerts", to: "/alerts" },
      { label: "Trends", to: "/trends" },
      { label: "Price index", to: "/price-index" },
      { label: "Dashboard", to: "/" },
    ],
  },
  {
    id: "pricing-access",
    title: "Pricing & access",
    summary: "Free browse, Pro terminal, Dealer workspace, and Custom plans for banks and leasing.",
    body: [
      "Access is tiered with soft limits on Free — every product page is open, but depth is capped. Free covers first-page browse (12 listings), latest 6 Official Pulse signals, a 6-month trends/price-index window, landed-cost calculator only, top 3 EV models, 1 market alert (no WhatsApp), and no deal scores. Pro (LKR 999/mo) unlocks the /pro terminal, full feeds, scores, pulse history, alerts depth, calculator tabs, and exports. Dealer (LKR 1,999/mo) includes everything in Pro plus the full /dealer workspace, URL benchmark, and team seats. Custom is quote-based for banks, leasing, and insurers — message us from the Pricing page.",
      "Months of scraping, normalization, and scoring are not free forever — paid tiers fund pipeline uptime and deeper signals. Annual billing discounts Pro and Dealer. See the Pricing page for feature tables and FAQ.",
    ],
    bullets: [
      "Free — open pages with soft limits (12 listings, 6 pulse, 6-mo trends, no scores)",
      "Pro — LKR 999/mo terminal, scores, history, alerts, exports",
      "Dealer — LKR 1,999/mo = Pro + yard workspace, benches, seats",
      "Custom — message us for institutional scope",
    ],
    relatedRoutes: [
      { label: "Pricing", to: "/pricing" },
      { label: "Sign in", to: "/sign-in" },
      { label: "Dealer workspace", to: "/dealer" },
    ],
  },
  {
    id: "trust-freshness",
    title: "Trust & pipeline freshness",
    summary: "How sync cadence, stale labels, and confidence interact with deal scores.",
    body: [
      "Listing sync and analytical refresh are related but not identical. The scrape pipeline pulls ads on a schedule; aggregates and deal scores update in a separate analysis pass. Freshness labels on the UI reflect operational sync recency — not a claim that every median was recomputed in the last minute.",
      "Listings older than the stale threshold (on the order of several hours without a fresh sync signal) are marked so you do not negotiate off cold inventory. Prefer scores backed by recent peers and adequate sample size.",
      "When Pulse or duty assumptions change, re-run calculator scenarios and re-check lanes that are import-sensitive. Trust is a stack: source coverage + freshness + sample depth + transparent scoring bands.",
    ],
    bullets: [
      "Operational freshness ≠ full market recalculation",
      "Stale labels protect you from cold asks",
      "Sample depth drives deal-score confidence",
      "Pipeline status is visible on the dashboard",
    ],
    relatedRoutes: [
      { label: "Dashboard", to: "/" },
      { label: "Official Pulse", to: "/official-pulse" },
      { label: "Pricing", to: "/pricing" },
    ],
  },
];
