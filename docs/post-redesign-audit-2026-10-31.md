# MotorMila post-redesign quality audit

Date: 2026-10-31. Scope: repository review of the web shell, navigation, release page, pricing, route inventory and existing overhaul documentation; frontend typecheck, unit suite and npm dependency audit. This is not a visual/device audit, a production health certification, or a backend/payment/security penetration test.

## Direction

Keep the Apex M, Motormila Blue, Ink/Paper themes and Cal Sans. `REDESIGN_SPEC.md` already defines the right north star: calm, editorial, cars and evidence first. Premium quality means complete, trustworthy journeys and predictable interactions, not more glass, more animation or more pages. Preserve the React/Vite + FastAPI architecture and current features.

## Fixed in this pass

- `src/components/Navbar.tsx`: mobile-menu anchors intercepted every click, breaking Ctrl/Cmd/Shift/Alt-click browser navigation. Intercept only unmodified primary clicks. Regression covers modifiers and ordinary in-app navigation.
- `src/App.tsx`: removed a second hash-scroll timer. `ScrollRestoration` already retries lazy anchors and uses the shared motion preference; the duplicate forced smooth scrolling again after 150 ms. Added coverage for a delayed anchor scrolling once.
- `src/pages/MobileApp.tsx`: download metadata was still 1.7.2/build 20 while the updater manifest and Gradle specify 1.8.0/build 21. Aligned version, hash, release date and size. Published APK HEAD returned 200 and 5,800,279 bytes. Certificate fingerprint retained; APK signature was not independently verified.

## Priorities and completion gates

### P0 — trustworthy release and operational readiness

1. **Test-tool dependency advisories.** `npm ci`/`npm audit` report 20 vulnerabilities: 18 moderate, 2 critical package entries (`tinypool` and its parent `vitest`). Critical advisories include GHSA-5gmw-xhrv-c9v3 and GHSA-85c8-ppgw-ccpr. These concern development tooling, not evidence of a production exploit. npm proposes a major Vitest upgrade; do not run `audit fix --force`. Upgrade compatibly with Vite/plugins/Node and validate the suite in a separate focused change.
2. **Data freshness and coverage.** Verify production collector success, snapshot age, listing counts, source attribution, stale-data warnings and snapshot/live parity. Empty SQLite locally is not production inventory. Never use demo rows as real evidence. Gate: recent successful exports plus realistic browse/detail checks with stale and unavailable states.
3. **Billing and entitlement truth.** `PRICING_COMING_SOON` keeps consumer Pro on a waitlist, while dealer tiers can start PayHere/manual-payment flows. This distinction is intentional in code; verify it everywhere, rather than declaring all payments unavailable. Gate: configured payment methods only, sandbox success/cancel/webhook/idempotency and entitlement checks, approved manual-payment/support procedure. Do not promise a two-hour activation SLA unless operations can meet it.
4. **Account and private-data boundaries.** Public browsing and protected Saved/Profile/Dealer/Pro routes are already defined. Validate invite completion, reset, session expiry, sign-out, deletion and cross-user access against the real backend. Do not disable production access controls for preview convenience.

### P1 — premium journey and design consistency

