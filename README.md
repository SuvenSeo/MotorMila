<div align="center">

<a href="https://motormila.vercel.app">
<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/readme/hero-light.png" />
  <img src="docs/readme/hero-dark.png" alt="Motormila — The fair mila for every motor." width="100%" />
</picture>
</a>

<br />

**One question, answered with evidence: is this vehicle actually worth its asking price?**

<br />

<a href="https://motormila.vercel.app"><img src="https://img.shields.io/badge/▶_Open_Motormila-0A7AFF?style=for-the-badge" alt="Open Motormila" /></a>
<a href="https://motormila.vercel.app/how-we-price"><img src="https://img.shields.io/badge/How_pricing_works-09090B?style=for-the-badge" alt="How pricing works" /></a>
<a href="https://github.com/SuvenSeo/MotorMila/issues"><img src="https://img.shields.io/badge/Feedback-09090B?style=for-the-badge" alt="Feedback" /></a>

<br /><br />

<a href="https://github.com/SuvenSeo/MotorMila/actions/workflows/ci.yml"><img src="https://github.com/SuvenSeo/MotorMila/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
<img src="https://img.shields.io/github/stars/SuvenSeo/MotorMila?style=flat-square&label=Stars" alt="GitHub stars" />
<img src="https://img.shields.io/github/last-commit/SuvenSeo/MotorMila?style=flat-square" alt="Last commit" />
<img src="https://img.shields.io/badge/Sri_Lanka-vehicle_market-0A7AFF?style=flat-square" alt="Sri Lanka vehicle market" />

</div>

---

## Try it live — no sign-up, no setup

Pick a model and see the market, not just a listing:

