# End-to-end tests (Playwright)

Real browser tests against the real stack: the FastAPI backend serving a
freshly seeded SQLite database, and the Vite dev server proxying `/api` to it.
Chromium only. Runs in CI via `.github/workflows/e2e.yml`.

## Run locally

```bash
npm run e2e:install   # once: Chromium + OS deps (needs sudo for --with-deps;
                      # `npx playwright install chromium` if you have the libs)
npm run e2e           # starts both servers, runs the suite, stops them
npx playwright test e2e/listing.e2e.ts --headed   # one file, visible browser
npx playwright show-report e2e/.output/report     # last HTML report
```

Prerequisite: backend deps in `backend/.venv` (see AGENTS.md). The config
uses `backend/.venv/bin/python` when it exists, else `python`; override with
`E2E_PYTHON=/path/to/python`.

## How it works

`playwright.config.ts` starts two `webServer`s:

| server   | command                                                                 | default port |
| -------- | ----------------------------------------------------------------------- | ------------ |
| backend  | `python e2e/seed.py <db>` then `uvicorn app.main:app` (cwd `backend/`)   | `8010` (`E2E_API_PORT`) |
| frontend | `vite --config e2e/vite.e2e.config.ts`                                    | `4173` (`E2E_WEB_PORT`) |

The ports deliberately differ from the dev defaults (8000 / 8080) so the suite
never collides with servers you already have running. `e2e/vite.e2e.config.ts`
reuses `vite.config.ts` and only changes the port and the `/api` proxy target.

Backend env: `DATABASE_URL=sqlite:///e2e/.output/e2e.db`,
`ALLOW_SQLITE_FALLBACK=true`, `PRO_ACCESS_ENFORCED=false`,
`APP_ACCESS_ENFORCED=false`, plus `SQLITE_FAILOVER=false`,
`DAILY_SYNC_ENABLED=false`, `DIGEST_FLUSH_ENABLED=false` so nothing touches
the network or runs background jobs. Frontend env:
`VITE_SNAPSHOT_BASE_URL=off`, so pages read the seeded API rather than the
bundled `public/snapshots` data.

Locally (not in CI) an already-running server on those ports is reused, which
skips re-seeding. Stop it, or run `backend/.venv/bin/python e2e/seed.py`, to
reset the data.

## Seed data

`e2e/seed.py` deletes and recreates the SQLite file, runs the backend's
`init_db()` (schema + patches), and inserts 22 active `car_listings`: 11 Toyota
Prius (enough comparables for a confident fair value), 3 Toyota Vitz, 3 Suzuki
Wagon R, 3 Honda Vezel, 2 Nissan Leaf. Listing ids are stable (1 = 2017 Prius,
Rs 11,500,000; 3 = 2018 Prius; 12 = 2018 Vitz). Specs reference these via
`SEED` in `fixtures.ts`; update both together.

## Specs

| file                     | covers |
| ------------------------ | ------ |
| `home.e2e.ts`            | home renders seeded inventory with no runtime errors; search filters the feed; make/model deep link |
| `listing.e2e.ts`         | open a listing from the feed; asking price + "Typical asking price" fair-value section; direct link |
| `hubs.e2e.ts`            | `/cars/toyota/prius` model hub (market snapshot, recent listings); link to `/cars/toyota` |
| `compare.e2e.ts`         | empty state; `/compare/1-vs-12`; pin two listings from detail pages then open `/compare` |
| `auth-and-errors.e2e.ts` | `/sign-in` form + client-side validation; `/login` redirect; 404 page and its link home |

`fixtures.ts` provides a `pageErrors` fixture that records uncaught
exceptions, `console.error` output and failing `/api` calls. It ignores the
browser's generic "Failed to load resource" line (optional static files can
404 in a dev checkout) and 429s from the rate-limited analytics endpoint.

Specs are named `*.e2e.ts`, and `vitest.config.ts` excludes `e2e/**`, so
`npm test` never picks them up.

## Output

Everything goes to `e2e/.output/` (gitignored): `report/` (HTML report),
`test-results/` (traces on first retry, screenshots and videos for failures),
and `e2e.db`. CI uploads `report/` and `test-results/` as artifacts when the
job fails.

## Containers without browser system libraries

If `--with-deps` can't run (no root) and Chromium fails with missing `.so`
files, you can `apt-get download` the libraries Playwright lists (libnss3,
libnspr4, libatk*, libxkbcommon0, libasound2t64, ...) plus a font package
(`fonts-liberation`), unpack them with `dpkg-deb -x`, and point
`LD_LIBRARY_PATH` / `FONTCONFIG_FILE` at the unpacked tree. Without any fonts
installed, text renders invisible and visibility assertions fail.
