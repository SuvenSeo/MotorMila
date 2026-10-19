# Overhaul: backend-sec (branch `overhaul/backend-sec`)

Base: `main @ 97ffbee`. Scope: backend API security and outage resilience (FastAPI in `backend/`, deployed to the HF Space), plus CI deploy gating.

## Summary of changes

| # | Item | Status |
|---|------|--------|
| 1 | DB outage: 503 + Retry-After, fast-fail auth, circuit breaker, workable failover, accurate /health | Done |
| 2 | Strict CORS allowlist, strip CORS headers for foreign origins, SameSite=lax default | Done |
| 3 | CSRF protection for admin + cookie-auth writes | Done |
| 4 | Billing webhook replay protection + constant-time compare | Done |
| 5 | Rate limits: separate buckets, per user/IP, login throttle before bcrypt, lockout/backoff | Done |
| 6 | Moderation queue for user-submitted listings | Done |
| 7 | Hide OpenAPI/docs in production | Done |
| 8 | Fix the 2 failing backend tests | Done (+ fixed a 3rd hang, `test_sse_limits`) |
| 9 | Gate the HF deploy on CI tests | Done (`restore-catalog-after-main` deliberately not gated, see below) |
| 10 | Remove demo passwords / personal phone in security.txt | Done (working tree only) |
| 11 | Account deletion endpoint | Done: **`DELETE /api/v1/auth/me`** |

Tests: `cd backend && python -m pytest tests/` gives **1138+ passed, 0 failed** (the new tests are in `tests/test_db_outage_and_cors.py` and `tests/test_moderation_billing_account.py`).

---

## 1. DB outage resilience

**Root cause of "failover:false" (BE-NEW-2), found and fixed.** The public R2 bucket (`pub-…r2.dev`, served by Cloudflare) returns **HTTP 403 to urllib's default `Python-urllib/3.x` User-Agent**. With curl, or any other UA, it returns 200. Every failover download attempt was therefore failing straight away. All failover requests now send `User-Agent: MotorMila-Failover/1.1 (+https://motormila.vercel.app)`. You can override it with `SQLITE_FAILOVER_USER_AGENT`. I checked this from the sandbox: a GET with the new UA streams a valid `SQLite format 3` header.

Other failover changes (`backend/db/sqlite_failover.py`):
- **Timeouts are configurable.** `SQLITE_FAILOVER_SOCKET_TIMEOUT` is the per-read timeout (default 120 s). `SQLITE_FAILOVER_DOWNLOAD_DEADLINE` covers the whole download (default 1800 s).
- **The download is still stream-gunzipped straight to disk,** so there is no staged `.gz` copy.
  - A disk pre-check refuses the download early if free space is less than 5× the gz size.
  - Leftover `.partial` and `.refresh` files from a killed process are deleted before each download.
  - A refresh, which needs the live copy and the new copy at the same time, is **skipped** when the disk can't hold both. The API keeps serving the current file.
- **The default path is `/data/motormila-failover.db`** when HF persistent storage is mounted and writable; otherwise it is `/tmp/…`. `SQLITE_FAILOVER_PATH` still takes precedence.
- **A slim dump is supported.** If `SQLITE_FAILOVER_SLIM_URL=<url>` is set, or set to `default` for `…/snapshots/latest/merged-motormila-slim.db.gz`, that URL is tried first. It falls back to the full dump on a 404. Nobody publishes a slim dump yet (see OPS / data engineer).
- **`failover_status()` records** the number of attempts, the last error, the last attempt time and the source used.

New `backend/app/core/db_guard.py`:
- **Circuit breaker on Postgres engines** (the `do_connect` event).
  - After a connect failure, connects fail instantly with `DatabaseUnavailable` for `DB_BREAKER_OPEN_SECONDS` (default 15).
  - After that window, exactly one half-open trial connect is allowed.
  - The health probe and the failover monitor bypass the breaker, so they always see the real database.
- **`DB_CONNECT_TIMEOUT_SECONDS`** defaults to 3 (was 5).
- **Errors are classified.** Connection and outage errors (refused, timeout, quota exceeded, SSL drop, circuit open, …) count as an outage. Query bugs such as "no such table" or syntax errors do not.

`backend/app/main.py`:
- **Outage-type `DBAPIError`, `TimeoutError` and `DatabaseUnavailable` now return `503`** with this body, plus `Retry-After` (`DB_RETRY_AFTER_SECONDS`, default 30) and `Cache-Control: no-store`:

  ```json
  {"detail": "...", "code": "db_unavailable", "retry_after": 30}
  ```

  Query bugs still return 500.
