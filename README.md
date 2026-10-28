<div align="center">

<a href="https://motormila.vercel.app">
  <img src="public/brand-lockup.png" alt="Motormila" width="560" />
</a>

<br />

**The fair mila for every motor.**

Sri Lanka's vehicle market, decoded — prices, trends, and fair values,
in one clear place.

<br /><br />

<a href="https://motormila.vercel.app"><strong>Open Motormila →</strong></a>
&nbsp;&nbsp;·&nbsp;&nbsp;
<a href="#what-it-does">What it does</a>
&nbsp;&nbsp;·&nbsp;&nbsp;
<a href="#brand">Brand</a>
&nbsp;&nbsp;·&nbsp;&nbsp;
<a href="#run-it-locally">Run it locally</a>

<br /><br />

<a href="https://github.com/SuvenSeo/MotorMila/actions/workflows/ci.yml"><img src="https://github.com/SuvenSeo/MotorMila/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
<img src="https://img.shields.io/badge/React_18-09090B?style=flat-square&logo=react&logoColor=0A7AFF" alt="React 18" />
<img src="https://img.shields.io/badge/FastAPI-09090B?style=flat-square&logo=fastapi&logoColor=0A7AFF" alt="FastAPI" />
<img src="https://img.shields.io/badge/Android-09090B?style=flat-square&logo=android&logoColor=0A7AFF" alt="Android" />
<img src="https://img.shields.io/badge/Made_for-Sri_Lanka-0A7AFF?style=flat-square" alt="Made for Sri Lanka" />

</div>

<br />

<div align="center">

<a href="https://motormila.vercel.app">
  <img src="public/og-card.jpg" alt="Motormila — Sri Lanka vehicle market intelligence" width="880" />
</a>

</div>

---

## What it does

A listing tells you what someone wants. Motormila tells you what the
market says — so you can answer one question with confidence:

> **Is this vehicle actually worth the asking price?**

<table>
<tr>
<td width="33%" valign="top">

### See

Search listings, explore make-and-model hubs, and
compare options side by side — then jump to the
original marketplace listing.

</td>
<td width="33%" valign="top">

### Price

Comparable asking prices, fair-market-value
estimates, deal scores, and outliers. Every
number shows its work.

</td>
<td width="33%" valign="top">

### Track

Price history, district patterns, trends, and
alerts for vehicles worth watching. The evidence,
in order, before you decide.

</td>
</tr>
</table>

<details>
<summary>Everything inside</summary>

<br />

| | |
|:--|:--|
| **Market overview** | Aggregates, trends, price signals, and activity |
| **Make & model hubs** | Model listings, asking-price distributions, research views |
| **Fair Market Value** | Comparable-listing-based valuation estimates |
| **Deal intelligence** | Scores, potential underpricing, curated picks |
| **History & alerts** | Price movements, watched-listing notifications |
| **Geography** | District prices, distribution, velocity |
| **Deep research** | Comparison, listing history, EV / hybrid, price index |
| **Pro / dealer** | Deeper research tools, subject to plan and access |
| **Android** | Native companion, Jetpack Compose |

Availability may vary by feature, plan, and source freshness.

</details>

---

## How it works

**Collect → Clean → Connect → Understand → Explore**

~~~mermaid
flowchart LR
    A["Marketplaces"] --> B["Collectors"]
    B --> C["Normalize · Dedupe"]
    C --> D["Analysis"]
    D --> E["Web · Android"]
~~~

Sources include ikman, Riyasewana, Auto Lanka, HitAd, AutoDirect,
SaleMe, RiyaHub, Cartivate, and others. A configured source is not a
guarantee of fresh data — coverage, reliability, and anti-bot
protections differ by source, and freshness depends on successful
scheduled runs.

**Built on discipline:** traceable sources, normalized comparisons,
price history instead of timeless ads, isolated collectors so one
blocked source stops nothing else, and snapshot delivery for public
aggregates. Above all: an advertised price is not a confirmed sale
price, and Motormila never pretends otherwise.

---

## Brand

One mark. One palette. One typeface. Full rules in
[MOTORMILA-BRAND.md](MOTORMILA-BRAND.md).

<div align="center">

<img src="public/brand-sheet.png" alt="Motormila brand sheet" width="640" />

</div>

