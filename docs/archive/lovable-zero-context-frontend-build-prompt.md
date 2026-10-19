# AutoLens LK Zero-Context Frontend Build Prompt

Use this prompt when the builder has no repo access, no previous chat context, and no uploaded files.

````md
You are a senior product designer, frontend architect, and React engineer. Build the complete frontend for AutoLens LK from scratch.

This is a zero-context build. Assume you know nothing except this prompt. Do not ask for extra context. Do not create a different product. Do not make a generic car marketplace, dealership website, landing page, or SaaS template. Build exactly the AutoLens LK frontend described here.

## Product Identity

Product name: AutoLens LK
Studio: Ardeno Studio
Market: Sri Lanka
Category: vehicle price intelligence, listings intelligence, valuation, market analytics, dealer tools, and Pro reports

Core promise:
"Know the real vehicle price before you call."

AutoLens LK helps Sri Lankan buyers, dealers, importers, lenders, analysts, and car enthusiasts understand whether a listed vehicle price is fair before they call a seller, negotiate, lease, import, or list a vehicle.

The platform combines:
- Public vehicle listings
- LKR asking prices
- Deal score and fair-price context
- District pricing and supply signals
- Seller trust and source transparency
- Watchlist, compare, and alert workflows
- Price trends
- Vehicle valuation
- Finance, tax, and lease planning
- EV buying guidance
- Dealer operations view
- Paid Pro analytics and exportable reports
- AI chat assistant tied to vehicle-market context

## Build Goal

Build a full high-end frontend application that looks production-grade and complete even before the real backend is connected.

Important:
- Build frontend only.
- Use mock/demo data only as a frontend preview layer.
- Design the API layer so Codex can later wire it to the existing backend.
- Do not create a backend, database, scraper, admin system, or fake production auth service.
- Do not claim live production data unless the backend is actually connected.
- When using mock data, label it as "Demo market data" or "Preview data until connected."

The generated frontend must feel like a premium Sri Lankan automotive market terminal, not a template.

## Tech Stack

Use:
- React 18
- Vite
- TypeScript
- React Router
- TanStack React Query
- Tailwind CSS
- Shadcn/Radix-style primitives
- lucide-react icons
- Recharts for charts
- Leaflet or a visual map substitute for district map if Leaflet setup is difficult

Use local frontend state where appropriate:
- localStorage for watchlist
- localStorage for market alerts
- localStorage for auth demo session
- sessionStorage for entry loader gate

Do not add heavy animation libraries. Use CSS, Tailwind, and lightweight transitions.

## Visual Direction

Default aesthetic:
- Premium dark automotive intelligence cockpit
- Near-black/slate base
- Restrained amber/gold brand signal
- Cyan for freshness/data
- Green for good deals/positive signal
- Rose/red for overpriced/risk
- Clean, dense, professional information design

Color direction:
- Background: `#050607`, `#080a09`, `#0b0e0d`
- Surfaces: `#101312`, `rgba(255,255,255,0.035)`, translucent black panels
- Borders: `rgba(255,255,255,0.08)` and amber accents only for emphasis
- Brand accent: `#e0aa48`, `#f1c66d`
- Signal cyan: `#4bb7d8`
- Signal green: `#43a96b`
- Signal red: `#df5f5f`

Typography:
- If installable, use Archivo or a similar condensed, strong display font for headings.
- Use Geist, Inter, or a clean sans for body.
- Use a monospaced font for numbers, LKR labels, sync status, and technical chips.
- Use tabular numbers.
- Letter spacing should be 0 for normal text. Use only small uppercase labels with restrained tracking.

Design quality:
- The first screen must feel memorable and useful to Sri Lankan users.
- Avoid purple/blue SaaS gradients.
- Avoid cartoon cars, fake 3D cars, and random luxury stock imagery.
- Avoid giant rounded cards everywhere.
- Use 8-12px radii for most surfaces.
- No text overlap at 375px mobile.
- No horizontal overflow.
- Charts and maps must have stable heights.
- Vehicle images must use fixed aspect-ratio containers and `object-cover`.

