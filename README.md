<p align="center">
  <img src="public/logo-wordmark.svg" alt="Motormila" width="280" />
</p>

<p align="center">
  <strong>The fair mila for every motor.</strong><br />
  Sri Lanka's vehicle price intelligence platform — every listing, every source, one honest number.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 18" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Playwright-2EAD33?style=flat-square&logo=playwright&logoColor=white" alt="Playwright" />
  <img src="https://img.shields.io/badge/Android-Jetpack%20Compose-3DDC84?style=flat-square&logo=android&logoColor=white" alt="Android Jetpack Compose" />
  <img src="https://img.shields.io/badge/Deployed-Vercel%20%2B%20HF%20Spaces-000000?style=flat-square&logo=vercel&logoColor=white" alt="Vercel + HF Spaces" />
  <img src="https://img.shields.io/badge/WCAG-2.2%20AA-3D9970?style=flat-square" alt="WCAG 2.2 AA" />
</p>

<p align="center">
  <a href="https://github.com/SuvenSeo/Vehicle-Platform/actions/workflows/ci.yml"><img src="https://github.com/SuvenSeo/Vehicle-Platform/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

<p align="center">
  <a href="https://motormila.vercel.app">🌐 Live App</a> ·
  <a href="#features">Features</a> ·
  <a href="#the-pipeline">The Pipeline</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#operations">Operations</a>
</p>

---

<p align="center">
  <img src="https://img.shields.io/badge/📊_Listings-~275K-2563eb?style=for-the-badge" alt="275K listings" />
  <img src="https://img.shields.io/badge/🌐_Sources-13+-059669?style=for-the-badge" alt="13+ sources" />
  <img src="https://img.shields.io/badge/🔄_Refresh-3×%20daily-d97706?style=for-the-badge" alt="3x daily" />
  <img src="https://img.shields.io/badge/💰_Cost-$0%2Fmo-7c3aed?style=for-the-badge" alt="Zero cost" />
</p>

---

<img src="public/og-card.jpg" alt="Motormila dashboard" width="100%" />

---

## 🚗 What is Motormila?

Motormila is a **vehicle market intelligence platform for Sri Lanka**. It watches every major used-car marketplace, deduplicates the same car across sites, and turns ~275,000 live listings into clear answers:

> **What is this car actually worth today?** · Is it a good deal, or a trap? · Which districts move fastest? · Is the market going up or down — and where?

Think Bloomberg terminal for the Sri Lankan second-hand car market — but free to browse, obsessive about fairness, and built on real listing data refreshed three times a day.

### The problem it solves

Sri Lanka's car market is fragmented across a dozen+ marketplaces with wildly different formats, currencies (LKR vs USD), duplicate postings, and no price history. Buyers guess. Sellers guess. Dealers hedge.

Motormila fixes that with one obsessive idea: **watch everything, deduplicate ruthlessly, price honestly.**

- **13+ sources scraped** — ikman, riyasewana, patpat, autolanka, autodirect, saleme, riyahub, dimo, hitad, cartivate, and more
- **~275,000 listings tracked** with price history, not just snapshots
- **Same car across sites merged** via VIN + multi-signal fuzzy matching — one canonical record, not five duplicates
- **Refreshed 3× daily** (07:40 / 15:40 / 23:40 SLT) by an autonomous GitHub Actions fleet — **$0/month** infrastructure

---

## ✨ Features

### 📊 Market Intelligence
| | |
|---|---|
| **Live Market Snapshot** | Real-time SSE stream of market moves as scrapes land (`/stats/live/stream`) |
| **Price Trends & Index** | Price trend series per make/model — see where a car's value is heading |
| **District Intelligence** | Price maps + **district velocity** — where cars sell fastest |
| **Dashboard Insights** | Auto-generated market signals, curated daily by the analysis pipeline |

### 💰 Valuation & Deals
| | |
|---|---|
| **Fair Market Value (FMV)** | Per-listing valuation built from comparable live listings |
| **Deal Score** | Every listing scored — spot underpriced gems and overpriced traps |
| **Best Picks** | A daily shortlist of the sharpest deals on the market |
| **Price Drop Alerts** | Get pinged when a watched car drops — thresholds, % moves, and more |

### 🧭 Deep Research
| | |
|---|---|
| **Make & Model Hubs** | `/cars/toyota/axio` — full market profile per car, per model |
| **Listing History** | Per-listing price timeline, seller trust profile, similar cars |
| **Compare Tool** | Side-by-side listings, spec sheets, and valuation |
| **EV Hub** | Electric & hybrid market coverage, incl. hybrid tax trends |
| **Official Pulse** | Import permits, official sources, and policy pulse in one place |
| **Price Index** | A Bloomberg-style index of the whole SL used-car market |

### 👑 Pro & Platform
| | |
|---|---|
| **Pro Workspace** | Vehicle lanes, district deep-dives, **arbitrage gap detection** |
| **Dealer Dashboard** | Fleet-level view for dealers & resellers |
| **Invite-only Auth** | Plan-gated access, JWT sessions with instant revocation |
| **Admin Console** | Invite users, assign Free/Pro plans, manage access |

