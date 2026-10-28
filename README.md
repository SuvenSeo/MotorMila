<div align="center">

<a href="https://motormila.vercel.app">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-wordmark-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="public/logo-wordmark-light.svg" />
    <img src="public/logo-wordmark-light.svg" alt="MotorMila — Sri Lanka vehicle market intelligence" width="680" />
  </picture>
</a>

<br />

<strong>THE FAIR MILA FOR EVERY MOTOR.</strong>

<br /><br />

<h1>THE MARKET MOVES.<br />KNOW WHERE YOU STAND.</h1>

<strong>Sri Lanka's vehicle market, decoded.</strong><br />
From fragmented listings to a clearer picture of prices, trends, and opportunities.

<br />

<a href="https://motormila.vercel.app"><strong>▶&nbsp; EXPLORE THE PLATFORM</strong></a>
&nbsp;&nbsp;·&nbsp;&nbsp;
<a href="#the-trailer"><strong>THE TRAILER</strong></a>
&nbsp;&nbsp;·&nbsp;&nbsp;
<a href="#the-experience"><strong>THE EXPERIENCE</strong></a>
&nbsp;&nbsp;·&nbsp;&nbsp;
<a href="#built-for-the-real-market"><strong>HOW IT WORKS</strong></a>
&nbsp;&nbsp;·&nbsp;&nbsp;
<a href="#run-it-locally"><strong>BUILD WITH US</strong></a>
&nbsp;&nbsp;·&nbsp;&nbsp;
<a href="#contact"><strong>CONTACT</strong></a>

<br /><br />

<a href="https://github.com/SuvenSeo/MotorMila/actions/workflows/ci.yml"><img src="https://github.com/SuvenSeo/MotorMila/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
&nbsp;
<img src="https://img.shields.io/badge/React_18-09090B?style=flat-square&logo=react&logoColor=0A7AFF" alt="React 18" />
&nbsp;
<img src="https://img.shields.io/badge/FastAPI-09090B?style=flat-square&logo=fastapi&logoColor=0A7AFF" alt="FastAPI" />
&nbsp;
<img src="https://img.shields.io/badge/Android-09090B?style=flat-square&logo=android&logoColor=0A7AFF" alt="Native Android" />
&nbsp;
<img src="https://img.shields.io/badge/Made_for-Sri_Lanka-0A7AFF?style=flat-square" alt="Made for Sri Lanka" />

<br /><br />

<sub>ONE MARKET. THOUSANDS OF SIGNALS. A MORE INFORMED DECISION.</sub>

</div>

---

## The trailer

A sixty-second read, in three scenes. The rest of this page is the full film.

### Scene 1 — The question

> ### “Is this vehicle actually worth the asking price?”

A listing tells you what someone wants. It doesn't tell you what comparable vehicles are advertised for, how long an asking price has been changing, or whether the same vehicle appears somewhere else.

**MotorMila is built to close that information gap.**

### Scene 2 — The machine

It brings together vehicle advertisements from Sri Lankan marketplaces, normalizes the messy details, identifies potential duplicates, and turns the resulting data into research tools for buyers, sellers, and automotive professionals.

**Not another place to scroll through cars. A way to understand the market behind them.**

### Scene 3 — The decision

Compare. Check the history. See the district, the trend, and the outliers. Then verify the vehicle itself — because a price, however well researched, is never a substitute for looking at the car.

<br />

## The experience

<table>
<tr>
<td width="50%" valign="top">

<h3>01 / DISCOVER</h3>
<p><strong>See the market, not just the listing.</strong></p>
<p>Search and filter vehicle listings, explore make-and-model hubs, compare options, and jump to original marketplace listings.</p>

</td>
<td width="50%" valign="top">

<h3>02 / VALUE</h3>
<p><strong>Put a price in context.</strong></p>
<p>Explore comparable asking prices, fair-market-value estimates, deal scores, and potential outliers before making a decision.</p>

</td>
</tr>
<tr>
<td width="50%" valign="top">