Conceptual feel:
- Bloomberg terminal clarity
- Porsche-level restraint
- Linear/Stripe-quality UI finish
- Automotive inspection cockpit
- Dealer/investor command center
- Local Sri Lankan market relevance

## Sri Lankan Market Positioning

Make the platform feel locally relevant.

Use examples:
- Toyota Aqua
- Honda Vezel
- Suzuki Wagon R
- Nissan Leaf
- Toyota Axio
- Toyota Premio
- Toyota Hilux
- Land Cruiser
- BMW
- Mercedes-Benz

Use districts:
- Colombo
- Gampaha
- Kandy
- Kurunegala
- Galle
- Matara
- Jaffna
- Anuradhapura
- Ratnapura
- Batticaloa

Use sources as source-transparency labels:
- Ikman
- Riyasewana
- AutoLanka
- Patpat
- Carshop
- SaleMe
- Cars at DIMO

Never say "all cars in Sri Lanka" unless backend proof exists. Prefer:
- tracked public listings
- indexed listings
- available source coverage
- current market sample
- Sri Lanka vehicle-market signal

## Required Routes

Implement every route below.

1. `/`
   Dashboard and public marketplace cockpit.

2. `/listing/:id`
   Vehicle listing detail and inspection report.

3. `/trends`
   Price movement chart studio.

4. `/estimate`
   Valuation workbench.

5. `/calculator`
   Finance, lease, and tax planning desk.

6. `/ev-hub`
   Electric vehicle decision lane.

7. `/best-picks`
   Curated high deal-score inventory.

8. `/map`
   District intelligence map.

9. `/dealer`
   Dealer operations cockpit.

10. `/blogs`
    Market intelligence journal.

11. `/settings`
    Language and theme preferences.

12. `/sign-in`
    Standalone sign-in page.

13. `/pro-preview`
    Locked paid product teaser.

14. `/pro`
    Protected Pro dashboard.

15. `*`
    404 recovery page.

## Global App Shell

Public app routes must have:
- Entry loader gate before the main app shell. Use session key `autolens.has_entered`.
- Fixed floating navbar.
- Footer.
- Settings floating button.
- Feedback widget.
- Toasts.
- Error boundary.
- AI chat widget.

Navbar layout:
- Left: logo mark, AutoLens LK, "By Ardeno Studio".
- Center desktop links: Overview, Market, Trends, Valuation, Calculator, Blog.
- Add a compact More menu for EV Hub, Best Picks, Map, Dealer, Settings, Pro Preview, Pro.
- Right: live sync chip, Sign In or user state, Pro CTA, optional repo link.
- Mobile: logo, live dot, menu button. Menu opens as command panel.

Floating controls:
- Settings, feedback, and AI chat must not cover important mobile CTAs.
- On mobile, cluster them compactly at lower right with safe spacing.
- AI chat must be dismissible.

Footer:
- Brand summary.
- Explore links.
- Tools links.
- Pro links.
- Studio links.
- Source/operations status.

## Dashboard Route `/`

The dashboard is the main product surface.

Top-to-bottom placement:

1. Hero command cockpit
- Local market badge: "Sri Lanka vehicle market console"
- H1: "AutoLens LK"
- Headline line: "Know the real vehicle price before you call."
- Supporting copy: "Search Sri Lanka listings, read deal scores, compare LKR price bands, and check district trends before you contact a seller."
- Primary search command bar with placeholder: "Search Toyota Aqua, Honda Vezel, Wagon R..."
- Scan button: "Scan market"
- Live suggestions dropdown with vehicle, year, district, price, source, thumbnail.
- Quick scan chips: Toyota Aqua, Honda Vezel, Suzuki Wagon R, Nissan Leaf, Toyota Axio, BMW, Mercedes-Benz.
- Trust metrics: priced listings, districts indexed, source feeds watched, latest sync.
- Right desktop panel: live vehicle index board with average index price, MoM change, priced depth, district grid, active sources, best signal, new listings today.
- Mobile: one column with search and 2-3 metrics visible before lower sections.