### 📱 Mobile
A companion **native Android app** in `android/` — Kotlin, Jetpack Compose, Hilt, Paging 3, CameraX plate scan, and WorkManager sync. Home/profile hubs cover EV, Official Pulse, Best Picks, make/model/district pages, and the import calculator. Biometric unlock, share-URL import, FMV share cards, and local notifications are included. Play Billing and FCM are stubbed in v1 (server checkout-intent fallback; push routing is local-only until a Firebase backend lands).

Debug builds can point at a local FastAPI backend via `MOTORMILA_API_URL` / `-PmotormilaApiUrl` (emulator loopback: `http://10.0.2.2:8000/api/v1`). Release uses the HF Space API.

Windows / JDK 17 setup: [`android/README-WINDOWS-BUILD.md`](android/README-WINDOWS-BUILD.md).

---

## 🕸️ The Pipeline

Everything is automated. Nobody touches a database. The entire pipeline runs on **$0/month** — GitHub Actions (unlimited on public repos), HuggingFace Spaces (free tier), Vercel (hobby), and Cloudflare.

```mermaid
flowchart LR
    subgraph Sources["13+ Sri Lankan Marketplaces"]
        IK[ikman.lk] --> GH
        RI[riyasewana.com] --> GH
        PA[patpat.lk] --> GH
        AL[autolanka] --> GH
        OT[9 more sources] --> GH
    end

    subgraph GH["GitHub Actions fleet"]
        SC["Scrape dumps<br/>3× daily"]
        MA["Merge + analysis<br/>dedup · deal scores · signals"]
        EX["Snapshot export<br/>→ Vercel deploy"]
    end

    SC --> REL[("GitHub Releases<br/>SQLite dumps")]
    REL --> MA
    MA --> REL2[("merged-db release<br/>canonical SQLite")]
    REL2 --> EX
    EX --> FE[("React frontend<br/>Vercel<br/>static snapshots")]
    REL2 --> API[("FastAPI<br/>HF Spaces<br/>SQLite failover")]
    API --> FE
```

**The zero-egress rule:** scrapers write to local SQLite (no database egress costs); the public site reads from static JSON snapshots, so the database is never hit by visitors. The backend API runs on SQLite failover for Pro features.

| Workflow | Cadence | Job |
|---|---|---|
| **Manus Scrape Dump** | 3× daily (07:40 / 15:40 / 23:40 SLT) | All 13 sources → SQLite dumps to Releases |
| **Manus to Live** | After each dump | Merge dumps → analysis → snapshot export → Vercel deploy |
| **Keep HF Space Awake** | Every 30 min | Ping backend to prevent cold starts |
| **Pipeline Monitor** | Continuous | Health checks + alerts |
| **DB Backup** | Weekly | SQLite snapshots to Releases |

---

## 🧱 Architecture

| Layer | Tech | Where |
|---|---|---|
| **Frontend** | React 18 · Vite · TypeScript · Tailwind · React Query · Recharts · Leaflet · framer-motion | Vercel |
| **Backend** | FastAPI · SQLAlchemy · APScheduler · structlog · Playwright | HF Spaces |
| **Database** | SQLite (zero-egress) · dumps versioned as GitHub Release assets | GitHub Releases |
| **Snapshots** | Static JSON snapshots → Vercel deploy (same-origin, no CORS) | Vercel |
| **Scrapers** | Python + Playwright (API-first, browser fallback), per-source isolation | GitHub Actions |
| **Mobile** | Kotlin · Jetpack Compose · Hilt · Paging 3 · CameraX · WorkManager | `android/` |
| **Quality** | Vitest · Testing Library · vitest-axe · ESLint · JUnit (Android) · GitHub Actions CI | CI |

```
.
├── src/            # React frontend (pages, components, services, lib)
├── backend/        # FastAPI app, scrapers, services, db models
│   ├── app/scrapers/   # 13+ per-source scraper modules
│   ├── app/services/   # market signals, aggregator, stats cache
│   └── db/             # SQLAlchemy models + SQLite failover
├── android/        # Native Android app (Jetpack Compose)
├── api/            # (edge helpers)
├── scripts/        # ops tooling (snapshot deploy, auth bootstrap)
├── .github/workflows/  # scrape fleet, CI, backups, monitors
└── docs/           # architecture & design docs
```

---

## ⚡ Quickstart

### Prerequisites
- Node 20+ · Python 3.12 · (optional) JDK 17 + Android SDK for the native app

### 1 · Frontend

```bash
npm install
npm run dev            # → http://localhost:8080 (proxies /api → 127.0.0.1:8000)
```

### 2 · Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# local dev uses SQLite — no external DB needed:
ALLOW_SQLITE_FALLBACK=true \
PRO_ACCESS_ENFORCED=false APP_ACCESS_ENFORCED=false \
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