- **`/health` and `/api/v1/health`** now return these fields:
  - `mode`: `primary`, `failover` or `down`
  - `failover`, `failover_enabled`, `failover_attempts`, `failover_error`, `failover_last_attempt_at`, `failover_source`
  - `circuit`: the breaker state only, because the error text can name the DB host

  When degraded, the response is a 503 with `Retry-After`.

`backend/app/api/v1/endpoints/auth.py`:
- **Account lookups fail fast while the DB is down,** because the breaker short-circuits the connect.
- **They now return 503 instead of 401** when the account store is unreachable, or when the API is serving from the failover dump (which has no user tables). Clients therefore keep the session and retry instead of signing the user out. Env bootstrap (`AUTH_USERS`) logins still work during an outage.

## 2. CORS and cookies

- **Single origin allowlist** in `backend/app/core/origins.py`.
  - Defaults: `https://motormila.vercel.app`, `https://motormila.pages.dev`, the two legacy `vehicle-platform-one*.vercel.app` aliases, and localhost/127.0.0.1 on ports 8080, 5173 and 5174.
  - `CORS_ORIGINS` adds to the list. `CORS_ORIGINS_REPLACE=true` makes it replace the list instead. `*` is still accepted for CORS only, and it turns credentials off.
- **The Android app sends no Origin header,** so CORS does not affect it.
- **New outermost `StrictCORSHeadersMiddleware`** (`app/core/http_security.py`).
  - It strips **every `Access-Control-*` header** when the Origin is not allowlisted, and drops `Allow-Credentials` when there is no Origin.
  - Why it is needed: the HF proxy reflects any Origin, and Starlette added `Allow-Credentials: true` to every response. Even though HF still echoes ACAO, browsers no longer get a credentialed response for a foreign origin.
- **`AUTH_COOKIE_SAMESITE` now defaults to `lax`** (was `none`). Invalid values also fall back to `lax`. The web app is same-origin through the rewrite, so Lax works.

## 3. CSRF

- **Global `CSRFOriginMiddleware`.** Any POST/PUT/PATCH/DELETE that carries the `mm_session` cookie and **no Bearer token** must have a trusted `Origin`, or a trusted `Referer` when Origin is missing. Otherwise it gets a 403.
  - Trusted means the allowlist above, plus `TRUSTED_ORIGIN_SUFFIXES` (default `-suvenseoras-projects.vercel.app`, https only).
  - Bearer-token calls (Android, API clients) are unaffected.
  - `/api/v1/billing/webhook` is exempt; it has its own signature check.
  - You can disable the middleware with `CSRF_PROTECTION=false`, for debugging only.
- **`require_admin_access` checks the origin as well** (defence in depth): cookie-only admin writes need a trusted Origin.

## 4. Billing webhook (`backend/app/api/v1/endpoints/billing.py`)

- **New signing scheme:**

  ```
  X-Motormila-Timestamp: <unix seconds>
  X-Motormila-Signature: sha256=<hex HMAC-SHA256(secret, f"{ts}." + raw_body)>
  ```

  - Requests outside `BILLING_WEBHOOK_TOLERANCE_SECONDS` (default 300) are rejected.
  - **`event_id` is required**, and each event is applied at most once. The new table `billing_webhook_events` stores processed event ids. An in-process LRU cache covers the case where the table isn't migrated yet, and races between deliveries. A replay returns `{"ok": true, "duplicate": true}`.
  - The legacy body-only signature is refused unless `BILLING_WEBHOOK_ALLOW_LEGACY=true`.
  - The comparison uses `hmac.compare_digest` on byte strings of the same type.

## 5. Rate limits (`backend/app/services/rate_limit.py`)

- **Every `RateLimiter` has its own namespace.** `tier=` is now actually used. Limiters without an explicit tier get one automatically, made from the module name plus a sequence number.
  - Before this, every limiter shared one bucket per IP, so browsing used up the login budget.