2. Market concentration
- District map/heatmap area.
- Summary console with supply center, premium pressure, mapped inventory.
- If no data: polished state explaining "District data is waiting for the backend" with actions to browse inventory and trends.

3. Price history analytics
- Controls: make, model, condition, district.
- Selected filter chips.
- Chart workspace with loading, empty, and coverage states.
- Buy timing signal panel.

4. Quick valuation / predictor area
- Small valuation card: make, model, year, mileage, district.
- Result preview with low, median, high, confidence.
- Market predictor panel with clear status.

5. Live inventory
- Section title: "Live inventory"
- Mode: priced inventory vs missing-price review.
- Header metrics: total, saved, alerts.
- Grid/list toggle.
- Desktop: left sticky filter command rail.
- Mobile/tablet: filter drawer/sheet.
- Active filter chips above results.
- Listing skeletons.
- Empty state.
- Pagination.

Inventory filters:
- Keyword
- Source
- Make
- Model depends on make
- Condition
- Body type
- Year min/max
- Price min/max
- Price presets
- Mileage max
- Fuel type
- Transmission
- District
- Sort: newest, best deal, price low, price high, mileage low
- Fast picks: Toyota, Suzuki, Honda, Nissan, Aqua, Wagon R, Vezel, Axio, Premio
- Price availability: priced or missing price

Listing cards:
- Stable `aspect-[16/10]` image
- Condition badge
- Deal score badge
- Price or "Price unavailable"
- Title: year make model variant
- Metadata: mileage, fuel, transmission, engine, body
- District and source
- Seller type
- Market position bar
- Watchlist button
- Compare button
- Open details action

Compare workflow:
- Select up to 3 listings.
- Floating compare tray only appears when selected.
- Compare modal with specs, price, deal score, district, seller, source.

Market alerts:
- Save current filters.
- Optional target price.
- List saved alerts.
- Open alert filters.
- Delete alert.

Pipeline/source status:
- Show source freshness and recent run state.
- If backend unavailable, show "Preview mode" instead of pretending live status.

## Listing Detail Route `/listing/:id`

Make this feel like an inspection report.

Placement:
- Back to market action.
- Media column with large image and thumbnails if available.
- Vehicle identity: year, make, model, variant.
- Price panel: price, deal label, deal score, market median, price position.
- Seller trust sidebar: seller type, seller name, listing count, rating/reviews if present, verified badges, phone/WhatsApp preview labels, source link.
- Specs bento: year, mileage, transmission, fuel, condition, body, engine, district, city.
- Listing age: first seen, scraped/tracked days.
- Description.
- Similar listings / market peers.
- Source transparency: external source link, source name, last seen.

Missing values must look intentional, not broken.

## Trends Route `/trends`

Make this a chart studio.

Placement:
- Hero: "Price movement intelligence for every market lane."
- Metrics: tracked makes, selected model, districts.
- Control command row: make, model, condition, district.
- Selected chips.
- Main chart panel.
- Coverage note and fallback state.
- Empty state: "Select a make and model to load live history."
- Recovery action: clear filters or open dashboard market.

## Estimate Route `/estimate`

Make this a valuation workbench.

Placement:
- Hero: "High-fidelity market valuation for Sri Lankan vehicles."
- Desktop two columns:
  - Left: vehicle profile inputs.
  - Right: valuation output.
- Mobile: inputs first, output after.

Inputs:
- make
- model
- year
- condition
- transmission
- fuel type
- mileage km
- district
- optional asking price

Output:
- estimated low, median, high in LKR
- confidence
- comparable count
- mileage adjustment
- methodology
- projected 1-year and 3-year direction if trend data exists
- comparable listings

## Calculator Route `/calculator`

Make this a finance planning desk.

Placement:
- Hero: "Lease, duty, and tax planning without spreadsheet clutter."
- Baseline assumptions: vehicle value/CIF, engine capacity.
- Lease calculator: down payment, interest rate, term, principal, monthly payment.
- Tax breakdown: duty/tax estimate, reserve, sensitivity.
- Planning tiles: monthly buffer, duty risk, financing readiness.

Calculations can be local frontend calculations.