| Journey | Review / improve | Acceptance gate |
|---|---|---|
| Discover → shortlist | Search, suggestions, filter URL state, pagination, source photos/fallbacks, compare tray | Keyboard and touch usable; Back restores the same card; real totals clearly distinguished from sampled/estimated totals |
| Listing → price confidence | Fair range, comparable count, confidence, methodology, history, trust signals, original-source contact | No sold-price claims from asking-price data; insufficient evidence withholds verdicts; failed history is not “no risk” |
| Save → return | Signed-out explanation, sign-in return path, saved listings, saved searches, alert cadence and delivery | Saved intent survives login; create/edit/delete is persistent; configured email/WhatsApp delivery actually arrives |
| Sell → manage | Photo upload, valuation, validation, submission, moderation, My listings and edit/delete | Draft-loss protection where needed; upload failures actionable; publish confirmation agrees with backend status |
| Afford → act | Affordability, ownership costs, transfer kit, finance/inspection/insurance handoff | Assumptions explicit; policy/fees dated and reviewed; partner requests clearly distinguished from confirmed bookings |
| Dealer → value | Stock limits, bulk benchmark, aging, seats/branches, leads and verification | Each advertised tier capability demonstrated for its role; no unsupported “verified” badge or inaccessible paid promise |
| Global chrome | Desktop/tablet/mobile navigation, menu dismissal/focus, bottom dock, compare tray, toast and safe areas | No overlap or obscured focused controls; browser link behavior retained; sensible route/heading focus after navigation |
| Visual system | Light/dark semantic surfaces, Cal Sans scale, card radii, section rhythm and primary CTA hierarchy | One clear hero per page; no card soup; readable chart labels, real prices and long SI/TA text at 200% text size |
| Motion | Hero rotation, entrances, route transitions, photo loading, low-data and reduced-motion behavior | No duplicate motion or scroll owners; loops stop or provide controls where required; no unmeasured speed claims |
| Recovery | Offline/snapshot, zero matches, missing photos, expired sessions, failed uploads/payments | Clear next action and retry; truthful state, stable layout and no fabricated fallback evidence |

These are acceptance checks, not assertions that every listed feature is broken. Code already includes many of the capabilities; demonstrate end-to-end behavior before rebuilding them.

### P2 — feature completion, measured rather than assumed

- Reconcile `docs/next-steps-2026-10.md` against current implementation before adding features. Much of Tier 1 now exists (verdicts, ranges, timelines, trust checks, affordability and sharing-related work).
- Snapshot search completeness: `docs/overhaul/web-perf.md` documents capped per-model/make/district samples and estimated totals. Reproduce current behavior with real snapshot fixtures; either complete indexed pagination or explicitly communicate limits. Do not imply the whole market was searched if only a sample was searched.
- Source photo reliability: placeholders are honest recovery, not successful photo delivery. Measure failed-image rates and fix licensed/cache/proxy delivery at its source.
- EV charging exists at `/ev-chargers`; it is a cached directory/radius plot, not live occupancy. Confirm refresh operation and retain that limitation. The stale comment in `App.tsx` is not evidence the route redirects today.
- Price index redirects to Trends pending sufficient history. Do not fabricate an index to fill the route.
- Translation parity: audit English fallbacks and core search/valuation/error/account flows in Sinhala and Tamil; compare visual wrapping, not just translation-key presence.
- Registry verification, inspection fulfillment, lender/broker partnerships and advanced history require real providers/legal review. A form or risk signal is not a completed verification or booking.
- Platform parity: inspect current Cloudflare/Vercel behavior separately. Older overhaul notes describe different bot rendering/404 handling, and the latest commit removes a listing bot-OG function for Workers quota. Verify current deployment rather than treating old documentation as current proof.

## Release gates for “premium and complete”

1. Passing frontend checks and scoped backend/API tests; no silent skipped failures.
2. Human visual review on representative phone/tablet/desktop widths, both themes, EN/SI/TA, keyboard, zoom and reduced motion. No visual review was performed in this pass.
3. Measured production Core Web Vitals and route/bundle budgets; compare before/after under the same conditions before claiming improvement.
4. Real account, listing, saved/alert and payment journeys on the configured environment, including denial/error paths.
5. Operational owners for freshness alerts, backups/restore, payments, support, data-removal requests and policy updates.
6. Download page, updater manifest and signed release artifacts agree; automate metadata publication to prevent repeated drift.

## Recommended next delivery

First close dependency/security and operational gates, then complete the buyer journey (search → detail → compare/save → alert). Follow with seller/dealer completeness and a focused responsive/a11y visual pass. Preserve existing functionality and avoid another wholesale redesign before these journeys are verified.