- **The default key is per account** (a hash of the email from a valid token) for signed-in callers, and **per IP** otherwise.
- **Explicit tiers** were added for: auth login volume (per IP, 30/min), `/me`, signup (per IP), account deletion, listings, my-listings read/write, and `/listings/estimate`. The estimate limit is 30/min, because that endpoint is public.
- **New `LoginThrottle`, checked BEFORE bcrypt.**
  - Per account: 5 failures in 15 min locks the account for 30 s, doubling with each further failure, capped at 15 min.
  - Per IP: 30 failures in 15 min locks the IP.
  - While locked, even the correct password gets a 429 with `Retry-After`, so the lock is not a password oracle. A successful login clears the account's failures.
  - Env settings: `LOGIN_ACCOUNT_MAX_FAILURES`, `LOGIN_IP_MAX_FAILURES`, `LOGIN_FAILURE_WINDOW_SECONDS`, `LOGIN_MAX_LOCKOUT_SECONDS`.
  - The old test that asserted "the correct password succeeds after 14 failures" described the vulnerability itself, so I replaced it.
- **Caveat: the per-IP key is the rightmost `X-Forwarded-For` hop.** Through the Vercel/Pages proxy that hop may be the proxy's egress IP. That is why the default key is per account for signed-in users and the per-IP login limit is generous. See TODO.

## 6. Moderation queue

- **`POST /listings/mine`** creates the listing as `user_listing_status='pending'` and **`is_active=False`**.
- **`live_listing_filter()`** additionally requires `user_listing_status IN ('scraped','published')`.
- **`GET /listings/{id}`** returns 404 for an unapproved user listing unless the caller is its owner or an admin.
- **Editing the content of a published listing** puts it back to `pending` and inactive. Status changes the user makes (draft/pending/removed) always make it inactive.
- **New admin endpoints:**
  - `GET /api/v1/admin/listings/moderation?status=pending|draft|published|removed|all&limit=`
  - `POST /api/v1/admin/listings/{id}/approve` sets `published` and `is_active=True`.
  - `POST /api/v1/admin/listings/{id}/reject` with optional body `{"reason": "..."}` sets `draft` and inactive.
- **Bug fix:** user listings had `url=NULL`, so `GET /listings/{id}` returned 500 (a response-validation error). They now get `https://motormila.vercel.app/listing/{id}`.

## 7. Docs hidden in production

`/docs`, `/redoc` and `/openapi.json` are disabled when `SPACE_ID` is set (which HF sets) or when `ENV`/`APP_ENV=production`. `API_DOCS_ENABLED=true|false` overrides this either way.

## 8. Tests

- **`RAV4` vs `Rav4`:** the parser's `RAV4` is correct, so I fixed the test. The data-legal branch makes the identical one-line change, so the merge should be clean.
- **`/listings/estimate` public:** this is **by design**. The web `/estimate` page and the Android guest Valuation screen call it while signed out, so I kept it public and gave it its own 30/min bucket. I updated the test, and added `/listings/mine` to the list of gated paths.
- **`test_sse_limits::test_first_yielded_chunk_contains_snapshot_event`** hung for the full 120 s stream interval. The SSE loop now sleeps in 1 s slices and checks for a disconnect between them, so a disconnected client releases its SSE slot within about 1 s (this also helps B-1).

## 9. CI gating

- **New reusable `.github/workflows/backend-tests.yml`** (`workflow_call`).
  - `ci.yml`'s backend job now calls it.
  - **`deploy-hf-backend.yml`** runs it as job `backend-tests`, and `sync-to-hf` has `needs: backend-tests`, so it only runs on success. The read-only `logs_only` dispatch skips the tests.
- **`restore-catalog-after-main.yml` is deliberately NOT gated.** The Vercel Git integration deploys `main` whether CI passes or not, and this job re-publishes the catalog that the deploy wipes. Gating it would leave production without a catalog whenever CI is red.
- **The scheduled scrape workflows are untouched.**

## 10. Secrets / PII in the working tree

- **`docs/archive/lovable-zero-context-frontend-build-prompt.md`:** demo credentials redacted.
- **`/.well-known/security.txt`, backend (`main.py`):** phone number removed. The contact can be overridden with `SECURITY_CONTACT`, and `Expires` is in ISO format.
- **`public/.well-known/security.txt`:** phone line removed. This is a minimal change outside my owned paths.
- **Not changed (outside scope, or deliberate business contact):**
  - `backend/app/api/v1/endpoints/billing.py` `_CONTACT_PHONE_FALLBACK` (the manual-pay WhatsApp number, overridable with `BILLING_WHATSAPP`)
  - `src/lib/brand.ts`
  - Android `LegalCatalog`/`PricingCatalog`
  - `docs/disaster-recovery-plan.md`
  - The Android debug keystore defaults

## 11. Account deletion: `DELETE /api/v1/auth/me`