## EV Hub Route `/ev-hub`

Make this a specialized EV decision lane.

Sections:
- Hero: "Electric vehicle decisions need a different signal stack."
- Battery health module.
- Duty/policy context module.
- Charging readiness module.
- Readiness matrix by operating pattern.
- Browse EV inventory action linking to `/?fuel_type=electric#market`.
- Ownership checklist.

## Best Picks Route `/best-picks`

Make this a curated deal lane.

Rules:
- Only show listings with valid price and deal score >= 8 in demo logic.
- Metrics: qualified picks, minimum score, pages scanned.
- Ranked cards with rationale.
- If empty: "No high-confidence picks yet" with open inventory action.
- If API error: polished unavailable state.

## Blogs Route `/blogs`

Make this a market intelligence journal, not a marketing blog.

Sections:
- Hero: "Market intelligence for faster vehicle decisions."
- Search.
- Category filters: All, Market Intel, Buying Guides, Data Stories, Platform Updates.
- Featured article.
- Article list.
- Topic chips.
- Interactive buyer playbook with mode, risk tolerance, and timeline.
- Live research stack CTA.

Use article examples about:
- Hybrid SUVs in Colombo
- Deal score validation
- District demand heat
- EV buyer checklist
- Finance and tax planning

## Map Route `/map`

Make this a district intelligence room.

Placement:
- Hero: "District pricing, supply density, and local market gravity."
- Full-width map workspace.
- Summary console: supply center, premium pressure, mapped inventory.
- District cards/table below.
- If map data is missing: show a polished state with recovery actions.

Map must have stable height:
- mobile min-height 360px
- desktop min-height 560px

## Dealer Route `/dealer`

Make this a dealer operations cockpit.

Sections:
- Hero: "Dealer command center for live demand and margin signals."
- Metrics: live lead queue, arbitrage alerts, finance-ready leads, trust tier.
- Command stack aside.
- Rotating lead notification.
- Collapsible analytics modules:
  - Inventory Turnover chart
  - Price Gaps vs Competitors chart
  - District Demand Heatmap cards

## Settings Route `/settings`

Simple and calm.

Sections:
- Hero: "Personalize AutoLens."
- Language cards: English, Sinhala, Tamil.
- Theme cards: System, Dark, Light.
- Active theme display.
- Back to dashboard action.

Implement preferences in localStorage.

## Sign-In Route `/sign-in`

Standalone page, outside public app shell.

Placement:
- Left: sign-in card.
- Right desktop: Pro Intelligence value pitch.
- Mobile: form first, pitch below.

Features:
- Email/password form.
- Show/hide password.
- Validation.
- Loading and error states.
- Preview Pro workspace button.
- Browse public data link.
- Review/demo credentials clearly labeled.

Demo accounts:
- `owner@example.com` / `<redacted - set via env>` -> enterprise active
- `free@example.com` / `<redacted - set via env>` -> free

Do not make these look like real production credentials. Label them as review access for frontend preview.

## Pro Preview Route `/pro-preview`

Locked paid teaser.

Sections:
- Hero: "See what paid AutoLens intelligence unlocks."
- Preview metrics: market depth, source mix, hot deals.
- Locked lane drill-downs table.
- Locked source/area chart.
- What Pro adds.
- Locked report formats: PDF, Word, CSV, JSON, Print.
- Sign in action.
- Browse public data action.

Lock state should feel high-trust, not annoying.

## Pro Route `/pro`

Protected route. If not authenticated with pro/enterprise access, redirect to `/sign-in`.

Make this the highest-value paid terminal.

Top bar:
- AutoLens LK Pro workspace
- Refresh
- Plan pill
- Sign out

Hero:
- "Pro dashboard for every vehicle market decision."
- Freshness panel
- Export buttons: PDF, Word, CSV, JSON, Print

Command cards:
- Command / hot deals
- Vehicles / lanes in focus
- Areas / district profiles
- Sources / live sources
- Reports / export formats

Tabs:
- Overview
- Vehicles
- Areas
- Trends
- Sources
- Reports