| | | |
|:--|:--|:--|
| **Apex M** | The mark | A bold blue M whose final stroke rises into an arrow — *the market, moving the buyer's way.* No badges, no clip-art, no recoloring. |
| **Ink** `#09090B` | Ground | Dark-first. |
| **Blue** `#0A7AFF` | Mark & actions | Never recolor the mark. |
| **Paper** `#FFFFFF` | Light surfaces | With the white-bg mark only. |
| **Deal Green** `#00C853` | Underpriced signals | Never in the logo. |
| **Cal Sans** | Typeface | Display for headlines, Cal Sans Text for body and prices. |

---

## Stack

| | |
|:--|:--|
| **Web** | React 18 · TypeScript · Vite · Tailwind · TanStack Query · Recharts · Leaflet |
| **API** | FastAPI · Python · SQLAlchemy |
| **Collection** | Python · Playwright · source-specific scrapers |
| **Data** | SQLite · versioned dumps · JSON snapshots |
| **Android** | Kotlin · Jetpack Compose · Hilt · Paging 3 · CameraX · WorkManager |
| **Delivery** | GitHub Actions · Vercel · Hugging Face Spaces · Cloudflare |

---

## Run it locally

**Requirements:** Node 20+, Python 3.12, JDK 17 + Android SDK (for Android).

~~~bash
# 1 — API
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
~~~

Local dev only — create a gitignored `backend/.env` with:

~~~dotenv
ALLOW_SQLITE_FALLBACK=true
PRO_ACCESS_ENFORCED=false
APP_ACCESS_ENFORCED=false
~~~

Do not deploy those settings. The local database starts empty.

~~~bash
# 2 — Web (second terminal, repo root)
npm ci
npm run dev
# → http://localhost:8080

# 3 — Android (optional)
cd android && ./gradlew :app:assembleDebug

# 4 — Checks
npm run typecheck && npm run lint && npm test && npm run build
~~~

<details>
<summary>Repository map</summary>

~~~text
MotorMila/
├── src/                 React web app
├── public/              Brand assets, metadata, snapshots
├── backend/             FastAPI, scraping, valuation, data
├── android/             Native Android companion
├── api/                 API helpers
├── scripts/             Export, maintenance, deployment
├── .github/workflows/   CI, scraping, monitoring, releases
└── docs/                Engineering notes, operations, plans
~~~

</details>

<details>
<summary>Docs & operations</summary>

- [Brand system](MOTORMILA-BRAND.md) · [Android data contract](android/DATA_CONTRACT.md) · [Android domain contract](android/DOMAIN_CONTRACT.md)
- [Scraping operations](docs/manus-scraping.md) · [Snapshot delivery](docs/public-snapshots-r2.md) · [Recovery](docs/disaster-recovery-plan.md) · [Roadmap](docs/platform-improvement-roadmap.md)
- Workflows: [CI](.github/workflows/ci.yml) · [Scraping](.github/workflows/manus-scrape-every-2h.yml) · [Merge to live](.github/workflows/manus-to-live.yml) · [Backend deploy](.github/workflows/deploy-hf-backend.yml)

</details>

---

## Fine print

Motormila analyzes vehicle advertisements. **An advertised price is not
a verified transaction price**, and a fair-value estimate is not an
inspection, appraisal, or guarantee. Listings can be stale, duplicated,
or wrong. Verify the vehicle, seller, documents, and condition
independently before buying.

Motormila is not affiliated with ikman, Riyasewana, patpat, or any
marketplace it analyzes. Marketplace names appear only to identify
where a listing originated.

| | |
|:--|:--|
| **Live** | [motormila.vercel.app](https://motormila.vercel.app) · [motormila.pages.dev](https://motormila.pages.dev) |
| **Email** | [hello@ardenostudio.com](mailto:hello@ardenostudio.com) |
| **Feedback** | [GitHub issues](https://github.com/SuvenSeo/MotorMila/issues) |

Copyright © 2026 Ardeno Studio. All rights reserved. No licence is
granted by this repository — see [LICENSE](LICENSE) and
[NOTICE](NOTICE). Third-party libraries remain under their own
licences. Motormila has no motormila.lk domain, no public phone
number, and no social or store listings claimed here.

<br />

<div align="center">

<img src="public/logo-mark.png" alt="Motormila Apex M" width="72" />

**Less noise. More context. Better decisions.**

[Enter Motormila →](https://motormila.vercel.app)

</div>