<h3>03 / TRACK</h3>
<p><strong>Follow the movement.</strong></p>
<p>Investigate listing price history, price changes, market trends, district-level patterns, and alerts for vehicles worth watching.</p>

</td>
<td width="50%" valign="top">

<h3>04 / GO DEEPER</h3>
<p><strong>Intelligence beyond browsing.</strong></p>
<p>Research market indices, EV and hybrid segments, best picks, and deeper Pro/dealer workflows where access is enabled.</p>

</td>
</tr>
</table>

<details>
<summary><strong>Explore the full feature map</strong></summary>

<br />

| Experience | What it brings together |
|:--|:--|
| **Market overview** | Listing aggregates, trends, price signals, and market activity |
| **Make & model intelligence** | Model-specific listings, asking-price distributions, and research views |
| **Fair Market Value** | Comparable-listing-based valuation estimates |
| **Deal intelligence** | Listing scores, potential underpricing, and curated picks |
| **History & alerts** | Price movements and watched-listing notifications |
| **Geographic insights** | District-level prices, market distribution, and velocity indicators |
| **Deep research** | Comparison tools, listing history, EV and hybrid insights, price index |
| **Pro / dealer** | Deeper research and portfolio tools, subject to plan and access controls |
| **Native Android** | Jetpack Compose companion with mobile-specific navigation and capabilities |

Product access and data availability may vary by feature, plan, and the freshness of each source.

</details>

<br />

## Built for the real market

<div align="center">

<h3>Many marketplaces. One intelligence layer.</h3>

<em>Collect → Clean → Connect → Understand → Explore</em>

</div>

MotorMila's collection architecture is designed around multiple marketplace integrations with independent source handling, scheduled scraping, and analysis workflows. Configured sources include ikman, Riyasewana, Auto Lanka, HitAd, AutoDirect, SaleMe, RiyaHub, Cartivate, and others.

Sources differ in coverage, reliability, and anti-bot protections. A configured integration is not a guarantee that a source is currently returning fresh data.

~~~mermaid
flowchart TD
    A["Sri Lankan vehicle marketplaces"] --> B["Source collectors<br/>Python · Playwright"]
    B --> C["Normalization · validation<br/>duplicate detection"]
    C --> D["SQLite · versioned data dumps"]
    D --> E["Market analysis<br/>comparables · scoring · trends"]
    E --> F["Static JSON snapshots"]
    E --> G["FastAPI services"]
    F --> H["MotorMila Web<br/>React · TypeScript · Vite"]
    G --> H
    G --> I["MotorMila Android<br/>Kotlin · Jetpack Compose"]
~~~

### Designed around data discipline

| Principle | In practice |
|:--|:--|
| **Traceable sources** | Preserve the context of where a listing originated |
| **Cleaner comparisons** | Normalize fields and detect likely cross-posted listings |
| **Historical perspective** | Track changes instead of treating every advertisement as a timeless fact |
| **Resilient ingestion** | Isolate collectors so one blocked source does not stop the whole pipeline |
| **Efficient delivery** | Serve public market aggregates using exported snapshots where possible |
| **Honest interpretation** | Distinguish advertised asking prices from confirmed sale prices |

Collection runs on a scheduled workflow (see [.github/workflows/](.github/workflows/)). Actual freshness depends on successful execution and source availability.

<br />

## One product. Three surfaces.

<table>
<tr>
<td width="33%" valign="top">

<strong>WEB EXPERIENCE</strong>
<p>React 18, TypeScript, Vite, Tailwind CSS, data visualizations, maps, and responsive research views.</p>

<a href="https://motormila.vercel.app">Open the web app</a>

</td>
<td width="33%" valign="top">

<strong>INTELLIGENCE ENGINE</strong>
<p>FastAPI, SQLAlchemy, Python collectors, scheduled jobs, analytics, and snapshot exports.</p>

<a href="backend/">Explore backend</a>

</td>
<td width="33%" valign="top">