Overview:
- Priced listings
- Median price
- New 7 days
- Hot deals
- Top opportunities
- Source mix chart

Vehicles:
- Search lanes
- District filter
- Source filter
- Focus filter: all, hot deal lanes, broad coverage, fresh supply
- Table: vehicle, listings, median, range, average deal, districts, source
- Detail dialog for vehicle lane

Areas:
- District profile cards
- Listing count, median, source count, top make/model
- Detail dialog

Trends:
- Select vehicle lane
- Price chart
- Export detail report

Sources:
- Source coverage cards
- Count, share, average price, latest seen
- Detail dialog

Reports:
- Two-pane report composer.
- Left: scope/details.
- Right: sections/preview.
- Scope: market, vehicle, district, source, lanes table, districts table.
- Target selector.
- Format: PDF, Word/DOCX, CSV, JSON, Print.
- Theme: executive dark, board light, dealer slate.
- Custom title.
- Prepared for.
- Subtitle.
- Analyst note.
- Section checkboxes: metrics, breakdowns, trends, listings, table, filters, disclaimer.
- Listing row limit.
- Preview chips.
- Download custom report.
- Quick packs: executive market pack, vehicle lane table, district opportunity pack.

Tables must be readable on mobile with horizontal scroll.

## 404 Route

Route unavailable page.

Recovery links:
- Inventory cockpit
- Price trends
- District map
- Valuation

## Required Shared Components

Create these components or equivalent:
- `Navbar`
- `AppFooter`
- `Loader`
- `SettingsFloatingIcon`
- `FeedbackWidget`
- `AIChatWidget`
- `PlatformPageHero`
- `ListingCard`
- `ListingCardSkeleton`
- `FilterCommandRail`
- `ComparisonModal`
- `MarketAlertsDialog`
- `PriceHistoryChart`
- `MarketMap`
- `DistrictHeatmap`
- `PipelineStatusBar`
- `DealScoreBadge`
- `PriceUnavailableBadge`
- `ProtectedRoute`
- `SignInPortalModal`
- `LeaseCalculator`
- `TaxBreakdown`
- `ProReportComposer`

## Data Types

Create TypeScript types matching this shape.

```ts
type Condition = "brand_new" | "reconditioned" | "used";
type Transmission = "automatic" | "manual" | "cvt" | "tiptronic";
type FuelType = "petrol" | "diesel" | "hybrid" | "electric" | "plugin_hybrid";
type BodyType = "sedan" | "suv" | "hatchback" | "van" | "truck" | "motorcycle" | "pickup" | "wagon" | "coupe" | "convertible";
type SortOption = "newest" | "deal_score" | "price_asc" | "price_desc" | "mileage_asc";
type PriceAvailability = "priced" | "unavailable";

interface CarListing {
  id: number;
  source: string;
  source_id: string;
  make: string;
  model: string;
  variant?: string;
  year: number;
  condition: Condition;
  mileage_km: number;
  transmission: Transmission;
  fuel_type: FuelType;
  engine_cc?: number;
  body_type: BodyType;
  color?: string;
  price_lkr: number | null;
  deal_score: number;
  market_median_lkr?: number;
  price_drop_pct?: number;
  district: string;
  province: string;
  city?: string;
  lat?: number;
  lng?: number;
  is_dealer: boolean;
  seller_name?: string;
  title: string;
  description?: string;
  url?: string;
  detail_url: string;
  external_url?: string;
  thumbnail_url?: string;
  images?: string[];
  scraped_at: string;
  first_seen_at: string;
}

interface FilterState {
  q?: string;
  source?: string;
  make?: string;
  model?: string;
  year_min?: number;
  year_max?: number;
  condition?: Condition;
  body_type?: BodyType;
  mileage_max?: number;
  price_min?: number;
  price_max?: number;
  transmission?: Transmission;
  fuel_type?: FuelType;
  district?: string;
  price_availability?: PriceAvailability;
  sort: SortOption;
  page: number;
}
```

