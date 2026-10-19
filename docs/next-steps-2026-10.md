# Motormila — What We Do Next (Oct 2026)

Synthesized from three research dossiers (Oct 2026, sources + dates in each):

- [`competitive-research-2026-10.md`](competitive-research-2026-10.md) — Sri Lankan marketplace/valuation competitor landscape
- [`market-policy-research-2026-10.md`](market-policy-research-2026-10.md) — SL policy, regulatory, and data opportunities
- [`global-product-research-2026-10.md`](global-product-research-2026-10.md) — global valuation/marketplace product lessons (KBB, Edmunds, CarGurus, Motorway, Cars24, Spinny, CarDekho, etc.)

## Verdict

The generic "fair price from listings" layer is commoditizing: riyasewana now ships a
nightly IQR fair-price engine on its own inventory, and 8+ scraped-data startups sell
"AI car valuation". What nobody can replicate is **cross-site dedup + per-listing price
history + district velocity + dealer intelligence** — every competitor computes from
single-site 24h snapshots. The plan below defends that moat, adds the parity features the
market now expects, and exploits two unclaimed SL-specific lanes: gazette→price-impact
analysis and purchasable registry-backed trust badges.

## Tier 1 — ship on data we already have (pure computation)

| # | What | Why now | Key details |
|---|------|---------|-------------|
| 1 | **Deal-rating badge on every listing** (Great/Good/Fair/High/Overpriced + exact LKR/% variance) | CarGurus' core feature; buyer-facing fair-price verdict on aggregated ads is unoccupied in SL (ikman's is seller-side/hidden) | CarGurus 2026 twist: gate eligibility on data completeness (verified specs, disclosed price components) and demote incomplete listings — badge doubles as quality gate + Pro upsell. Suppress where comps < N (AutoTrader eligibility pattern). Use the CarGurus IMV enum incl. `OUTLIER` for thin-comps |
| 2 | **Price-history timeline + true days-on-market + relist detection** | The only party that can track the same car across 13 sites; buyers negotiate and *share* this | Render "Listed 8.9M → cut to 8.4M on Sep 12"; persist per-listing price snapshots (3×/day pipeline already exists); dedup identity graph gives cross-relist DOM nobody else has |
| 3 | **Fair Market Range instead of a single FMV** | KBB Price Advisor zones: ranges convert skepticism into trust; substrate for #1 | Below/within/above bands; publish condition-tier distribution shares (KBB practice) to discourage self-over-rating |
| 4 | **Alerts 2.0 with fair-price context** | AdFinder proved alerting is valued but their alerts carry no verdict | "Was 8.9M → now 8.4M (−5.6%), 14% below 30-day median"; saved-search cadence; "back on market" from dedup graph; one-tap WhatsApp contact |
| 5 | **Negotiation share card** | WhatsApp is the closing channel on every SL listing ("call or WhatsApp 077…") | Upgrade the FMV share card into a forwardable evidence card: comps table, timeline, badge |

## Tier 2 — small new effort, big differentiation

| # | What | Why now | Key details |
|---|------|---------|-------------|
| 6 | **"Vehicle history lite" verification badge** | DMT paid lookups (owner/liens/engine no.) + Customs chassis portal are purchasable per-lookup today; **zero Carfax-equivalent exists in SL** | "Registration verified" / "no liens" badges at per-lookup cost, zero government partnership. Wrap the commercial APIs (carregistrationapi.lk, RegCheck SL) or call DMT e-services directly |
| 7 | **Monthly-cost / leasing widget** | LTV caps tightened May 2026 (used buyers need ≥40% down) — affordability is the live pain; patpat built budget-search and everyone expects it | "What will this cost me monthly" with current bank/NBFI rates (11.5–14.5%); model LTV caps explicitly. One line in a "total deal cost" card (price + transfer + stamp + VET + insurance) beats the 15 standalone calculators |
| 8 | **Gazette→price-impact engine (Official Pulse, unclaimed lane)** | 15 duty calculators exist (4+ wrong today); nobody connects a Gazette change to used-price moves | "This change made your watchlist Rs 2M cheaper." Gazette-watching infrastructure *is* the product. Live moments: surcharge expiry review (31 Dec 2026), 2027 Budget permit cancellation. Also ship ONE correct gazette-watched duty calc (weekly Customs FX rate, LC-date-aware surcharge, correct EV per-kW + hybrid per-cc) — table stakes but beats a field of stale tools |
| 9 | **Sinhala-native market analysis + trilingual parity** | Everyone ships Sinhala *UI*; nobody publishes Sinhala price explainers/FMV flows; FB-group economy runs in Sinhala. adfinder + Welandapola already ship EN/SI/TA | Extend existing SI/TA i18n beyond hero/calculator; Sinhala trend explainers and FMV flow |
| 10 | **Anti-bait-price trust mechanics** | riyasewana's "Negotiable" suppression works; scam warnings consistently name bait ads | Flag >30% below comps as "too good to be true"; reverse-image (pHash) reuse detection — cross-site view is a scam-detection moat only we have |
| 11 | **WhatsApp valuation bot** | WhatsApp Business is #2 in SL Play Store comms; India playbook proven | Thin LLM wrapper over the FMV API: "plate/model + 3 photos → FMV range + 3 comps + drop subscription." Funnel feeds alerts + Pro leads |
| 12 | **Structured data for AI assistants** | 81% of SL internet users use AI tools for discovery (2026 survey) — SEO moats decay; tariff.lk already ships an MCP server and gets cited | Publish machine-readable market data (indexes, ranges, gazette impacts) and an MCP/API surface so assistants quote Motormila, not the stale calculators |
| 13 | **Condition rubric + tiers** | Edmunds 5-tier / OBV 15-factor lite | Seller/buyer self-serve tiers with published adjustment coefficients; calibrate later against persist-vs-sell outcomes |