<strong>NATIVE ANDROID</strong>
<p>Kotlin, Jetpack Compose, Hilt, Paging 3, CameraX, WorkManager, and a mobile-first interface.</p>

<a href="android/">Explore Android</a>

</td>
</tr>
</table>

### The technology

| Layer | Core technologies |
|:--|:--|
| **Web** | React · TypeScript · Vite · Tailwind CSS · TanStack Query · Recharts · Leaflet |
| **API** | FastAPI · Python · SQLAlchemy |
| **Collection** | Python · Playwright · source-specific scrapers |
| **Data** | SQLite · versioned dumps · exported JSON snapshots · supporting cloud integrations |
| **Android** | Kotlin · Jetpack Compose · Hilt · Paging 3 · CameraX · WorkManager |
| **Delivery** | GitHub Actions · Vercel · Hugging Face Spaces · Cloudflare |
| **Quality** | ESLint · TypeScript · Vitest · pytest · Android unit tests |

<details>
<summary><strong>Repository map</strong></summary>

~~~text
MotorMila/
├── src/                 React web app: pages, design system, services
├── public/              Brand assets, metadata, and public snapshots
├── backend/             FastAPI, scraping, valuation, and data services
├── android/             Native Android companion
├── api/                 API integration helpers
├── scripts/             Data export, maintenance, deployment tooling
├── .github/workflows/   CI, scraping, monitoring, recovery, releases
└── docs/                Engineering notes, operations, product plans
~~~

</details>

<br />

## Run it locally

**Requirements:** Node.js 20+, Python 3.12, and (for Android) JDK 17 plus the Android SDK.

### 01 — Start the API

~~~bash
cd backend
python -m venv .venv

# macOS / Linux
source .venv/bin/activate
# Windows PowerShell: .\.venv\Scripts\Activate.ps1

pip install -r requirements.txt
~~~

Create a local, gitignored **backend/.env** with the following development settings:

~~~dotenv
ALLOW_SQLITE_FALLBACK=true
PRO_ACCESS_ENFORCED=false
APP_ACCESS_ENFORCED=false
~~~

These settings are **for local development only**. They turn off access enforcement; do not deploy them to production.

~~~bash
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
~~~

The local SQLite database begins empty. Market views may show no data until listings have been imported or collected.

### 02 — Start the web app

Open a second terminal at the repository root:

~~~bash
npm ci
npm run dev
~~~

The frontend runs on **http://localhost:8080** and proxies API requests to the local backend.

### 03 — Build Android (optional)

~~~bash
cd android

# macOS / Linux
./gradlew :app:assembleDebug

# Windows
gradlew.bat :app:assembleDebug
~~~

For emulator-to-local-API builds, use the documented API URL override:

~~~bash
./gradlew :app:assembleDebug -PmotormilaApiUrl=http://10.0.2.2:8000/api/v1
~~~

See the [Windows Android build guide](android/README-WINDOWS-BUILD.md) for SDK/JDK setup and environment details.

### 04 — Run checks

~~~bash
npm run typecheck
npm run lint
npm test
npm run build

# From backend/ with the virtual environment active
python -m pytest tests

# From android/
./gradlew :app:testDebugUnitTest
~~~

The production-oriented web build also runs snapshot-sync and indexing scripts, so it may require network access or appropriately configured data inputs.

<br />

## Engineering the long game

MotorMila is more than a screen on top of scraped listings. The repository contains the ingestion fleet, analysis services, web product, native Android client, access controls, deployment automation, and operational recovery tools.

<details>
<summary><strong>Operations & deployments</strong></summary>

<br />

| System | Implementation |
|:--|:--|
| **Scraper schedules** | GitHub Actions collectors and dump workflows |
| **Data publication** | Merge/analysis/export pipelines and static snapshots |
| **Backend hosting** | Hugging Face Spaces deployment workflow |
| **Web delivery** | Vercel deployment and API routing |
| **Reliability** | Monitoring, maintenance, backup, and disaster recovery workflows |
| **Access** | Invite-based authentication and plan/role-based feature gates |