Also create:
- `StatsOverview`
- `DistrictPrice`
- `PriceTrendPoint`
- `PriceTrendSeries`
- `PriceEstimate`
- `SellerTrustProfile`
- `DashboardInsights`
- `PipelineStatusResponse`
- `LiveMarketSnapshot`
- `ProMarketSnapshot`
- `ProVehicleLane`
- `ProDistrictProfile`
- `ProDetailPayload`
- `ProReportPayload`

## API Adapter

Create `src/services/api.ts` even if the frontend starts with mock data.

API base:
- `const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"`

All frontend data must go through named API functions. Each function should:
1. Try the real backend when `VITE_USE_MOCK_DATA !== "true"`.
2. Fall back to mock/demo data only if real backend is unavailable or mock mode is enabled.
3. Never silently label mock data as live data.

Implement these API functions:
- `getStats()`
- `getLiveMarketSnapshot()`
- `getLiveMarketStreamUrl()`
- `getListings(filters)`
- `getListing(id)`
- `getSellerTrustProfile(id)`
- `getSimilarListings(id)`
- `getDistrictPrices()`
- `getMakes()`
- `getModels(make)`
- `getListingSearchSuggestions(q, limit)`
- `getListingSources()`
- `estimatePrice(params)`
- `estimateCustomVehicle(params)`
- `getPriceTrendSeries(make, model, condition, district)`
- `getPriceTrends(make, model, condition, district)`
- `getPipelineStatus()`
- `getPipelineRuns(limit)`
- `triggerPipelineJob(job, adminKey)`
- `getDashboardInsights()`
- `getProMarketSnapshot()`
- `getProVehicleLanes(filters)`
- `getProDistricts()`
- `getProVehicleLaneDetail(params)`
- `getProDistrictDetail(district)`
- `getListingsForExport(filters, maxRows)`
- `getDistrictQuickInsight(district)`
- `sendFeedback(payload)`
- `sendChatMessage(messages, options)`

Backend endpoint paths to make wire-ready:
- `GET /stats/summary`
- `GET /stats/live`
- `GET /stats/live/stream`
- `GET /stats/insights`
- `GET /stats/district-prices`
- `GET /stats/trends`
- `GET /listings`
- `GET /listings/:id`
- `GET /listings/:id/seller-profile`
- `GET /listings/:id/similar`
- `GET /listings/makes`
- `GET /listings/models`
- `GET /listings/search-suggestions`
- `GET /listings/sources`
- `GET /listings/estimate`
- `POST /listings/custom-estimate`
- `GET /pipeline/status`
- `GET /pipeline/runs`
- `POST /pipeline/trigger`
- `GET /pro/market-snapshot`
- `GET /pro/vehicle-lanes`
- `GET /pro/districts`
- `GET /pro/vehicle-lane-detail`
- `GET /pro/district-detail`
- `POST /feedback`
- `POST /chat`
- Optional `POST /auth/login`

## Mock Data Requirements

Because this is a zero-context build, include rich mock data in `src/data/mockData.ts`.

Include:
- At least 24 listings.
- Mixed prices and some missing-price listings.
- Multiple makes/models.
- Multiple districts.
- Multiple sources.
- Deal scores from overpriced to great deal.
- Seller trust profiles.
- Similar listing logic.
- District price data.
- Trend data for several lanes.
- Pro market snapshot.
- Vehicle lanes.
- District profiles.
- Source coverage.
- Sample Pro report data.

Mock data must be believable for Sri Lanka but not claim to be live.

Example vehicle lanes:
- Toyota Aqua hybrid Colombo
- Honda Vezel hybrid Gampaha
- Suzuki Wagon R hybrid Kandy
- Nissan Leaf electric Colombo
- Toyota Axio petrol Kurunegala
- Toyota Premio petrol Colombo
- BMW 320d diesel Colombo
- Mercedes-Benz C-Class petrol Gampaha

## Auth Rules

Implement frontend demo auth:
- `owner@example.com` / `<redacted - set via env>` has enterprise access.
- `free@example.com` / `<redacted - set via env>` has free access.
- Store auth user in localStorage key `autolens.auth_user`.
- Protected `/pro` route requires pro or enterprise active access.
- Free users should see sign-in/pro-preview messaging, not the Pro dashboard.

