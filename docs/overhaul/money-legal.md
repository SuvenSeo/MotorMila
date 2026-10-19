# Overhaul: money-legal (branch `overhaul/money-legal`)

Scope: payments (PayHere), lead capture, legal pages, business drafts. Based on `audit2/monetisation.md` and `audit2/legal.md` (19 Oct 2026).

> **Not legal advice.** Have a Sri Lankan lawyer (IT / data protection) review the Privacy Policy, Terms, consent wording, ROPA/DPIA and partner agreements before relying on them. This note lives in the docs only, never on the site pages.

## 1. Payments

**What changed**
- **Stripe removed from checkout.** `POST /api/v1/billing/checkout-intent` now returns only `manual` or `payhere`. `STRIPE_CHECKOUT_URL` is ignored. Stripe can't pay out to a Sri Lankan business. The webhook function body was deliberately left alone (backend-sec is changing it for replay protection), so the ignored `Stripe-Signature` header parameter is still there.
- **PayHere Checkout API** (`backend/app/routers/payhere.py`):
  - `GET /api/v1/payhere/config`: whether PayHere is enabled, sandbox or live, the price list, `proFreeDuringBeta`, `recurringAvailable`.
  - `POST /api/v1/payhere/checkout` (signed-in): creates a `payhere_payments` order and returns the HTML-form fields, with the `hash` computed on the server: `UPPER(MD5(merchant_id + order_id + amount(2dp) + currency + UPPER(MD5(secret))))`. The browser auto-posts the form to `sandbox.payhere.lk` or `www.payhere.lk`. `recurring=true` adds `recurrence` / `duration=Forever`, but only when `PAYHERE_RECURRING_ENABLED=true` (PayHere Plus or Premium).
  - `POST /api/v1/payhere/notify` (PayHere server callback, form-encoded): checks `md5sig` with a constant-time compare, checks merchant id, and checks that **amount and currency match the stored order**. It then grants the plan **once per PayHere `payment_id`** (`payhere_notifications.payment_id` is unique, so retries return `duplicate: true`). Status `2` grants the plan. `-1`/`-2`/`0` are recorded and never grant. `-3` (chargeback) downgrades to free. `RECURRING_STOPPED` / `RECURRING_COMPLETE` mark the subscription canceled.
  - `GET /api/v1/payhere/orders/{order_id}` (owner only): polled by the `/checkout/return` page.
- **Pro is free during beta.** Pro checkout returns 409 unless `PAYHERE_PRO_CHECKOUT_ENABLED=true`, and checkout-intent never sends Pro users to a card page. Nothing paywalls scraped data.
- **Prices:** Pro LKR 999/mo or 9,990/yr (shown, "free during beta"). Dealer **Starter 2,990 / Pro 6,990 / Yard 14,990** per month by stock size (≤20 / ≤75 / unlimited). Annual is 10× monthly. The single source is `PLAN_CATALOG` in `payhere.py`, mirrored in `src/lib/pricingContent.ts` (`PLAN_PRICES`, `DEALER_TIERS`).
- **Bank transfer / KOKO manual path kept.** It is always returned in `manual_pay` and shown as "Pay by bank transfer / KOKO instead".
- **Pricing page:** live prices, a "Free during beta" badge, and a new **Dealer plans** section with a monthly/yearly toggle → PayHere panel (mobile number, optional auto-renew, test-mode badge in sandbox) or the manual-pay panel. Signed-out users are sent to sign in first.

## 2. Lead capture (`backend/app/routers/leads.py`)
- `POST /api/v1/leads` (public) takes kinds `finance`, `inspection` and `insurance`. Fields: name, phone (Sri Lankan format, normalised), optional email, district, vehicle, listing_id, budget, down payment, preferred date, notes. **The consent checkbox is required.** `consent_version` must match the kind. The server stores the **exact consent text** and a server `consent_at` timestamp.
- **Anti-spam:** per-IP rate limit (5 / 10 min, own bucket namespace), a `website` honeypot (pretends success, stores nothing), and a 24h de-dup on phone + kind + listing. The IP is stored only as a salted SHA-256 (`LEADS_IP_SALT`).
- **Partner routing** uses `LEADS_PARTNERS_JSON`, for example:
  ```json
  {"finance":[{"id":"leasing-a","name":"Leasing A PLC","email":"leads@a.lk","webhook":"https://…","webhook_token_env":"LEASING_A_TOKEN","privacy_url":"https://a.lk/privacy"}],
   "inspection":[{"id":"insp-x","name":"Inspector X","email":"bookings@x.lk"}],
   "insurance":[{"id":"broker-y","name":"Broker Y (Pvt) Ltd","licence":"IRCSL reg. no. …","email":"…"}]}
  ```
  `GET /api/v1/leads/partners?kind=` exposes the names and licence numbers so the form can say who receives the lead. **Nothing is sent to partners unless `LEADS_DELIVERY_ENABLED=true`.** Delivery runs as a background task (email via the existing Resend/SMTP helper and/or a JSON webhook) and records `delivery_status`.
