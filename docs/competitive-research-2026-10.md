# Sri Lanka Vehicle Listing/Valuation Competitive Landscape — October 2026

Research-only. All claims carry source URLs; unverifiable items flagged. Traffic figures are third-party estimators (Semrush/SimilarWeb mirrors), directional not audited.

## Executive summary

The listing layer is a stable duopoly (ikman dominant, riyasewana the vehicle-only #2), but the **valuation/intelligence layer is being commoditized fast**: at least eight independent sites now sell "AI car valuation" or price analytics built on scraped ikman+riyasewana data (PriceMart.lk, adfinder.lk, VehiclePriceCheck, Welandapola, AutoMe, Adtop.lk, LesiSearch, Auto Stream). Riyasewana — the second-largest source Motormila scrapes — now ships its own nightly IQR-based fair-price system (291 models / 1,296 model-years priced 3 Oct 2026) and hides bait prices, the closest direct competitor to Motormila's FMV story. The moats nobody has yet: **cross-site dedup + per-listing price history**, **district-level velocity**, **Pro/dealer arbitrage tooling**, and **Sinhala-native intelligence** (competitors do Sinhala UI; none does Sinhala market analysis).

## 1. The two giants

### ikman.lk (vehicles) — market leader
- **Scale:** ~1M+/mo web visits (Semrush 1.22M Aug 2026), 75%+ of SL auto-classifieds traffic. App 4.5–4.6★, 5M–8.8M installs. Self-reported "4M+ unique monthly visitors" is unverified.
- **Beyond listings:** Price Suggestion at ad-posting (seller-side, rolling 3-month average only); MotorGuide content hub incl. **Vehicle Import Duty Calculator** (carsguide.ikman.lk); **AI photo-first ad posting** (iOS, Jan 2026: photos → make/model/year + drafted description); **WhatsApp click-to-chat** + verified-phone ikman Chat; **ikman Safe Buy** escrow (Swiftcourt + DirectPay, Rs. 1,500 buyer fee) — the only real escrow in the market; import-condition flag for vehicles still abroad.
- **Monetization:** Boost Ads (Bump Up Rs. 800–1,800; Top Ad; Spotlight Rs. 2,500–5,000) + Authorized Dealer memberships (Rs. 32K–243K/yr).
- **Weaknesses:** app quality complaints (crashes, My Ads sync), auto-"SOLD" marking grievances, scam vectors (fake support QR phishing, bait ads). Crucially: **price data is seller-side only — no buyer-facing fair-price badge, no price history, no deal scoring.**

### riyasewana.com — vehicle-only #2, now a direct FMV competitor
- **Scale:** 85,888 live vehicle ads, 5,856 new ads/day, 50,000+ live sellers (self-reported, 3 Oct 2026). ~2M visits/mo per SimilarWeb-based estimates (conflicting LinkedIn claim of 4.2M — unverified). App 1M+ downloads, 4.4–4.8★.
- **Key competitive finding — nightly market price engine:** ads grouped by make/model/type/year, IQR outlier removal, blended median+mean reference price, bounded acceptable range; **out-of-range ads display as "Negotiable" so bait prices never reach buyers**; sparse years borrow neighbouring years; variants priced before base-model fallback. Latest run (3 Oct 2026): 291 models / 1,296 model-years from 41,510 live ads. Per-model price guides by year + monthly trend charts in search results. Sellers see the fair range while posting.
- **Also:** saved-search push alerts, favourites, dealer Showroom pages (from Rs. 1,900/mo, explicit anti-pay-to-rank stance), prepaid Credits wallet, Bump Up/Top Ads, leasing callback funnel (Jun 2026), 136 embedded YouTube reviews.
- **Anti-fraud:** SMS-verified phones, human review of every ad, phone numbers withheld from page HTML (anti-scrape).
- **Weaknesses:** thin monetization; no escrow/inspection; asking-price statistics only (no sold data, no per-listing history); 100% own inventory — no cross-site view.

### patpat.lk — NBFI-owned (CDB Finance)
- 14,090 vehicles. **Search by monthly budget/instalment** (original differentiator); **in-app leasing application** ("Quick Lease", CDB callback in 3 min); 2025 revamp added instant approvals, dealer pages, Premium Ads.
- Weaknesses: 3.7★ (weakest of big four), telesales-spam and fake-ad complaints, zero price tooling.

### autodirect.lk — import-on-demand dealer, not a marketplace
- Sourcing→shipping→clearing→registration, 30–45 day delivery, 0% financing + **PCP finance**, third-party pre-purchase history reports (CarChecks.lk), **trade-in with up to 70% of value unlocked upfront**, warranties.
- Weakness: own imported stock only, fixed all-in prices, no data tools.

### autolanka.com — legacy pioneer (est. 2001)
- Only real asset: the still-active **AutoLanka Forums** community (Ask an Expert, DIY, buying advice). Dated UI, tiny inventory, 2-person company.

### saleme.lk / hitad.lk — low threat
- saleme: generalist classifieds, no vehicle tooling. hitad: print-media classifieds; notable only for **USSD #479# ad posting** and free SMS matching alerts.

### Carmudi.lk — defunct as a car marketplace
- Domain now serves LankaHolidays.com car-rental content; registrant record shows 2017 expiry (uptime monitors + registrar data agree; direct fetch not performed).

## 2. Facebook & WhatsApp — the unstructured market

Facebook Marketplace + Sinhala-titled buy/sell groups ("Riyasewana- රිය සෙවන | DIRECT FROM JAPAN AUCTION"), MOTORHUB.LK and JDM SL WhatsApp groups. Police/press advisories consistently name "Facebook, Ikman, WhatsApp" as scam channels. Ads cross-posted between FB groups and classifieds inflate raw counts; **nobody dedupes across the FB↔site boundary**. Vahana.lk markets "integrated with Sri Lanka's largest vehicle-related Facebook groups" — FB reach is a consciously leveraged selling point. (FB group sizes/volumes unverified — Facebook blocks automated access.)

## 3. The data-intelligence swarm (direct Motormila analogues)

All scrape ikman and/or riyasewana.

| Player | What it does | Gap vs Motormila |
|---|---|---|
| **PriceMart.lk** | Daily ikman+riyasewana scraper. Mean/median/min/max per make/model/year, IQR filtering, 30-day trend, compare, budget finder, **sell-through leaderboard**, mileage-vs-price scatter, **district heat map**, import tax calculator, cited data-journalism blog; own Marketplace (Jul 2026) with seller ratings + public Q&A | Only 2 sources; no per-listing history/FMV badge; no cross-site dedup; no Pro tier. But it owns the narrative |
| **adfinder.lk** | AI ad-hunter: criteria once → SMS/WhatsApp/email alerts; monitors "the entire internet" incl. **5+ FB groups**; publishes min/avg/max price movements; EN/SI/TA UI | Alerting is their wedge; no deal scoring, no district data |
| **Welandapola.com** | Whole-economy price index (vehicles + vegetables + fuel + gold), vehicle heatmap, AI estimate, tax calculator; EN/SI/TA | Vehicles a side category; thin data (305 listings in sample) |
| **VehiclePriceCheck.com** | Brand-by-brand insights, budget browser, AI valuation form | English only, no listings |
| **Auto Stream (autostream.lk)** | Launched 2024–25, funded marketing (Newswire Mar 2026). Claims "SL's 1st Average Vehicle Market Price Chart" (YOM-based on every ad), 3-way compare, loan calculator, **BLUE-T 290-point AI-assisted inspection grading** | YOM-averages only; inspection claims unverified. **Most credible new entrant — watch this one** |
| **LesiSearch** | AI vehicle discovery across marketplaces, ranks by "true market value, condition, ownership costs"; into AIMart marketplace (Apr 2026) | Early-stage; validates "AI ranks deals" as a concept |
| **AutoMe / Adtop.lk** | Free AI valuations (explicitly approximate), classifieds | Shallow |
| **PrimeMarket.lk** (Feb 2026) | Vehicles+property, "list on 5 channels", verified listings, chat + viewing scheduler | New, unproven |
| **Evolution Auto "Auto Direct"** (Jul 2026) | EV distributor's trade-in/used platform, market-based valuation + ownership verification | Niche |

## 4. Smaller classifieds (low threat, source coverage matters)

riyahub, carmarket, carshop, vehiclemart, sello, carads (2,859, WhatsApp-first), rapid, sellit, skymarket, selling (app 10K+), automachan (incl. "Valuation Centers" directory), riyapola (dormant), careka.lk (Central Finance-backed, compare + lease/insurance rates, 2.8★), vahana.lk (OTP posting + FB-group distribution), sukanama (claims 150-point inspection), wahanaya, sellcar. **nextdrive.lk**: feature-rich (200+ point inspection reports, FMV, Global Vehicle Check, reserve-with-deposit, RMV concierge, EMI calculators) but near-zero traffic (~338 visits/mo) — ideas without distribution.

## 5. Inspection & trust infrastructure (partnership targets)

- **CarChecks.lk** — "SL's first dedicated vehicle scrutiny center": 230+ point inspection (Rs. 8,500–9,500), Accident Free Certificate, mobile/fleet inspection, international history reports, **HNB leasing partnership** (special rates for 90%+ scores). Used by Autodirect. 4.8★ (tiny review count).
- **DMT Online Registered Vehicle Information Service** — free ownership/engine-number lookups (ikman's own buyer guide points here). **Nobody has productized this into a listing-level verification badge.**

## 6. Feature gaps the SL market leaves open

1. **Cross-site dedup + per-listing price history is unowned.** Every analytics site computes from fresh snapshots (24h/nightly). None tracks the same car across sites or shows a listing's price trajectory. Motormila's VIN+fuzzy dedup + history remain genuinely differentiated.
2. **True sold/velocity data.** All compute from asking prices with disclaimers. **District velocity has no competitor at all** — only price heatmaps exist.
3. **Buyer-side fair-price badges on real ads.** ikman's suggestion is seller-side/hidden; Riyasewana hides out-of-range prices but gives no verdict to buyers. A per-listing Deal Score on aggregated multi-site listings is unoccupied.
4. **Sinhala-native (and Tamil) market intelligence.** Everyone does Sinhala *UI*; nobody publishes Sinhala price analysis, trend explainers, or a Sinhala FMV flow. The FB-group economy runs in Sinhala.
5. **Realtime alerts with fair-price context** ("this Vezel is 14% below the 30-day median"). AdFinder proves alerting is valued but their alerts carry no verdict.
6. **Escrow/secure-deposit for private sales** is nearly absent (ikman Safe Buy the only branded escrow) — partner rather than build.
7. **Dealer arbitrage/wholesale tooling.** All dealer products are *promotion* (Top Ads, showrooms) — none give market intelligence (aging inventory, arbitrage gaps, district spreads). Pro tier wide open.
8. **Duty/permit policy → used-price transmission.** ~15 tax calculators exist (crowded, quality varies), but **nobody connects a Gazette change to predicted used-price moves**. That's the Official Pulse angle and it's unclaimed.
9. **Sell-side optimization with outcomes** ("priced within range → sold in X days median"). Sell-through + time-to-sell benchmarking is a dealer magnet.

## 7. Features competitors have that Motormila lacks

1. Riyasewana's **anti-bait-price policy** (out-of-range → "Negotiable") and seller-side range shown at posting.
2. ikman Safe Buy **escrow + WhatsApp click-to-chat** — transactions live in contact-flow friction; Motormila links out.
3. **Leasing/finance funnels**: patpat budget-search + 3-min callback, riyasewana leasing leads, Auto Stream loan calculator, NextDrive EMI/affordability, Careka lease+insurance rates. "What will this cost me monthly" is table stakes in SL and absent from Motormila.
4. **Inspection integration**: CarChecks (Autodirect), BLUE-T 290-point (Auto Stream), NextDrive 200+, Sukkanama 150+. Even a "book a CarChecks inspection" CTA matches market expectations.
5. **Content/SEO moat**: ikman's MotorGuide (reviews, specs, duty calculator), PriceMart's data-journalism blog, riyasewana's 136 YouTube reviews in search results. Make/model hubs need editorial + video depth.
6. **i18n**: AdFinder and Welandapola already ship trilingual EN/SI/TA.
7. **Sell-side distribution**: Vahana's "post to our FB groups", PrimeMarket's "list on 5 channels", bump/top-ad economies, dealer showrooms with stock. Sellers follow distribution.
8. **Trade-in/valuation liquidity**: Autodirect's "70% upfront" and Evolution Auto's direct buy give sellers instant exits.
9. **Reputation layers**: PriceMart seller ratings + public Q&A.

## 8. Traffic/positioning scoreboard (directional)

| Player | Web traffic | App | Notes |
|---|---|---|---|
| ikman.lk | ~0.8–1.5M/mo | 4.5–4.6★, 5–8.8M installs | ~75% of auto-classifieds |
| riyasewana.com | ~455K–2M/mo (conflicting) | 4.4–4.8★, 1M+ installs | Vehicle-only depth |
| patpat.lk | claims 1M+ visitors/mo | 3.7★, 100K+ installs | NBFI-owned |
| PriceMart.lk | not ranked | none | Data brand despite small traffic |
| adfinder.lk | 1-person startup | none | Alerting wedge |
| Auto Stream | funded marketing | claims app | Watch this one |
| nextdrive.lk | ~338/mo | none | Feature-rich, no distribution |

**Unverified flags:** ikman "4M unique visitors" (self-reported); riyasewana's 4.2M/mo LinkedIn figure conflicts with ~2M SimilarWeb and a 455K mirror; FB group sizes unretrievable; Carmudi.lk status inferred from monitors + registrar; "Car Check Lanka" (Daranagama) vs "Car Checks" (Nugegoda) relationship unknown; MarkWide/DataInsights market-size figures are paid-vendor estimates.

## Bottom line

The analytics layer is now table stakes (riyasewana ships it natively on the largest vehicle inventory; a swarm of scrapers covers the rest). Motormila's defensible ground: cross-site dedup + listing-level history + velocity/arbitrage data + dealer tooling. Fastest parity moves: buyer-facing fair-price badge with anti-bait-price UX, monthly-cost/leasing calculator, Sinhala+Tamil intelligence, inspection/escrow partner integration.