If a real backend auth endpoint is later enabled, this can be replaced.

## Formatting Helpers

Implement:
- `formatPriceLkrMillions(value)` -> "Rs. 7.85M"
- `formatNumber(value)`
- `formatRelativeTime(iso)`
- `isReasonableListingPrice(value)` with valid LKR range around 100,000 to 500,000,000
- deal score label: Great Deal, Good Deal, Fair Price, High Price
- confidence labels

## Responsiveness

Must work at:
- 375px mobile
- 768px tablet
- 1024px laptop
- 1440px desktop

Rules:
- No horizontal overflow.
- Navbar must not overlap content.
- Mobile hero must not be buried under floating controls.
- Filter rail becomes drawer/sheet on mobile.
- Vehicle grid: 1 column mobile, 2 tablet, 3 desktop.
- Tables horizontally scroll on mobile.
- Pro report composer stacks cleanly on mobile.
- Map has stable height.
- Text must not overlap.

## Accessibility

Requirements:
- Semantic headings.
- Buttons are buttons.
- Links are links.
- Icon-only buttons have aria-labels.
- Visible focus states.
- High color contrast.
- Deal/risk state must not rely only on color.
- Loading, empty, error, selected, disabled, hover, active, and focus states exist.
- Forms have labels and errors.

## File Structure

Create a clean file structure similar to:

```txt
src/
  App.tsx
  main.tsx
  index.css
  types/
    car.ts
    pro.ts
  services/
    api.ts
  data/
    mockData.ts
  lib/
    formatting.ts
    authContext.tsx
    appPreferences.tsx
    watchlist.ts
    marketAlerts.ts
    proReports.ts
    utils.ts
  hooks/
    useLiveMarketSnapshot.ts
    usePipelineStatus.ts
    useMobile.ts
  components/
    Navbar.tsx
    AppFooter.tsx
    Loader.tsx
    PlatformPageHero.tsx
    ListingCard.tsx
    FilterCommandRail.tsx
    ComparisonModal.tsx
    MarketAlertsDialog.tsx
    PriceHistoryChart.tsx
    MarketMap.tsx
    FeedbackWidget.tsx
    AIChatWidget.tsx
    ProtectedRoute.tsx
    ...
  pages/
    Dashboard.tsx
    ListingDetail.tsx
    Trends.tsx
    Estimate.tsx
    Calculator.tsx
    EVHub.tsx
    BestPicks.tsx
    MapPage.tsx
    DealerDashboard.tsx
    Blogs.tsx
    Settings.tsx
    SignIn.tsx
    ProPreview.tsx
    ProDashboard.tsx
    NotFound.tsx
```

## Implementation Priorities

1. Build the complete app and route structure first.
2. Implement mock data and API adapter second.
3. Implement the premium visual system globally.
4. Build every page, not only homepage.
5. Add interactions: search, filters, watchlist, compare, alerts, sign-in, Pro tabs, report composer.
6. Verify responsive behavior.
7. Fix overflow, broken layouts, and console errors.

## Acceptance Criteria

The build is complete only if:
- Every listed route exists.
- Every route renders without runtime errors.
- Dashboard has hero search, filters, cards, watchlist, compare, alerts, trends, map, and pipeline status.
- Listing detail uses real route param and loads matching listing.
- Trends chart reacts to make/model.
- Estimate produces a valuation result.
- Calculator updates from inputs.
- EV Hub, Best Picks, Blogs, Map, Dealer, Settings are complete screens.
- Sign-in works with demo credentials.
- `/pro` is protected.
- Pro dashboard has all tabs and report composer.
- UI is high-end, clean, and specific to AutoLens LK.
- Mock/demo mode is clearly labeled when backend is not connected.
- No generic dealership landing page sections.
- No fake backend.
- No missing major workflow.
- No text overlap at 375px.
- No horizontal overflow.

## Final Output

When you finish, report:
- Files created
- Routes implemented
- Features implemented
- Mock/demo data behavior
- Backend wiring points
- Any limitations

Do not say it is complete if any route or major workflow is missing.
````
