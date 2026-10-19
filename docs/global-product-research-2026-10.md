# Global Used-Vehicle Pricing/Marketplace Products — Feature Research for Motormila
Research current as of 2026-10-03. Web research only; no repo files modified.

## 1. US valuation incumbents

### Kelley Blue Book (kbb.com)
- **Valuation methodology**: Four distinct value types — Trade-In Value, Private Party Value, Fair Purchase Price (used retail, midpoint of the Fair Market Range), and CPO price. Fair Purchase Price updated/verified at least weekly from actual transactions plus registration databases. Values computed across 120–137 geographic regions analyzed individually. Data stack: 100K+ auction transactions/week (incl. detailed Manheim data, ~60% of US auction volume), tens of thousands of dealer sales/week, 300K+ sales transactions/week from DMS aggregators, 3.5M+ daily listings from AutoTrader, macro forecasts (Moody's: unemployment, fuel prices, GDP, CPI), consumer-demand signals from 19M monthly visitors, OEM configuration/incentive data. Statistical models adjust weekly for supply/demand shocks, natural disasters, seasonality.
- **Trust/deal features**: Price Advisor = range-based tool with three zones — White (below Fair Market Range), Green (within), Red (above) — plus "Great Price"/"Good Price" badging on KBB and AutoTrader SRPs/VDPs, filterable in search. Trade-In ≈ retail minus reconditioning cost to dealer spec.
- **Alerts/personalization**: My Car's Value-type tracking, VIN/plate entry for accurate vehicle identification.
- **Monetization**: Consumer free (lead-gen); dealer B2B values, Price Advisor badges, Instant Cash Offer (rebranded from Trade-In Marketplace) sold to dealers; Cox Automotive ecosystem.
- **Mobile/AI**: VIN or license plate lookup; Instant Cash Offer binding at participating dealers.
- Sources: https://b2b.kbb.com/kbb-vehicle-values/definitions-of-our-values/ ; https://www.kbb.com/faq/used-cars/ ; https://b2b.kbb.com/solutions/price-advisor/ ; https://www.kbb.com/car-prices/

### Edmunds
- **Valuation methodology**: TMV = regionalized estimate of average price paid, built from cleansed transaction data (outliers/demo units removed), adjusted for options, color, incentives, supply/demand, seasonality, gas prices, economy; includes a 30-day forecast, refreshed regularly. Used values use five condition tiers — Outstanding / Clean / Average / Rough / Damaged — with "Clean" as the baseline and downward adjustment for reconditioning cost; Damaged vehicles get no estimate (guidance: Average minus repair cost). Appraisal outputs three bands: Trade-In, Private Party, Retail.
- **Trust/deal features**: "See Pricing History" on appraisal reports — value-over-time chart for timing a sale.
- **Alerts/personalization**: 7-day instant cash offer at participating dealerships.
- **Monetization**: Consumer free + dealer lead-gen/ads; API historically sold TMV data (developer docs).
- Sources: https://static.ed.edmunds-media.com/unversioned/img/drc/Edmunds-True-Market-Value.pdf ; https://help.edmunds.com/hc/en-us/articles/206103047 ; https://www.edmunds.com/appraisal/

### CarGurus — the deal-rating benchmark
- **Valuation methodology**: Instant Market Value (IMV) = estimated fair retail price from analysis of comparable current AND previous listings in the local market; recomputed daily from 5M+ data points (make, model, trim, year, mileage, options, vehicle history). Listing-based, not transaction-based — the most replicable methodology for Motormila.
- **Deal rating**: asking price vs IMV → Great / Good / Fair / High / Overpriced; dealer reputation factored in; best deals sorted first "based on our algorithm, not how much a dealer pays us". Deal rating displayed on every listing as a visual badge. Their claim: 80% of shoppers won't buy without IMV (⚠️ vendor claim).
- **Listing trust signals**: price history timeline, days-on-market, free Carfax/AutoCheck snapshot, "priced $X below market" differential (dealScore, priceDifferential fields).
- **Dealer tools**: IMV Scan — dealer scans VIN in app, gets estimated IMV + the price range that lands each deal rating (e.g. "price here to show as Good Deal") — used for auction buying and trade-in pricing. PriceVantage = à carte pricing SaaS powered by real-time consumer demand.
- **Monetization**: flat monthly dealer subscriptions in tiers (Enhanced/Featured/Featured Priority); 24,692 paying US dealers (end-2024); QARSD $6,492 (Q3 2025); FY2025 revenue $907M; CarOffer digital wholesale (dealer-to-dealer + Instant Max Cash Offer) as second segment.
- Sources: https://cargurus.helpscoutdocs.com/article/10-what-is-imv ; https://assets.ctfassets.net/0czyc7nlfvzo/4f2pymo70GTJ6EqnoMB7GO/d50c19b3b16a83f71e4b7e35075f46c3/CarGurus-IMV-one-pager.pdf ; https://dealers.cargurus.com/drc/cargurus-helps-dealers-price-confidently-with-imv-scan ; https://investors.cargurus.com/news-releases/news-release-details/cargurus-announces-fourth-quarter-and-full-year-2025-results

### AutoTrader (UK)
- **Trust/deal features**: Price Indicator (2017) — dial UI with labels Lower Price / Great Price / Good Price / Fair Price / Higher Price vs the AutoTrader Valuation; shows the exact £ variance; recomputed daily. Eligibility rules are explicit: not private seller, not imported/write-off (Cat C/D/S/N), <15 years, £1,500–£70,000, not near-new or rare. Valuation from advert + sales data ("Market Valuation Data") and their algorithm.
- **Market index**: Retail Price Index published monthly — 800K vehicles monitored daily, 116K updates, ~39K added/removed, 450K trade listings + 3,000 dealer sites + auction house data; UK ONS now ingests the same dataset for official CPI statistics. Marketed as "AI-powered RPI" (2026).
- **Alerts**: instant notifications when new vehicles match saved searches; app price indicator.
- Sources: https://www.autotrader.co.uk/price-indicator-info ; https://www.autotrader.co.uk/partners/retailer/terms-and-conditions/price-indicator ; https://plc.autotrader.co.uk/news-views/retail-price-index/ ; https://plc.autotrader.co.uk/news-views/press-releases/autotrader-retail-price-index-april-2026/

### CarMax
- **Instant cash offer**: firm, non-negotiable offers in ~2 minutes online, valid 7 days; inputs VIN, odometer, vehicle history, overall condition; adjusted only if condition/use/history differs from what seller reported; home pickup or store appointment; payment on the spot.
- **Offer Watch**: free ongoing value estimate after an initial offer, tracking market trends + projected mileage — a re-engagement loop (estimate ≠ redeemable; refresh details to get a live offer).
- **Trust**: no-haggle pricing, MaxCare warranty, 30–45 min in-store appraisal.
- Sources: https://www.carmax.com/sell-my-car ; https://www.carmax.com/value ; https://www.carmax.com/faq/selling-a-car/is-the-online-offer-a-real-offer-or-an-estimate

### NADA → J.D. Power Valuation Services
- The lender-facing authority: trade-in values in Rough/Average/Clean, plus distinct **loan values** and retail values, monthly, 10 regional editions; ~500K subscribers incl. banks/credit unions for collateral risk. ALG residual forecasts 3–60 months out, bi-monthly. Key structural insight: retail ≠ trade-in ≠ loan value, and lenders pay for the loan value specifically.
- Sources: https://www.jdpowervalues.com/get-values/adan-official-used-car-guide ; https://www.jdpower.com/business/automotive/lending/valuations/

## 2. UK/EU transaction platforms

### Motorway (UK)
- Sell-side-only model: instant valuation from reg + mileage ("live market data and real auction outcomes" — historic dealer offers for similar vehicles + real-time market data), AI profiling tool builds the car's sale profile from the seller's phone, then a **guide price** is set from condition/mileage/history, car enters a daily auction to 8,000+ verified dealers, highest offer presented; home collection; payment before the car leaves; finance settlement coordinated with lender. Motorway Move: trained driver performs a structured on-site inspection against the original profile via the Collect app, discrepancies reported to the dealer in real time. Claim: >50% of cars at guide price achieve more (⚠️ vendor claim).
- Sources: https://motorway.co.uk/how-it-works ; https://help.motorway.co.uk/hc/en-gb/articles/4853669944220

### Cazoo / MOTORS / heycar / cinch (2026 landscape — verified status)
- Original Cazoo (online retailer) collapsed 2024, in administration until 2028; MOTORS bought the Cazoo name + marketplace for £5M and **rebranded MOTORS → Cazoo on 27 May 2026** as a single dealer-advertising marketplace challenging AutoTrader (234K listings vs AutoTrader's 459K). heycar wound down 2025 (VWFS pulled funding; tech absorbed into a VWFS subsidiary). Lesson: asset-heavy online retail died; dealer-advertising marketplace survived under the stronger brand.
- **cinch** (Constellation/BCA): fixed "fair price" re-checked daily against market, 14-day money-back guarantee, warranty + cinchCare bundle (warranty/MOT/servicing/breakdown in one monthly fee), HPI history shown on listings, part-ex valuation, soft-search finance.
- **carwow**: free seller auction to 5,500–6,000+ dealers with reserve price; monetizes via dealer **subscription from £15/car** (launched Jan 2025) + buyer's fee on auctions + finance arrangement fees; all listings syndicated to Auto Express.
- Sources: https://dealer.motors.co.uk/one-platform-one-focus/ ; https://cardealermagazine.co.uk/failed-used-car-dealer-cazoo-to-remain-in-administration-until-2028.../324412 ; https://help.cinch.co.uk/hc/en-gb/articles/23778650856989 ; https://www.carwow.co.uk/partners/used ; https://support.carwow.co.uk/s/article/How-does-carwow-make-money

### AutoScout24 / mobile.de (DACH)
- AutoScout24: free vehicle valuation comparing against similar live listings; dealer-side **Market Price Check** returns a market price estimate + recommended price range + live comparable listings (used for trade-in offers, private sourcing, auction buying). Monetization innovation: Swiss platform scales the monthly dealer fee by a "Car Value Factor" (0.8–1.2×) based on average inventory value — value-based pricing. Note: third-party browser extensions (AutoScout24 Price Analyser) fill the deal-rating gap with Great deal/Fair/Overpriced verdicts — demand exists even where the platform doesn't ship it.
- mobile.de: free statistical valuation from 2M+ daily market values; openly disclaims condition blindness. Every listing carries the site's own price verdict (`very_good_price` → `high_price`), struck-through price cuts with prior price, seller star ratings with review counts.
- Sources: https://www.autoscout24.de/fahrzeugbewertung/ ; https://b2b.autoscout24.ch/market-price-check-wieder-verfuegbar/ ; https://www.mobile.de/verkaufen/auto/bewertung/ ; https://hy.co/en/2026/06/02/marketplace-monetization-in-the-age-of-ai-hy/

### RedBook (Australia) — the finance/insurance valuation authority
- Real-Time Valuations engine: daily feeds from the carsales marketplace network + wholesale auction data; dynamic km-, margin-, and condition-adjusted prices; publishes **pricing scores and average-days-to-sell indicators**; residual forecasts up to 5 years; RedBook LIVE reports bundle confidence scores, price history graphs, market comparisons (live + delisted), repair cost estimates; VIN/Rego identification. Conditions ladder: Near New / Very Good / Good / Average / Fair / Poor. Sold to lenders, insurers, fleets — the B2B valuation-as-a-service template.
- Sources: https://commercial.redbook.com.au/products/pricing-and-valuations/ ; https://commercial.redbook.com.au/products/marketplace-live-reports/

## 3. India/Asia emerging-market platforms (closest operating analogues)

### Cars24
- AI valuation engine trained on 10 lakh+ (1M+) transactions since 2015 (their ML blog cites 4M+ inspections, 9M+ auctions, 750K+ cars transacted as of 2023). Inputs: make/model/year/variant/fuel/registration location, odometer, ownership count, condition signals (inspection, photos, service history), market signals (demand, variant scarcity, regional price trends). Flow: free indicative online quote → 300-point home inspection → final price → optional pan-India live dealer auction (20K+ verified dealers) where bids push price up. Transparency pattern: seller sees live bid counts and competing offers.
- Sources: https://www.cars24.com/article/cars24s-best-price-scale-backed-and-tech-driven/ ; https://www.cars24.com/used-car-valuation/ ; https://medium.com/cars24-data-science-blog/how-cars24-uses-machine-learning-for-dynamic-pricing-of-used-cars-part-1-51fee52860d1

### Spinny
- Trust bundle as the product: 200-point inspection (cars with major accident/flood/odometer issues rejected), **fixed price** ("if the price is negotiable, it's not the right price"), 5-day money-back (300 km), 1-year warranty standard (3-year Assured Plus), home test drives. Pricing engine "Star Engine" blends market sales data + inspection results. **Assured BuyBack**: guaranteed resale value at 12/18/36 months — turns depreciation certainty into a sales feature. Sellers: free doorstep evaluation, same-day payment.
- Sources: https://www.spinny.com/spinny-assured/ ; https://www.spinny.com/car-buy-back-program/ ; https://www.spinny.com/how-it-works/pricing/

### CarDekho / CarWale (Girnar group)
- SmartPrice (CarDekho) and AccuPrice (CarWale): free ML valuation over 500K+ listings, claiming 90%+ accuracy (⚠️ vendor claim). CarDekho app stack: "Ask an AI Expert" shopping assistant, price-drop alerts, side-by-side compare, EMI calculators with live city on-road price breakups, certified used with 217-point inspection + 6-month warranty + 7-day returns, **Trust Tags** on listings (Finance Available, Buyback Option, 1-yr Warranty, RC transfer, Less Driven, Discounted, Almost New), free RC transfer handling. DealerCentral dealer app: valuations + "Market 360" analytics. Group moat: content/spec database + insurance (InsuranceDekho) + financing (Rupyy) attach.
- Sources: https://www.cardekho.com/used-car-valuation.htm ; https://www.carwale.com/used/carvaluation/ ; https://play.google.com/store/apps/details?id=com.girnarsoft.cardekho

### Droom — Orange Book Value (OBV)
- Distinct methodology: **depreciation-curve-based**, not transaction-based — thousands of plotted depreciation curves mapped to every vehicle type in India; inputs include transaction purpose (buy vs sell) and counterparty (private vs dealer), odometer, condition. Published 15-factor condition rubric (body, frame, engine, brakes, tires, upholstery, odour, electronics, service records, emissions, water damage, odometer tampering...) with Excellent/Very Good/Good/Fair tiers. Monetization: free basic value, paid OBV Premium valuation certificate, OBV Enterprise API for OEMs/BFSI/lenders.
- Sources: https://orangebookvalue.com/methodology ; https://orangebookvalue.com/determine-condition ; https://orangebookvalue.com/enterprise

### OLX Autos / CarTrade (the cautionary tale)
- CarTrade shut OLX Autos' C2B transaction business in Oct 2023 over unit economics; kept classifieds, which now run at high-30% EBITDA margins; CarTrade group posted record profit (INR 46.1 crore, Q4 FY2025) off listings/leads/ads + auction platform. Crisil: India used-car market ~6M units FY26, ~₹4T value, 8–10% growth, organized players barely breaking even on C2B — financing, insurance, doorstep delivery and inspection are the margin levers. Lesson for Motormila: stay asset-light; monetize data and leads, not inventory.
- Sources: https://www.thehindubusinessline.com/companies/cartrade-to-shut-down-auto-sales-business-of-olx/article67458497.ece ; https://www.business-standard.com/industry/auto/used-car-market-india-growth-outpaces-new-car-sales-crisil-fy26-125071100671_1.html ; https://alphastreet.com/india/cartrade-tech-limited-cartrade-q4-2025-earnings-call-transcript/

### Carousell Autos (Singapore/SEA)
- Dealer-bidding sell flow: 500+ verified dealers quote, highest quotes delivered within 24h, non-obligatory inspection; Seller Success Fee $100 (waived for >9-year-old cars). **AI Car Finder** (launched 18 Jun 2026): conversational used-car search ("What's a reliable family SUV under $80,000?") that also prompts on maintenance cost, financing, long-term value. "Personal Assistant" concierge for buying/selling/insurance/loan quotes. Escrow-backed Buyer Protection; AI fills listing title/description/price from a photo.
- Sources: https://press.carousell.com/2026/06/18/carousell-autos-launches-singapores-first-ai-powered-car-finder/ ; https://www.carousell.sg/autos/car-valuation-singapore/ ; https://play.google.com/store/apps/details?id=com.thecarousell.Carousell_Snap_Sell_Chat_Buy

### Goo-net / Carsensor (Japan) — condition grading as trust infrastructure
- Listings carry third-party appraisal certificates (JAAA via Goo-ninsho), 5-point scores per category (exterior/interior/mechanism), **repair-history flag (修復歴)** as a first-class field, inspection (shaken) expiry, certification with 1-year warranty; export layer adds auction-sheet grades (R/A/B) and FOB pricing. The entire trust model is "documented, standardized condition per vehicle."
- Sources: https://www.carsensor.net/usedcar/detail/AU7107049818/index.html ; https://carapis.com/platforms/east-asia/goo-net ; https://carapis.com/markets/japan

### Sri Lanka local comparables (direct competitors)
- PriceMart.lk: scrapes ikman + riyasewana only (2 sites), daily medians per make/model/year, trend charts, outlier filtering, compare tool, explicitly "asking prices not sale prices". VehiclePriceCheck.com: AI valuation predict.php + market insights. AutoMe.lk: "guide price" bot, self-described as young/learning. Motormila's edge today: 13+ sources (not 2), cross-site dedup, district maps, FMV + Deal Score. Sources: https://pricemart.lk/about ; https://vehiclepricecheck.com/predict.php ; https://autome.lk/car-valuation

### UK/EU enrichment (research agent, verified with sources)
- **Motorway seller-trust stack**: "Image Assist" AI checks each seller photo against dealer requirements and coaches in plain English; camera-roll uploads blocked — all photos live-captured and timestamped (device-tied) as evidence of disclosed condition; policy: dealers may not renegotiate a correctly-profiled car and must submit photos substantiating any reduction. Pricing engine "RPM" = ML on Google Cloud Vertex AI (seller spec/defects, supply-demand per model, prior-day auction outcomes), 8M valuations since 2021. Car Value Tracker: 24-month value/depreciation graph incl. past valuations. Motorway Pay: instant seller payment + finance settlement, 2,000+ dealers, 50%+ of transactions. Monetization shifted: tiered seller fee £29.99–£99.99 on completed sales (from 6 May 2026) + dealer fees. Claim: 84% of sellers beat average market price (Jan 2020–Nov 2025) — ⚠️ vendor claim.
- **AutoTrader UK depth**: Trended Valuations (historic value view + Historic Valuations API), Deal Builder digital retailing (all retailers, Jul 2025), **Buying Signals** (Nov 2025) — buyer-intent scoring from 450M weekly interactions; saved-search alerts are a daily email/push digest, not instant.
- **mobile.de dealer tool**: Inserats-Analyse tabs (Performance, Preisbewertung, search position, Marktlage supply/demand label) + **60-day AI sell-probability** + "exact price adjustment needed to reach the next price-label band" — the dealer-facing mirror of the consumer badge.
- **cap hpi retail-value pipeline** (methodology credibility template): 700K+ live dealer adverts scraped daily → cleaned/clustered → decision tree → ~4M daily price points across ~65K variants at 6 mileage points → 20+ validation business rules + human editors. Trade values in 3 conditions; "Black Book Live" publishes 6M real-time value movements *with reasons for each move*. Claim: 60% of vehicles valued within 10% of actual trade price (University of Leeds validated) — vendor claim with third-party validation.
- **History-check tiering (HPI Check / MyCarCheck)**: free layer (spec, valuation, MOT-equivalent status) → £4.99 basic (stolen/write-off/exported/plate changes) → £8.49 adds outstanding finance. HPI Check bundles 80+ data points with 4 market values (trade/private/forecourt/at-new), from £19.99. France: free official **HistoVec** state history being ingested by AI listing tools (Scanicar, AI deal-hunter launched Apr 2026).
- **What Car?** valuation certificate (poor/average/excellent condition tiers; powered by AutoTrader data) emailed as a PDF — cheap trust artifact.
- **Cazoo (post-rebrand marketplace)**: AI image search ("Shazam-style" — photograph a car to find matching dealer stock) launched Sept 2026, claimed first among UK marketplaces.
- **pixcar**: ⚠️ no French used-vehicle marketplace/valuation product by this name found (only a zero-employee Saint-Étienne trader of similar name, an Israeli photo app, and "PixMyCar" dealer tooling). Needs disambiguation.

### US enrichment (research agent, verified with sources) — 2026 changes that affect the recommendations
- **Badge era twist**: Cox paused Good/Great price badging on KBB/AutoTrader/vAuto on **13 May 2026** under FTC pressure for fee-inclusive advertised pricing, replacing it with an "all-in pricing" badge; badging will "evolve to reflect transparent pricing standards" ([cbtnews.com](https://www.cbtnews.com/cox-automotive-pauses-good-great-price-badging/)). And **CarGurus, from 20 Jul 2026, only shows Deal Ratings on used listings where dealers disclose mandatory fees** — undisclosed-fee listings get "No Rating" + search demotion, plus "Price includes fees" badges/filters ([CarGurus press](https://www.cargurus.com/about/press/fee-transparency-updates)). The deal badge in 2026 is now also a **transparency-enforcement and dealer-behavior lever**, not just a price signal.
- **CarGurus wound down CarOffer** (Instant Max Cash Offer + Dealer-to-Dealer wholesale; board decision 6 Aug 2025, abandoned for accounting by 31 Dec 2025) — transaction fulfillment "less effective in today's more volatile pricing environment"; refocusing on AI inventory intelligence ([SEC filing](https://www.sec.gov/Archives/edgar/data/1494259/000095017025105025/carg-20250806.htm)). Reinforces the "don't hold inventory" rule. The consumer "Sell My Car – Top Dealer Offers" (dealer bidding) survives.
- **IMV API enum** (useful design reference): GREAT_PRICE, GOOD_PRICE, OK_PRICE, FAIR_PRICE, POOR_PRICE, OVERPRICED, OUTLIER, NA — note the OUTLIER band for thin comparables ([OpenAPI spec](https://raw.githubusercontent.com/api-evangelist/cargurus-dealer/refs/heads/main/openapi/cargurus-dealer-instant-market-value-api-openapi.yml)). CarGurus tracks "days at dealership" separately from "days on site" (cars move between lots).
- **KBB condition stack**: 4 tiers (Excellent/Very Good/Good/Fair) + Condition Quiz, and KBB publishes the share of vehicles in each tier to discourage self-over-rating (most cars are "Good"); salvage/"clouded" title rule-of-thumb 20–40% deduction; mileage adjusted against statistically modeled "typical mileage for age". **Blue Book Lending Value** = trade-in + reconditioning/safety costs — the lender-facing value type. KBB ICO: firm 7-day offer, consumers can counteroffer; NADA 2026 preview of **AI Remote Damage Assessment** (photo-based damage detection) + Dynamic Condition Quiz; vAuto×UVeye AI inspection partnership (Feb 2026); Cox claims customer photo capture lifts trade-in close rates up to 18% (⚠️ secondary).
- **Edmunds** (CarMax-owned since Jun 2021): appraisal surfaces CarMax instant offer + partner offers side-by-side (multi-offer comparison model); first US car-shopper ChatGPT plugin (2023); EV battery-health insights per VIN with Recurrent; dealer reviews hand-moderated, only 2 years count, dealers can't remove negatives. GM IMR certified its Trade-In Tool/ICO as turnkey (Feb 2025).
- **CarMax**: **Skye** AI virtual assistant now independently answers >50% of customer questions (+20pp YoY); >80% of sales digitally supported; Offer Watch launched 18 Nov 2025 alongside nationwide at-home pickup; Auto Finance financed 42.7% of retail used units (the finance attach is where the margin is); MaxOffer is the dealer-facing arm of the consumer appraisal funnel.
- **JD Power (ex-NADA)**: trade-in values from 12M+ retail transactions/year across 16,000+ dealerships via PIN (250+ metrics/vehicle) — positioned against KBB/Black Book extrapolating from wholesale auctions; DMA Retail Value = national average retail × market percentage from PIN transactions; "loan value" concept originated here as the lender floor; embedded in bank loan origination (nCino).
- **Cars.com "Carson"** AI search engine: users show 2× repeat visits, 3× saves, 2× leads ([PR](https://www.prnewswire.com/news-releases/meet-carson-carscoms-new-ai-engine-for-car-shopping-302606877.html)) — quantified support for recommendation item 9 (conversational car finder).
- ⚠️ Not verified: KBB consumer price-drop alerts, AutoTrader US per-listing price-history chart / "Deal Alerts" naming (US help center was down), official badge percentage thresholds anywhere, CarMax photo-based appraisal.

## 4. Marketplace mechanics, alerts, monetization patterns

### Facebook Marketplace vehicles (2025–2026)
- Nov 2025 redesign: Collections (shared, collaborative buying with a friend joining the seller chat), Meta AI "suggested questions to ask" button in seller chats, and **AI vehicle-listing insights** — one panel aggregating engine options, safety ratings, transmission, seating, cargo, reviews, and **price insights**; vehicles are a top-5 search category for young adults. Mar 2026: AI auto-replies for sellers. Third-party layer proves demand: DealFlip AI (0–100 Deal Score + risk flags + suggested opening offer on Marketplace listings), CARVID Acquire (AI acquisition agent that finds, contacts, negotiates with private sellers), PostDrop (VIN-decode + AI listing generation), CarSnipe price-drop trackers (claims ~30% of purchases originate from price-drop alerts — ⚠️ vendor claim).
- Sources: https://about.fb.com/news/2025/11/facebook-marketplace-gets-a-glow-up/ ; https://about.fb.com/news/2026/03/facebook-marketplace-new-meta-ai-tools-make-selling-faster-and-easier/ ; https://dealflip.ai/ ; https://www.carvidapp.com/carvid-acquire/

### WhatsApp commerce (India playbook — directly portable to Sri Lanka)
- India has 535M+ WhatsApp users; organized players run the full used-car journey on WhatsApp: portal-enquiry auto-reply with car card → inspection report PDF delivery → test-drive slot booking → finance pre-approval (KYC flows) → payment links → RC-transfer status → warranty handover → post-sale nurture. Exchange/trade-in bots: seller sends reg number + km + photos → preliminary valuation range → inspection appointment (90%+ open rates vs app installs). Case: Money4Vehicle valuation bot (LangChain + OpenAI + WhatsApp API) claims 90% reduction in manual valuation effort (⚠️ vendor claim).
- Sources: https://richautomate.in/blog/whatsapp-used-car-dealership-india-2026 ; https://hyperleap.ai/blog/whatsapp-auto-dealerships-india ; https://www.dreamlinetechnologies.com/money4vehicle-ai-vehicle-valuation-agent/

### Price-history / days-on-market UX (property portals are a generation ahead)
- Zillow/Redfin patterns that cars platforms are copying: full price-history event timeline (listed / price change / sold with dates), days-on-market badge, "True Days on Market" accounting for delist/relist cycles, motivation grading. OTDCheck does VIN-level price timelines over 2.8M vehicles for negotiation leverage. Evidence base: iSeeCars study (30M listings): 1 in 5 used cars got a ~7% reduction before selling, average 31.5 days on market; listings with ≥1 price cut sell 36% faster (attributed to Edmunds via secondary source — ⚠️ verify); ~22.6% of dealer listings reprice after going live (2026 sample — ⚠️ secondary). Tactical pattern: cuts should cross search-filter thresholds ($20,500 → $19,900), not nibble.
- Sources: https://otdcheck.com/blog/how-to-use-vin-price-history-negotiate ; https://www.iseecars.com/wait-for-used-car-deals-2013-study ; https://carsnipe.com/blog/facebook-marketplace-car-price-drop-alerts

### Monetization benchmarks
- CarGurus: flat monthly dealer subscriptions, tier upgrades + à carte add-ons are the growth levers (unit price increases are "one of the weakest levers"); QARSD $6,492. Carwow: dealer subscription from £15/car + buyer's fees. AutoScout24 CH: fee scaled by inventory value ("Car Value Factor" 0.8–1.2×). Chrono24 (cross-industry): base fee (€199/25 units) + 3.5% transaction commission. Pay-per-lead is tested widely but not dominant; emerging markets skew to cheap listing boosts + dealer subscriptions ($10–300/mo). Finance/insurance attach (CarDekho group) is what flips thin margins.
- Sources: https://hy.co/en/2026/06/02/marketplace-monetization-in-the-age-of-ai-hy/ ; https://www.am-online.com/news/carwow-launches-subscription-model-for-dealers-to-advertise-used-cars ; https://investors.cargurus.com (Q4 FY2025 call)

### Fraud/trust mechanics (classifieds)
- Jiji (Africa) pattern stack: pre-publication moderation, ML fraud detection on ads/users, "Something wrong?" user reporting with auto-ban thresholds, pay-on-delivery norms (no deposits), police collaboration. Escrow emerging: Jiji SafePay concept, TrustPay Kenya (M-Pesa escrow), SafePay.autos; inspection-request features on listings. Nigerian market guides codify scam signals exploitable as product features: price 30–40% below comps ("bait"), stock/stolen photos (reverse image search), pressure to move off-platform, missing documents.
- Sources: https://businesstoday.co.ke/jiji-kenya-marketplace-safety-features-attract-more-buyers-and-sellers/ ; https://techmagazine.co.ke/jiji-kenya-cars/ ; https://truxper.com/blog/how-to-spot-fake-car-dealer-jiji-cars45

## 5. AI-first newcomers

### AI buying agents
- **CarEdge** is the leader: AI Buying Agent at $49.99 flat per car search (beta pricing) negotiates out-the-door price with dealers via email/messages anonymously (dealers never see the buyer's contact), 9.3 average touches per negotiation, first OTD response averages 38.1h; 160K+ dealer outreach sessions analyzed (Jul 2025–Oct 2026). **Dealer Transparency Index** (Mar 2026): 40K+ verified OTD quotes grade 4,900 dealers A–F on pricing behavior — avg doc fee $417 (range $85 CA–$1,000 FL), avg dealer markup 7–8% over listing price, only 25% of dealers charge zero add-ons. Their own conclusion (Apr 2026): AI does research/drafting/price-checking; humans close; "AI plus a human negotiator" is the working model. CoPilot sells AI-assisted buying guidance.
- Sources: https://caredge.com/pricing ; https://caredge.com/reports/ai-negotiation-impact ; https://usinsider.com/caredge-launches-dealer-transparency-index.../ ; https://caredge.com/guides/can-ai-negotiate-a-car-deal-for-me

### Conversational valuation / WhatsApp bots
- Vendor wave (Tars, HumPum, visity, Swiftex, TradeBoost) all converge on: one-question-at-a-time conversational intake (year/make/model/mileage/condition/photos) → instant valuation range → lead capture/inspection booking, deployed on web + WhatsApp + ads landing pages. Pattern: replace 15-field forms with chat; completion rates are the claimed win (⚠️ mostly vendor claims).

### Photo-based condition estimation
- Ravin AI: mobile scan flow (on-phone neural net guides capture, filters best images, real-time pre-assessment; cloud AI grades condition, anonymizes plates/faces, estimates repairs, anti-fraud); trained on 600M+ vehicle images; insurer/remarketing B2B. ProovStation: drive-through 360° scan in 3 seconds, 300 images, report in 45s–90s, claimed 95% damage-detection accuracy (⚠️ vendor claim), defectometry with projected light lines to defeat glare. Click-Ins: damage identify/classify/measure + before/after report comparison. All B2B-expensive, but the mobile-capture UX (guided photo capture + VLM analysis) is now cheap to approximate with off-the-shelf vision models.
- Sources: https://www.ravin.ai/tools ; https://blogs.nvidia.com/blog/proovstation-gpu-ai-appraisals/ ; https://www.click-ins.com/features

### Plate/VIN-scan valuation & history
- Table stakes in the US now: KBB, Edmunds, Amazon Autos all take plate or VIN entry. Carfax History-Based Value adjusts value for accidents, owners, service history, usage type (personal/fleet/rental). Dealer scanners (Carbly, Laser Appraiser) combine VIN OCR → appraisal + history in one scan. intice Express Cash Offer: plate + mileage → firm offer in 2 minutes using AI trim matching against Black Book + ChromeData, with a transparent condition-adjustment range. Motormila's Android plate scan is already at parity on input; the gap is what comes out (history-adjusted value + firm offer).
- Sources: https://www.carfax.com/value/ ; https://getcarbly.com/vin-scanner/ ; https://www.intice.com/express-cash-offer.html

### Instant cash offers
- Consistent design: firm, non-negotiable, time-boxed (7 days at CarMax/Edmunds/EchoPark), adjust only on verified condition mismatch, price the certainty premium. CarMax Offer Watch turns the offer into an ongoing free value tracker (retention loop).

### Market indices
- AutoTrader RPI + ONS partnership = the gold standard in "index as PR + B2B product". Manheim MUVVI publishes methodology (outlier removal at 2.6σ, linear-regression mileage adjustment, X-13ARIMA-SEATS seasonal adjustment, 24-month rolling market-class weights) — publishing methodology is itself a trust product. JD Power ALG residual awards (3-year value retention) are a marketing franchise built on forecast data.
- Sources: https://site.manheim.com/wp-content/uploads/sites/2/2024/02/Used-Vehicle-Summary-Methodology.pdf ; https://plc.autotrader.co.uk/news-views/press-releases/auto-trader-data-strengthens-the-uks-inlfation-statistics/

## 6. Prioritized adoption list for Motormila

### Tier 1 — ship with data you already have (listing prices, 3×/day snapshots, dedup, cross-site coverage)
1. **Deal-rating badge on every listing** (CarGurus/AT Price Indicator pattern): FMV percentile → Great/Good/Fair/High/Overpriced, with the exact LKR and % variance shown ("LKR 450K below market"). Suppress the badge where comps are thin (< N comparable listings) — AutoTrader's eligibility rules are a good template. Highest-impact single feature; pure computation over existing data.
2. **Price-history timeline + days-on-market + relist detection**: you already scrape 3×/day — persist per-listing price snapshots and render a Zillow-style event timeline ("Listed LKR 8.9M → cut to 8.4M on Sep 12"), True DOM across delist/relist (your dedup gives you this for free where others can't do it), and "3 price drops" motivation signals. This is the feature buyers use to negotiate and share.
3. **Fair Market Range instead of a single FMV number** (KBB Price Advisor zones): show the range with below/within/above bands; ranges convert skepticism into trust and are the substrate for the badge.
4. **Transaction-type value bands**: private-party vs dealer-retail vs quick-sale value (KBB/Edmunds three-band + Droom's buy/sell + private/dealer purpose adjustment). Your Pro dealer listings vs private listings already separate these populations.
5. **Alerts 2.0**: price-drop alerts that show "Was LKR 8.9M → Now 8.4M (−5.6%)" plus days-on-market context and a one-tap contact link; saved-search alerts with immediate/daily/weekly cadence; "back on market" alerts from your dedup identity graph. Price-drop alerts historically out-convert new-listing alerts (⚠️ vendor claim ~30%).

### Tier 2 — small new effort, big differentiation
6. **Condition rubric + self-serve condition tiers** (Edmunds 5-tier / OBV 15-factor lite): seller or buyer picks condition tiers in the FMV calculator; apply published adjustment coefficients (start with OBV-style fixed percentages, calibrate later against listings that persist vs sell).
7. **WhatsApp valuation bot**: "send plate/model + 3 photos → FMV range + 3 comparable listings + price-drop subscription." India proves the channel; Sri Lanka's WhatsApp penetration mirrors it. Thin LLM wrapper over your existing FMV API; the funnel feeds alerts and Pro leads.
8. **Listing trust signals**: stock-photo/reused-photo detection (reverse-image hash), price-too-good-to-be-true flag (>30% below comps = "bait" pattern), seller cross-listing behavior from dedup, seller response rate. Motormila is the only party that sees the same car across 13 sites — that's a scam-detection moat nobody else in Sri Lanka has.
9. **Conversational car finder + "questions to ask"** (Carousell AI Car Finder, Meta's suggested questions): natural-language search over your 275K listings, and per-listing AI-generated questions ("Ask the seller: has the timing belt been changed? market price for this year is LKR X"). Cheap VLM/LLM features that look like 2026 product.
10. **Negotiation share cards**: upgrade the existing FMV share card into a negotiation evidence card — comps table, price-history timeline, badge — designed for WhatsApp forwarding (the real distribution channel).

### Tier 3 — new data or partnerships required
11. **Light inspection program** (Spinny 200-point → start with a 50–100 point garage-partner checklist; guided phone photo capture Ravin-style): feeds condition-adjusted pricing and Trust Tags ("Inspected", "1-owner", "No repair history") like CarDekho's Trust Tags and Japan's condition certificates.
12. **History/registry pricing** (Carfax History-Based Value pattern): accident, ownership count, import vs local — needs RMV/insurance/body-shop data or partnerships; long-term differentiator and the input that makes "history-based pricing" real.
13. **Dealer acquisition tool** (CarGurus IMV Scan replica): plate scan → FMV + "price here to rate as Great Deal" bands + expected days-to-sell for the Pro dashboard and vehicle lanes; the natural Pro upsell from arbitrage detection.
14. **Index as a public product** (AutoTrader RPI/Manheim pattern): publish the Motormila Market Index monthly with a methodology note (outlier rules, mileage adjustment); pitch to press and use for the EV/hybrid hub and "Official Pulse" tie-ins. You already compute it — the packaging is the gap.
15. **Finance/insurance lead attach** (CarDekho group model): EMI calculators with live partner rates, pre-approval handoffs; the monetization layer that saved the Indian players' margins without holding inventory. Deliberately avoid C2B/consignment (Cazoo, OLX Autos died there).
16. **Dealer "next-band" nudges + sell-probability** (mobile.de Inserats-Analyse): in the Pro dashboard, show each dealer listing's current badge, the exact LKR adjustment to reach the next band, and a 60-day sell-probability — the highest-value dealer SaaS upsell from data you already compute.
17. **Timestamped seller photo capture + no-renegotiation policy** (Motorway Image Assist): if Motormila ever brokers seller-dealer contact, require live-captured photos and make dealers substantiate any price reduction with photos; pure policy/UX, near-zero cost, kills the biggest C2C pain.
18. **Valuation certificate + tiered history-check packaging** (What Car?, HPI/MyCarCheck): email a shareable FMV certificate (condition tiers) as the free layer; price history/finance-status unlocks later when registry partnerships exist.

### Monetization sequencing (from the benchmarks)
- Free consumer layer = badges, ranges, timelines, alerts (this is the traffic + trust engine, exactly CarGurus' logic: "best deals first, not who pays us").
- Pro tier: dealer subscriptions tiered by volume (Carwow's per-car pricing is the emerging-market-friendly variant), IMV-Scan-style acquisition tools, Market 360 analytics (CarDekho DealerCentral), value-scaled fees (AutoScout24 Car Value Factor) once dealer inventory quality data exists.
- Attach: finance/insurance leads + premium consumer alerts; keep every asset off the balance sheet.

### Data-need mapping
| Feature | Data you already have | New data needed |
|---|---|---|
| Deal badge, FMV range, market comparison | listings, dedup, price history | — (min-comps threshold only) |
| Price-drop timeline, DOM, relist detection | 3×/day snapshots (persist per listing) | — |
| Private vs dealer value bands | listing source + seller type | dealer identity quality |
| Condition adjustment | listing text/photos (LLM extraction) | calibration against outcomes |
| Trust/scam signals | cross-site dedup, photo hashes | seller reputation data |
| WhatsApp/conversational valuation | FMV API, comps | — (channel work only) |
| Inspection/Trust Tags | — | garage network, checklist |
| History-based pricing | — | registry/insurance/import records |
| Dealer pricing tool | FMV + deal bands + lanes | dealer inventory feeds (Pro opt-in) |
| Finance attach | listing + FMV | lender/insurer partners |

## 7. Flagged unverified claims
- CarGurus "80% of shoppers won't buy without IMV" — vendor marketing.
- CarDekho/CarWale "90%+ valuation accuracy" — vendor claim, no published methodology.
- Motorway ">50% exceed guide price", ProovStation "95% accuracy", Ravin "market-leading" — vendor claims.
- CarSnipe "~30% of purchases from price-drop alerts", "36% faster sale after a price cut (Edmunds data)", "22.6% of listings reprice" — secondary blog sources; verify before citing publicly.
- Money4Vehicle "90% manual effort reduction" — vendor case study.
- Cars24 "fecto" model internals (2026 blog) — details not independently verifiable.