## Tier 3 — new data or partnerships

| # | What | Notes |
|---|------|-------|
| 14 | **Dealer acquisition tool** (CarGurus IMV Scan pattern) | Plate scan → FMV + "price here to rate Great" bands + expected days-to-sell, in Pro dashboard/lanes; natural Pro upsell from arbitrage detection |
| 15 | **Dealer "next-band" nudges + sell-probability** | mobile.de pattern: exact LKR adjustment to next band per listing; highest-value dealer SaaS upsell from data we compute already |
| 16 | **Index as a public product** | Publish the Market Index monthly with methodology note (AutoTrader RPI/Manheim pattern); press magnet; feeds Official Pulse |
| 17 | **Light inspection program** | Start 50–100 point garage-partner checklist (CarChecks.lk is the natural partner — HNB tie-in exists); Trust Tags ("Inspected", "1-owner"). Market expects inspection integration (BLUE-T, NextDrive 200+ all advertise it) |
| 18 | **Finance/insurance lead attach** | EMI calculators with partner rates, pre-approval handoffs (CarDekho model). Note IRCSL rule: leasing insurance leads only via registered brokers since 1 Oct 2026 |
| 19 | **History-based pricing** | Accident/ownership/import-vs-local — needs insurer/garage/registry partnerships. Watch the DMT "Digital Vehicle Information Sheet" (trade-press sourced, unverified): if real, it's the future rails — partner or compete |

## Explicitly NOT doing

- **Instant cash offers / C2B / consignment** — CarGurus (CarOffer), Cazoo, OLX Autos all died on fulfillment risk in volatile pricing markets. The engagement ladder that survives: watchlist → alerts → digest → dealer bidding (Motorway/carwow prove dealer-bidding auction mechanics work asset-light).
- **Migrating the DB to Cloudflare D1** — per `neon-egress-budget.md` §7: FastAPI/SQLAlchemy needs Postgres; D1's daily row caps are a bad fit.
- **Standalone widget calculators as the headline** — ikman ships calculators and owns demand; every calculator above is a wedge into history-wired features (watchlist impacts, contextual alerts, dealer nudges), never the moat itself.

## Sequencing

1. **First build:** Tier 1 #1 + #2 (deal badge + price history) — the highest-impact pure-computation features and the substrate for everything else (alerts 2.0, share cards, dealer tools).
2. **Second wave:** #4 alerts 2.0 + #5 share cards (WhatsApp distribution) + #7 monthly-cost widget (live LTV pain).
3. **Opportunistic:** #8 gazette engine timed to the 31 Dec 2026 surcharge review — the single biggest live content moment in the next quarter.
4. **Monetization:** free consumer layer = badges/ranges/timelines/alerts (traffic + trust engine, CarGurus logic); Pro = dealer subscriptions, acquisition tools (#14/#15), Market 360 analytics; attach = finance/insurance leads. Keep every asset off the balance sheet.

## Risks to respect

- **ikman can clone any standalone tool in a sprint.** Defensibility = cross-site history wiring, not the widget surface.
- **Policy churn is a maintenance burden** — every calculator is one gazette from wrong. Gazette-watching infra and a "last verified against Gazette X" stamp on every number are non-negotiable.
- **Asking-price ≠ sold-price.** Every competitor disclaims this; district velocity (delist/clear patterns) is our proxy — label it honestly.
- **Contradictory policy facts flagged UNVERIFIED in the policy dossier** (15% used-vehicle valuation reduction, PAL/CESS on HS 8703, hybrid VET exemption, late-transfer penalty formula) must be resolved against primary circulars before any of them ship in UI copy.