Key workflows and procedures:

- [Continuous integration](.github/workflows/ci.yml)
- [Scheduled scraping](.github/workflows/manus-scrape-every-2h.yml)
- [Merge to live](.github/workflows/manus-to-live.yml)
- [Backend deployment](.github/workflows/deploy-hf-backend.yml)
- [Disaster recovery plan](docs/disaster-recovery-plan.md)

For production authentication, secrets and permission configuration, use the relevant operational documentation. Never reuse local development bypass settings in a public deployment.

</details>

<details>
<summary><strong>Engineering documentation</strong></summary>

<br />

| Reference | Purpose |
|:--|:--|
| [Brand system](MOTORMILA-BRAND.md) | Official Apex M artwork, palette, typography, usage rules |
| [Android data contract](android/DATA_CONTRACT.md) | API and mobile data expectations |
| [Android domain contract](android/DOMAIN_CONTRACT.md) | Domain-level behavior and conventions |
| [Scraping operations](docs/manus-scraping.md) | Collection pipeline and operational notes |
| [Snapshot delivery](docs/public-snapshots-r2.md) | Public data exports and delivery |
| [Recovery](docs/disaster-recovery-plan.md) | Restoration and incident procedures |
| [Product roadmap](docs/platform-improvement-roadmap.md) | Planned improvements and development direction |

</details>

<br />

## A note on market intelligence

MotorMila analyzes information from vehicle advertisements and related sources. **An advertised price is not a verified transaction price**, and a model-derived fair-value estimate is not an inspection, appraisal, or guarantee. Listings can be stale, incomplete, duplicated, incorrect, or unavailable.

Use the insights as **decision support**. Verify the vehicle, seller, documents, condition, and current listing details independently before committing to a purchase.

MotorMila is not affiliated with ikman, Riyasewana, patpat, or any marketplace whose listings it analyzes. Marketplace names appear only to identify where a listing originated.

<br />

## Contact

| | |
|:--|:--|
| **Live platform** | [motormila.vercel.app](https://motormila.vercel.app) — also served at [motormila.pages.dev](https://motormila.pages.dev) |
| **Email** | [hello@ardenostudio.com](mailto:hello@ardenostudio.com) |
| **Feedback** | [GitHub issues](https://github.com/SuvenSeo/MotorMila/issues) |

Motormila has no motormila.lk domain, no public phone number, and no social or store listings claimed in this repository. If you see one, it is not an official Motormila channel — contact the email above to verify.

### Rights

Copyright © 2026 Ardeno Studio. All rights reserved. No licence is granted by this repository: do not copy, reuse, redistribute, or present this code, brand assets, or data as your own without written permission. See [LICENSE](LICENSE) and [NOTICE](NOTICE). For licensing enquiries, contact [hello@ardenostudio.com](mailto:hello@ardenostudio.com).

Third-party libraries and tools in this repository remain under their own licences, which are preserved in their respective packages.

<br />

---

<div align="center">

<a href="https://motormila.vercel.app">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-wordmark-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="public/logo-wordmark-light.svg" />
    <img src="public/logo-wordmark-light.svg" alt="MotorMila" width="240" />
  </picture>
</a>

<h3>THE FAIR MILA FOR EVERY MOTOR.</h3>

<strong>Less noise. More context. Better decisions.</strong>

<a href="https://motormila.vercel.app"><strong>ENTER MOTORMILA</strong></a>
&nbsp;&nbsp;·&nbsp;&nbsp;
<a href="https://github.com/SuvenSeo/MotorMila/issues">ISSUES & FEEDBACK</a>
&nbsp;&nbsp;·&nbsp;&nbsp;
<a href="MOTORMILA-BRAND.md">THE BRAND</a>
&nbsp;&nbsp;·&nbsp;&nbsp;
<a href="mailto:hello@ardenostudio.com">CONTACT</a>

<br /><br />

<sub>Designed and built for Sri Lanka. Powered by data. Guided by clarity.</sub>

</div>