- **Admin** (live admin session): `GET /api/v1/leads/admin`, `GET /api/v1/leads/admin/export.csv` (formula-injection safe), `PATCH /api/v1/leads/admin/{id}` (status).
- **UI:** `src/components/money/LeadRequestForm.tsx` and the "Next steps for this vehicle" card on listing detail (`ListingLeadActions`, with Leasing / Inspection / Insurance tabs and a "remove this ad" link). Standalone pages: `/finance` (`/leasing` redirects there), `/inspection`, `/insurance`. Insurance is labelled as going to a **licensed broker (IRCSL)**, and the consent text says MotorMila is not an insurer or broker.
- Consent wording lives in **two places**: `backend/app/routers/leads.py` `CONSENT_TEXTS` and `src/lib/leadConsent.ts`. If you change the text, bump the version in both.

## 3. Legal pages
- Rewritten in plain English and aligned with the PDPA: **Privacy Policy** (`/privacy`), **Terms of Use** (`/terms`), new **Cookie notice** (`/cookies`), **Remove a listing or my data** (`/removal`, form → `POST /api/v1/legal/removal`, 72h SLA, prefilled `?url=`), and **Delete my account** (`/delete-account`, form → `POST /api/v1/legal/account-deletion`, 14-day SLA).
- `backend/app/routers/legal_requests.py` stores requests in `legal_requests` with a reference (`MM-R…` / `MM-D…`) and `due_at`. It emails ops if `LEGAL_NOTIFY_EMAIL` is set. Admin: `GET/PATCH /api/v1/legal/admin/requests`.
- The Privacy Policy names every listing source (`src/lib/listingSources.ts`) and covers legal bases, retention, rights, the DPA complaint route, cookies and analytics. The Terms add the aggregator / no-affiliation disclaimer, link-back, no guarantees, and lead / partner fees. The "no scraping without a B2B licence" clause is replaced with a polite-bot policy.
- Footer: Privacy, Terms of Use, Cookie notice, Remove a listing, Delete my account, plus Leasing quotes and Book an inspection.
- Placeholders are in `src/components/money/LegalPageShell.tsx`: `LEGAL_EFFECTIVE_DATE`, `PRIVACY_EMAIL` (privacy@motormila.lk), `CONTROLLER_NAME`.

**Promises the pages make that other branches must make true before publishing:**
- No seller phone numbers or names on MotorMila (data-legal: remove `seller-profile` phone extraction).
- No re-served photos (data-legal: `thumbnail-proxy`).
- Delete links and personal fields 90 days after an ad disappears (data-legal / backend retention job).
- Removed listings are suppressed from future scrapes. Today an admin hides them by hand. **TODO:** a suppression list read by the scrapers.
- "We only collect ads anyone can see without an account". Confirm no scraper logs in.

## 4. Business drafts (`docs/business/`)
Partnership emails to ikman and Riyasewana, outreach templates for leasing, inspection and insurance-broker partners, the Dealer one-pager, the ROPA + DPIA template, and the Pvt Ltd (eROC) checklist. **Drafts only. Nothing was sent.**

## Files
New: `backend/app/routers/{__init__,_common,money_models,payhere,leads,legal_requests}.py`, `backend/tests/{_money_app,test_payhere,test_leads,test_legal_requests}.py`, `src/lib/{moneyApi,leadConsent,listingSources}.ts`, `src/components/money/{LeadRequestForm,ListingLeadActions,LegalPageShell,formStyles}.tsx|ts`, `src/pages/{LeadRequest,RemovalRequest,AccountDeletion,CookieNotice,CheckoutReturn}.tsx`, `docs/business/*`, this file.
Changed: `backend/app/main.py` (+2 lines: import and mount `money_router`), `backend/app/api/v1/endpoints/billing.py` (checkout-intent and `_checkout_url` only), `src/pages/{Pricing,PrivacyPolicy,TermsOfService}.tsx`, `src/lib/pricingContent.ts`, `src/test/pricingDocsBranding.test.tsx`.
**Outside owned paths (minimal):** `src/App.tsx` (5 lazy imports + 8 routes), `src/components/AppFooter.tsx` (5 links), `src/pages/ListingDetail.tsx` (1 import + 1 block after `ListingHistoryReport`).

New tables (created by `init_db` `create_all`, checkfirst): `payhere_payments`, `payhere_notifications`, `leads`, `legal_requests`. No Alembic migration was added. Add one if prod relies on Alembic only.