- **Auth:** `Authorization: Bearer <token>` (Android), or the `mm_session` cookie from a trusted Origin (web).
- **Optional JSON body `{"password": "..."}`:** if supplied, the password must match, otherwise the call returns 403.
- **What it deletes:**
  - the `platform_users` row
  - alerts (`user_token = "mm:<email>"`) and their match rows
  - notifications and push subscriptions
  - the user's `motormila_user` listings
  - feedback rows with that email, and invites for that email

  It also sets `analytics_events.user_email` and the matching dealer-profile `contact_email`/`billing_email` to NULL. It clears the cookie.
- **Session revocation:** because the user row is gone, every outstanding token gets a 401.
- **Responses:**
  - `200 {"ok": true, "deleted": true, "email": "...", "counts": {...}}`
  - `401` no or invalid session
  - `403` wrong password
  - `404` account not found
  - `409` bootstrap `AUTH_USERS` account (operator-managed)
  - `429` rate limited (5 per 5 min)
  - `503` DB down
  - `500` failed and rolled back
- **Web clients** must send `credentials` plus their Origin (normal browser behaviour). Android must send the Bearer header.

## How to test

```bash
cd backend
pip install -r requirements.txt
ALLOW_SQLITE_FALLBACK=true APP_ACCESS_ENFORCED=false PRO_ACCESS_ENFORCED=false python -m pytest tests/
# focused:
python -m pytest tests/test_db_outage_and_cors.py tests/test_moderation_billing_account.py tests/test_auth_endpoints.py tests/test_sqlite_failover.py
```

After deploying, check the live API:

```bash
curl -s https://seo292-vehicle-platform-backend.hf.space/health
# expect within a few minutes: "mode":"failover","failover":true
# (or a failover_error explaining why)
curl -sI -H 'Origin: https://evil.example' https://seo292-vehicle-platform-backend.hf.space/health
# expect: no access-control-allow-credentials
curl -s -o /dev/null -w '%{http_code}' https://seo292-vehicle-platform-backend.hf.space/openapi.json
# expect: 404
```

## OPS STEPS FOR SUVEN

1. **Merge, then deploy.** The deploy now waits for the backend tests. After the deploy, check `/health`: `failover_attempts` should rise and `mode` should become `failover` within about 2 to 10 minutes, depending on download speed.
2. **HF Space env.**
   - If `AUTH_COOKIE_SAMESITE=none` is set on the Space, **remove it**, or set it to `lax`.
   - Optionally set `SECURITY_CONTACT=mailto:security@<your-domain>`.
   - Optionally enable HF persistent storage (`/data`) so the failover DB survives restarts and has room for refreshes.
3. **Billing integrations:** any sender (PayHere/Stripe adapter, a manual script) must switch to the timestamped signature and include a unique `event_id`. Until it does, you can set `BILLING_WEBHOOK_ALLOW_LEGACY=true` temporarily. The timestamp tolerance and event-id dedupe still apply to timestamped calls.
4. **Schema:**
   - The new table `billing_webhook_events` is created by `init_db()`/`create_all`. Run the existing maintenance/schema workflow once (production uses `SKIP_DB_INIT=true`). Without the table, dedupe falls back to in-memory.
   - Existing user listings already marked `is_active=True` with `user_listing_status='pending'` disappear from public views (correct). Approve them through the new admin endpoints.
5. **Rotate** any password that was ever committed: the admin password from commit `b6c4633`, and `AutoLensPro2026!`/`AutoLensFree2026!` if they were used anywhere. Purge the history with `git filter-repo` and force-push. This applies to the HF Space mirror too.
6. **Branch protection:** require the `CI / Backend` check on `main`. That has to be done in GitHub settings, which I did not touch.
7. **Admin UI (front end):** the moderation queue endpoints exist, but no web UI uses them yet.

## Not done / TODO

- **No slim failover dump is published yet.** The data/export engineer should publish `snapshots/latest/merged-motormila-slim.db.gz` (live rows and API columns only); then set `SQLITE_FAILOVER_SLIM_URL=default`.
- **Login throttle state is per process** (in memory), which is fine for the single-worker HF Space. If you scale out, move it to Redis.
- **Per-IP keys behind the Vercel/Pages proxy** may be the proxy's egress IP. The fix needs a trusted client-IP header set by the proxy (front-end/infra change).
- **`MarketAlert.user_token` is VARCHAR(36)**, too short for `mm:<email>` on Postgres (B-2). It is in the alerts model and was not in this task.
- **The web front end doesn't call `DELETE /auth/me` yet,** and there is no admin moderation UI.
