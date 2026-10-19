# AGENTS.md

## Cursor Cloud specific instructions

Motormila is a two-service app (see `README.md` for the full stack and standard
commands):

- Frontend: React + Vite (root `package.json`) — dev server on port `8080`.
- Backend: FastAPI (`backend/`) — dev server on `127.0.0.1:8000`.

The Vite dev server proxies `/api` → `http://127.0.0.1:8000` (see
`vite.config.ts`), so run the backend before exercising anything data-driven in
the UI.

### Dependencies / environment

- Backend Python deps live in a virtualenv at `backend/.venv` (created by the
  update script). Run backend commands with `backend/.venv/bin/...` (e.g.
  `backend/.venv/bin/uvicorn`, `backend/.venv/bin/python -m pytest`).
- No external Postgres/Neon is needed for local dev: set
  `ALLOW_SQLITE_FALLBACK=true` and the backend uses a local SQLite file
  (`backend/motormila.db`). Without it the backend aborts startup with
  "No database URL configured" (this flag defaults to `false`).
- For local work also set `PRO_ACCESS_ENFORCED=false` and
  `APP_ACCESS_ENFORCED=false`, otherwise `/api/v1/pro/*` and product data
  routes require a real auth token.
- Backend CI passes these inline (`ALLOW_SQLITE_FALLBACK=true python -m pytest tests`).
  Locally you can instead put them in `backend/.env` (gitignored).
- The frontend needs no `.env` in dev — `src/services/api.ts` defaults
  `VITE_API_URL` to `/api/v1` when `import.meta.env.DEV`.
- Platform access is invite-only: bootstrap an admin via `AUTH_USERS` with
  `"role":"admin"`, set `VITE_ENABLE_BACKEND_AUTH=true`, then invite users
  from `/admin` (email + free/pro plan). Invited users complete `/sign-up?token=…`.
  Production app: `https://motormila.pages.dev`. Generate HF secrets with
  `python scripts/bootstrap_platform_auth.py --email … --password …`.

### Run commands (local dev)

- Backend: `cd backend && ALLOW_SQLITE_FALLBACK=true PRO_ACCESS_ENFORCED=false APP_ACCESS_ENFORCED=false .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
- Frontend: `npm run dev` (from repo root).

### Non-obvious gotchas

- The SQLite database starts EMPTY — the app has no seed data and scrapers hit
  live external sites. Expect zeros/empty lists until data is loaded. To
  demonstrate the UI, insert rows into the `car_listings` table.
- Aggregate stats endpoints (`/api/v1/stats/summary`, `/stats/district-prices`,
  `/stats/district-velocity`) are cached in the `market_stats_cache` table with
  a 1-hour TTL (`app/utils/stats_cache.py`). After you change the underlying
  listing data, the endpoints keep returning the old cached payload until the
  TTL expires — delete the rows in `market_stats_cache` to force a recompute.
- Lint (`npm run lint`) currently reports warnings only (0 errors); that is the
  expected clean state.