[Toyota Prius](https://motormila.vercel.app/cars/toyota/prius) ·
[Toyota Aqua](https://motormila.vercel.app/cars/toyota/aqua) ·
[Toyota Corolla](https://motormila.vercel.app/cars/toyota/corolla) ·
[Toyota Premio](https://motormila.vercel.app/cars/toyota/premio) ·
[Toyota Axio](https://motormila.vercel.app/cars/toyota/axio) ·
[Honda Vezel](https://motormila.vercel.app/cars/honda/vezel) ·
[Honda Fit](https://motormila.vercel.app/cars/honda/fit) ·
[Suzuki Alto](https://motormila.vercel.app/cars/suzuki/alto)

Or start from the top: [motormila.vercel.app](https://motormila.vercel.app) → search any vehicle → open a hub → check its fair value before you call the seller.

---

## A listing vs. Motormila

| A marketplace listing tells you | Motormila adds |
|:--|:--|
| One seller's asking price | What comparable vehicles are actually asking, across marketplaces |
| One photo set, one description | Price history, trends, and district patterns for that model |
| "Contact seller" | A fair-value estimate and deal score — with the evidence shown |
| Nothing about timing | Whether the price is moving, and whether similar vehicles are priced lower |

An advertised price is not a verified sale price, and Motormila never
pretends otherwise. Every number shows its work.

---

## What you get

<table>
<tr>
<td width="50%" valign="top">

### See
Search listings, explore make-and-model hubs, and compare options
side by side — then jump to the original marketplace listing.

### Price
Comparable asking prices, fair-market-value estimates, deal scores,
and outliers. Not a black box: the comparables are visible.

</td>
<td width="50%" valign="top">

### Track
Price history, district patterns, trends, and alerts for vehicles
worth watching. The evidence, in order, before you decide.

### Go deeper
Comparison, listing history, EV / hybrid views, a price index,
geography, and Pro / dealer research tools where available.

</td>
</tr>
</table>

---

## How it works

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
scheduled runs. Collectors are isolated, so one blocked source stops
nothing else. Public aggregates are delivered as snapshots, and
listings are never presented as confirmed sales.

---

## The brand, in one glance

One mark, one palette, one typeface. Full rules:
[MOTORMILA-BRAND.md](MOTORMILA-BRAND.md).

| | |
|:--|:--|
| **Apex M** | A bold blue M whose final stroke rises into an arrow — *the market, moving the buyer's way.* No badges, no clip-art, no recoloring. |
| **Ink** | ![#09090B](https://img.shields.io/badge/-%2309090B-09090B?style=flat-square) — dark-first ground |
| **Blue** | ![#0A7AFF](https://img.shields.io/badge/-%230A7AFF-0A7AFF?style=flat-square) — the mark, and actions. Never recolor the mark. |
| **Paper** | ![#FFFFFF](https://img.shields.io/badge/-%23FFFFFF-FFFFFF?style=flat-square) — light surfaces, with the white-bg mark only |
| **Deal Green** | ![#00C853](https://img.shields.io/badge/-%2300C853-00C853?style=flat-square) — underpriced signals only, never in the logo |
| **Cal Sans** | Display for headlines, Cal Sans Text for body and prices |

---

## Built with

<img src="https://img.shields.io/badge/React_18-09090B?style=flat-square&logo=react&logoColor=0A7AFF" alt="React 18" />
<img src="https://img.shields.io/badge/TypeScript-09090B?style=flat-square&logo=typescript&logoColor=0A7AFF" alt="TypeScript" />
<img src="https://img.shields.io/badge/Vite-09090B?style=flat-square&logo=vite&logoColor=0A7AFF" alt="Vite" />
<img src="https://img.shields.io/badge/Tailwind-09090B?style=flat-square&logo=tailwindcss&logoColor=0A7AFF" alt="Tailwind" />
<img src="https://img.shields.io/badge/FastAPI-09090B?style=flat-square&logo=fastapi&logoColor=0A7AFF" alt="FastAPI" />
<img src="https://img.shields.io/badge/Python-09090B?style=flat-square&logo=python&logoColor=0A7AFF" alt="Python" />
<img src="https://img.shields.io/badge/SQLite-09090B?style=flat-square&logo=sqlite&logoColor=0A7AFF" alt="SQLite" />
<img src="https://img.shields.io/badge/Kotlin-09090B?style=flat-square&logo=kotlin&logoColor=0A7AFF" alt="Kotlin" />
<img src="https://img.shields.io/badge/Jetpack_Compose-09090B?style=flat-square&logo=android&logoColor=0A7AFF" alt="Jetpack Compose" />
<img src="https://img.shields.io/badge/GitHub_Actions-09090B?style=flat-square&logo=githubactions&logoColor=0A7AFF" alt="GitHub Actions" />
<img src="https://img.shields.io/badge/Vercel-09090B?style=flat-square&logo=vercel&logoColor=0A7AFF" alt="Vercel" />
<img src="https://img.shields.io/badge/Cloudflare-09090B?style=flat-square&logo=cloudflare&logoColor=0A7AFF" alt="Cloudflare" />

---

## Run it locally

~~~bash
# API
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Web (second terminal, repo root)
npm ci && npm run dev   # → http://localhost:8080
~~~

Local dev only — create a gitignored `backend/.env` with
`ALLOW_SQLITE_FALLBACK=true`, `PRO_ACCESS_ENFORCED=false`,
`APP_ACCESS_ENFORCED=false`. Do not deploy those settings. The local
database starts empty.

<details>
<summary>Android, checks, and the repo map</summary>

~~~bash
# Android (optional)
cd android && ./gradlew :app:assembleDebug

# Checks
npm run typecheck && npm run lint && npm test && npm run build
~~~

~~~text
MotorMila/
├── src/                 React web app
├── public/              Brand assets, metadata, snapshots
├── backend/             FastAPI, scraping, valuation, data
├── android/             Native Android companion
├── scripts/             Export, maintenance, deployment
├── .github/workflows/   CI, scraping, monitoring, releases
└── docs/                Engineering notes, operations, plans
~~~

Docs: [Brand system](MOTORMILA-BRAND.md) · [Android data contract](android/DATA_CONTRACT.md) · [Scraping operations](docs/manus-scraping.md) · [Snapshot delivery](docs/public-snapshots-r2.md) · [Recovery](docs/disaster-recovery-plan.md) · [Roadmap](docs/platform-improvement-roadmap.md)

</details>

---

<div align="center">

**Less noise. More context. Better decisions.**

[Enter Motormila →](https://motormila.vercel.app)

<br /><br />

<sub>
Live: [motormila.vercel.app](https://motormila.vercel.app) ·
[motormila.pages.dev](https://motormila.pages.dev) ·
Email: [hello@ardenostudio.com](mailto:hello@ardenostudio.com) ·
Feedback: [GitHub issues](https://github.com/SuvenSeo/MotorMila/issues)
<br />
Motormila is not affiliated with ikman, Riyasewana, patpat, or any
marketplace it analyzes. Marketplace names appear only to identify
where a listing originated. Verify the vehicle, seller, documents,
and condition independently before buying.
<br />
Copyright © 2026 Ardeno Studio. All rights reserved — see
[LICENSE](LICENSE) and [NOTICE](NOTICE). Third-party libraries remain
under their own licences. Motormila has no motormila.lk domain, no
public phone number, and no social or store listings claimed here.
</sub>

<br /><br />

<img src="public/logo-mark.png" alt="Motormila Apex M" width="64" />

</div>