## How to test
```bash
cd backend && ALLOW_SQLITE_FALLBACK=true python -m pytest tests/test_payhere.py tests/test_leads.py tests/test_legal_requests.py -q
npm test && npm run build
```
PayHere sandbox end-to-end: create a sandbox merchant at sandbox.payhere.lk, add the domain to get a sandbox secret, set the env vars below with `PAYHERE_SANDBOX=true`, buy Dealer Starter from `/pricing` with a sandbox test card, and check `/checkout/return?order_id=…` shows "Payment received" and the user's plan is `dealer`.

## OPS STEPS FOR SUVEN
1. **PayHere:** sign up (Lite is fine for one-off payments, Plus is needed for recurring and above Rs 200k/month). Under Integrations, add `motormila.vercel.app` and wait for approval to get the **merchant secret**.
2. Set on the HF Space (backend) env: `PAYHERE_MERCHANT_ID`, `PAYHERE_MERCHANT_SECRET` (secret), `PAYHERE_NOTIFY_URL=https://<hf-space-host>/api/v1/payhere/notify`, `PAYHERE_RETURN_URL=https://motormila.vercel.app/checkout/return`, `PAYHERE_CANCEL_URL=https://motormila.vercel.app/pricing?checkout=cancelled`, `PAYHERE_SANDBOX=true` until tested, then `false`. Leave `PAYHERE_PRO_CHECKOUT_ENABLED` unset (Pro is free in beta). Set `PAYHERE_RECURRING_ENABLED=true` only on Plus/Premium.
3. Remove `STRIPE_CHECKOUT_URL` from the HF env if it's set (now ignored).
4. Leads: set `LEADS_IP_SALT` (random string). Add `LEADS_PARTNERS_JSON` after a partner signs. Set `LEADS_DELIVERY_ENABLED=true` only once a signed referral / data-sharing agreement exists.
5. Legal: set `LEGAL_NOTIFY_EMAIL` (where removal and deletion requests go). Create the **privacy@motormila.lk** mailbox, or change `PRIVACY_EMAIL`.
6. Before publishing the legal pages: fill in the effective date, company name and PV number in `LegalPageShell.tsx`, and have a lawyer review them.
7. Check removal requests daily (admin API) and act within 72h. Process account deletions within 14 days.
8. Incorporate (see `docs/business/pvt-ltd-eroc-checklist.md`), then move the PayHere merchant account into the company.

## Not done / TODO
- Admin UI for leads and legal requests (the API exists, but no AdminConsole tab. AdminConsole isn't in this branch's paths).
- Signed-in deletion: backend-sec adds `DELETE /auth/me`. After merge, the `/delete-account` page could call it directly for signed-in users and keep the request form for others.
- Dealer **stock-size limits** (20 / 75) and seat counts aren't enforced in the backend. `plan` is just `dealer`, and the tier is stored on the payment row. Plan expiry (`paid_until`) isn't tracked, so a non-recurring monthly payment never auto-expires. Needs a `platform_users.plan_expires_at` column (auth area).
- Some Dealer tier features on the pricing page and one-pager (per-dealer lead inbox, multi-branch view, verified badge on listings) are roadmap. Ship them or soften the copy before selling Yard.
- Android Pro / Play Billing is untouched (android area).
- Consent text is duplicated in TS and Python, with no automated equality test.
- **Test results on this branch:** new backend tests 26/26 pass. Full `pytest` gives 1130 pass and 2 fail, both of which also fail on base `97ffbee`. `npm test`: 465 pass and 30 fail, and the same 30 fail on base `97ffbee` (api / snapshot / fuel-mix / import-era / district-velocity / listing-card tests: an existing snapshot-vs-live mocking issue, not touched here). `tsc` is clean and `npm run build` succeeds.
- **Merge notes for the integrator:**
  - `backend/app/routers/__init__.py` is also added by the android branch (theirs holds only a docstring, plus `from .routers import play_billing` in main.py). Keep this branch's version. It is a superset, and `play_billing` imports still work.
  - backend-sec rewrites the `billing.py` webhook (replay protection) and docstring. This branch changes only `_checkout_url`, `manual_pay_instructions` label set, `CheckoutIntentResponse` and `checkout_intent`, so take both sets of changes.
  - web-perf touches `src/pages/Pricing.tsx` and `src/lib/pricingContent.ts` (branding / SEO). Expect manual merges there. Keep this branch's prices, `DEALER_TIERS`, `PLAN_PRICES` and `DealerPlans`.
  - `main.py`: two adjacent `include_router` lines from different branches. Keep all of them.
- Pre-existing failures on main (not caused by this branch): `test_new_source_parsers::test_carshop_builds_payload_from_current_detail_shape` and `test_public_browse_paths::test_gated_product_paths_stay_private`.
- Note for backend-sec: `RateLimiter` keys on the bare IP, so every limiter shares one bucket per IP. The new routers namespace their own keys (`_common.scoped_limiter`).