> The SQLite DB starts **empty** — scrapers hit live external sites, so expect zeroes until a run lands. Insert rows into `car_listings` to demo the UI, or run a scrape:
> ```bash
> RUN_SCRAPERS=true SCRAPE_ENABLED_SOURCES=ikman python run_sync.py
> ```

### 3 · Mobile (native Android)

```bash
cd android
chmod +x gradlew
./gradlew :app:assembleDebug          # APK: app/build/outputs/apk/debug/
./gradlew :app:testDebugUnitTest      # JVM unit tests (no emulator)
```

Point a debug build at the local backend (emulator loopback):

```bash
./gradlew :app:assembleDebug -PmotormilaApiUrl=http://10.0.2.2:8000/api/v1
```

See [`android/README-WINDOWS-BUILD.md`](android/README-WINDOWS-BUILD.md) for JDK 17 / SDK setup.

### Verify

```bash
npm run typecheck && npm run lint && npm run test && npm run build   # frontend
cd backend && .venv/bin/python -m pytest tests                       # backend
cd android && ./gradlew :app:testDebugUnitTest                       # Android JVM tests
```

---

## 🔐 Auth & Pro Platform (production)

Platform access is invite-only. Bootstrap an admin, then invite users from `/admin`:

```bash
python scripts/bootstrap_platform_auth.py --email you@example.com --password '…' --name 'Owner'
```

- Set `AUTH_TOKEN_SECRET` + `AUTH_USERS` on the **HF Space secrets** and `VITE_ENABLE_BACKEND_AUTH=true` on **Vercel**
- Sessions re-check plan/role/active from the DB on every gated request; `token_version` kills old JWTs instantly
- Optional: `RESEND_API_KEY` (email invites) · `BILLING_WEBHOOK_SECRET` (Stripe/PayHere plan upgrades) · `PUBLIC_APP_ORIGIN`
- Local dev: `PRO_ACCESS_ENFORCED=false APP_ACCESS_ENFORCED=false` opts out of gating

---

## 🚀 Deploying

- **Backend → HF Spaces:** pushed automatically by `.github/workflows/deploy-hf-backend.yml`; verify with `curl https://seo292-vehicle-platform-backend.hf.space/health`
- **Frontend → Vercel:** Git integration on `main`; `vercel.json` rewrites `/api/v1/*` to the HF Space (same-origin, no CORS headaches)
- **Data → Vercel:** snapshots are exported and deployed to production by the scrape pipeline itself

> ⚠️ **Vercel requires verified commits** — unsigned commits get deployments cancelled. Use SSH/GPG signing, or land commits via GitHub's web UI / PR merge (GitHub signs those automatically).

---

## 🧪 Quality & Accessibility

- **WCAG 2.2 AA** — axe-core reports **zero violations** on key pages; enforced by tests (`vitest-axe`)
- **60+ component/unit tests** across dashboard, alerts, pricing gates, search, and accessibility
- **CI** runs frontend typecheck + lint + test + build and backend `pytest` on every push/PR; Android JVM unit tests (`./gradlew :app:testDebugUnitTest`) run when `android/` or `.github/workflows/android.yml` change
- **Error boundaries** everywhere — no silent blank screens
- **Sentry** error tracking + Vercel Analytics on the live site

---

## 🗺️ Roadmap

- [x] 13+ sources live, ~275k listings, VIN + fuzzy dedup
- [x] Valuation (FMV), deal scores, price alerts, district velocity
- [x] Pro workspace: vehicle lanes, district profiles, arbitrage gaps
- [x] Mobile companion app (native Android)
- [x] Zero-cost infrastructure ($0/month)
- [ ] 50+ sources (see `SCRAPER_ARCHITECTURE.md`)
- [ ] LLM extraction for unstructured listing descriptions
- [ ] Adaptive per-source scheduling based on market turnover
- [ ] Historical price analytics & forecasting

---

## 📚 Docs

| Doc | What it covers |
|---|---|
| [`SCRAPER_ARCHITECTURE.md`](SCRAPER_ARCHITECTURE.md) | Scaling to 50+ sources, proxies, resilience |
| [`docs/neon-egress-budget.md`](docs/neon-egress-budget.md) | Egress budget & snapshot strategy |
| [`docs/MASTER PLAN FOR FUTURE OF MOTORMILA.txt`](docs/MASTER%20PLAN%20FOR%20FUTURE%20OF%20MOTORMILA.txt) | The long game |
| [`docs/disaster-recovery-plan.md`](docs/disaster-recovery-plan.md) | Backup & recovery procedures |
| [`android/README-WINDOWS-BUILD.md`](android/README-WINDOWS-BUILD.md) | Android JDK 17 setup, debug `BASE_URL`, unit tests |

---

## 🤝 Contributing

This repo is public. Issues and PRs are welcome — but please keep the zero-cost constraint in mind: every new dependency, workflow, or service should work within the free tier.

---

<p align="center">
  Built with obsession in Sri Lanka 🇱🇰<br />
  <sub>Data is for intelligence, not for flipping the market — use the fair mila wisely.</sub>
</p>
