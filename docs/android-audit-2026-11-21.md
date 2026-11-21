# MotorMila Android: full audit and website-parity plan (2026-11-21)

**Version reviewed:** 1.9.1 (versionCode 23, HEAD 94c21d27). This follows `android-ui-ux-audit-2026-11-19.md`, which reviewed 1.8.0.

**How it was done:**
- Code review in five areas: the website benchmark, Home/shell, Search/cards, Detail, and secondary screens plus Sinhala/Tamil.
- Visual comparison of the committed Paparazzi goldens against the live site at 412px (`artifacts/audit/`).
- The Sentry 8.x source, read to confirm the launch crash.

**Limits:** nothing was built or run on a device; this VM has no JDK or Android SDK.

---

## 0. Emergency: 1.9.0 and 1.9.1 crash on every launch

**Root cause (confirmed against the sentry-java source):**
- `sentry-android` ships a manifest entry, `SentryInitProvider`, that starts Sentry automatically before `Application.onCreate` runs.
- Our manifest sets no `io.sentry.auto-init=false` and no `io.sentry.dsn`.
- So `Sentry.preInitConfigurations` sees `dsn == null` and throws `IllegalArgumentException("DSN is required…")`. The process dies before any app code runs.
- Sentry was added in 294389ac, after 1.8.0, so 1.9.0 was the first release to carry it. That matches the crash timeline exactly.
- The two 1.9.1 fixes (shared-element key de-duplication, watchlist undo guard) were real issues, but neither causes this crash.

**Fixed in this branch:** the manifest now sets `io.sentry.auto-init=false`. Sentry is still initialised manually in `MotormilaApp` when a DSN is supplied. `SentryManifestTest` guards against this coming back.

The `fix/1.9.2-remove-sentry` branch also fixes the crash, but it throws away crash reporting. This branch keeps it.

**Exposure right now:**
- `android/latest-release.json` points the in-app updater at the crashing 1.9.1.
- The website shows a "Get the preview" banner that sends visitors to that same download.
- Until a fixed build ships, either repoint the manifest at 1.8.0 or hide the banner.
- When it ships, check that 1.9.2 opens on a real device before publishing the manifest.

**Also fixed here: a crash risk while scrolling Search.**
- Search pages by page number while the scrapers keep inserting new listings.
- With the default "Newest" sort, that pushes a listing that's already loaded onto the next page as well.
- `LazyVerticalGrid` keys items by `id`, and Compose throws "Key was already used" on a repeat.
- `ListingRepositoryImpl.paging` now keeps the first occurrence of each listing id per load. That covers Search, Best Picks and the hubs.

---

## 1. Verdict

- 1.9.0 genuinely closed much of the 11-19 audit:
  - warm palette and the three-role blue
  - 2 columns at 360dp and a real list row
  - sort menu, live search, cards with a "typical price" line and evidence
  - removal of the made-up sell-speed/ad-health pills, and an honest seller fallback
  - undo for Clear all
  - return to the alert form after login, plus a proper 404 page
- The app still feels "mid" next to the site for four reasons:
  1. **It crashes on launch.** Nothing else matters until that's fixed (§0).
  2. **No cinematic moments.** The site's premium feel comes from a photo hero, 48–80px display type, a "stage-ink" dark band and rolling numbers. On the app's Home the first screen is chrome and text, and on Detail the price is smaller than the title.
  3. **Evidence that the site shows and the app hides:**
     - on cards: freshness, "on N sites", price-cut and days-listed badges, the monthly estimate, a sparkline
     - on Detail: comparables count and confidence, the possibly-sold warning, the description
  4. **About a quarter of the app is still on the old design system and partly English.** Insights (the Prices tab), Sell (a tab), Alerts, Login, Calculator and Notifications are still legacy. There are about 686 hard-coded English strings, and Alerts uses only 26 of its 181 translated strings.

---

## 2. Bugs and crash risks (fix before polish)

| # | Issue | Where |
|---|---|---|
| 1 | Launch crash, Sentry auto-init (**fixed here**) | AndroidManifest.xml |
| 2 | Search duplicate-key crash (**fixed here**) | ListingRepositoryImpl.kt `paging` |
| 3 | Plate scan never unbinds the camera, so it can throw `RejectedExecutionException`; OCR boxes are drawn from the unrotated frame | ui/scan/PlateScanScreen.kt:266-317 |
| 4 | The make list isn't de-duplicated but makes are used as list keys (same crash class as #2) | SearchViewModel.kt:164, MakeCombobox.kt:187 |
| 5 | Home scrolls to the top every time you come back once a tab has been re-tapped (the reselect effect fires on fresh composition) | HomeScreen.kt:118 |
| 6 | Tapping Buy while on Search does nothing (it counts as a reselect) | MotormilaNavGraph.kt:126, MmBottomBar.kt:278 |
| 7 | Free users see a locked deal score next to the unlocked verdict, gauge, ladder and share card | DetailScreen.kt:365,400-421,815-829 |
| 8 | The gauge needle stays green while the badge says amber "verify first" (35% or more below typical) | FmvGauge.kt:146-151 |
| 9 | The app has no `description` on `Listing`, so "for parts" or lease ads get a green verdict the website withholds | Listing.kt priceContext |
| 10 | When the main detail call fails but a preview is showing, history and seller stay on "Loading…" forever | DetailViewModel.kt:142-145 |
| 11 | Offline Home shows "0 listed" because its error state is unreachable | HomeViewModel.kt:131,158,232 |
| 12 | Create-alert saves the applied filters instead of the sheet draft, and drops category, fuel and year | SearchViewModel.kt:406-423 |
| 13 | The widget overwrites the last good deal with "no deal" when offline | DealWidget.kt:118-140 |
| 14 | A failed update check reports "up to date"; the download error is silent; two separate update states | AppUpdateViewModel.kt:123-127, NavGraph:141-151 |
| 15 | Saved alert rows send even free channels to the Pro "coming soon" page; free alerts silently get quiet hours turned on | AlertsScreen.kt:474-481, AlertsViewModel.kt:104 |
| 16 | Watchlist Undo restores items with blank make, model and year and a reset price baseline | WatchlistViewModel.kt:201-225 |
| 17 | Duty estimator treats a reconditioned car's asking price, which already includes duty, as the import cost | DetailScreen.kt:1733 |
| 18 | The privacy policy doesn't mention Sentry crash reporting | ui/legal/LegalCatalog.kt |

---

## 3. Website parity: what makes the site "another level"

These are the ingredients from the web benchmark (see `src/styles/tokens.css`, `cinematic.css`, `Dashboard.tsx`, `ListingDetail.tsx`), compared with the app.

| Web ingredient | App today | Port |
|---|---|---|
| Photo hero: night photo, light pools, grain, letterbox reveal, masked word-rise, glowing italic accent word | Text "Find a fair price." at 40sp, featured card below | Full-bleed featured-car hero (about 55% of the viewport) with headline over a scrim, one-time word-rise, accent word in `#5CA5FF` with glow |
| Stage-ink band `#05060B` under the hero and the Detail title, in both themes | none | A `MmColors.stage` token; Detail header and price block on stage |
| Display type: Cal Sans 600, tracking −0.035em, line-height 0.96, word spacing +0.1em, sizes 44/48–80 | No 24 or 44 step; Detail price 30sp | Add `title2 24`, `large 44`, `hero 52`; Detail price at 44sp; letter-spacing −0.03em |
| Labelled stat strip with rolling numbers (LIVE ADS / SOURCES / PRICE RECORDS) | Three unlabelled numbers | Uppercase captions over rolling tabular numbers |
| Eyebrow = hairline + uppercase label; hairline grids instead of boxes | Mixed dot/uppercase; boxed tiles | One `MmEyebrow` component; spec grid drawn with 1px hairlines |
| Card: 16:10 swipeable photo, condition chip, year on the right, est./mo, badge row, sparkline, "Listed on X · checked Y" | Static 4:3 photo, verdict pill covering about 60% of the photo | 16:10 pager; move the verdict off the photo to sit under the price; condition chip on the photo; add the est./mo and badge row; equal-height cells |
| Detail: eyebrow → title · year → meta row → "ASKING PRICE" eyebrow → 38–52px rolling price → AI-value meter → est./mo → chips → spec grid → typical-price card (comparables count, confidence) → timeline | Badge above the title, small price, "View on source" three times, Unknown spec tiles | Re-order to match the web; one call to action (the sticky bar); hide unknown specs; comparables and confidence on the price card; freshness and possibly-sold warning |
| Header that hides on scroll; pill tab bar with an icon hop | Search header is a fixed stack of about 265dp (6 rows) | Collapse the Search header on scroll; fold the free-plan note into the sort lock |
| One easing curve `(0.32,0.72,0,1)` | MmMotion matches, but 3 other motion systems remain | Delete `Motion.kt`, `MotionTokens` and `core.motion` |

---

## 4. Plan

**Release 1.9.2 (now):**
1. Ship §0 (Sentry flag plus de-duplication) and verify on a real device.
2. Repoint or keep `latest-release.json` accordingly.
3. Bugs #3–#6.

**1.10 "Showroom" (1–2 weeks):**
- Home photo hero, labelled stats, inventory before tools, varied section rhythm.
- Seed `ListingPreviewCache` from the Home rails so the card-to-detail morph lands.
- Detail re-ordered with a 44sp price on the stage band, an evidence strip and one call to action.
- Card re-anatomy (16:10 photo, verdict under the price).
- Collapsing Search header.
- Cold-start light flash: add `values-night/themes.xml` with `#0C0A09`.
- Bugs #7–#12.

**1.11 "One app" (2–3 weeks):**
- Migrate Insights, Sell, Alerts, Login, Calculator and Notifications to v2.
- Wire the 155 unused Alerts strings; extract roughly 686 literals, starting with Insights, Alerts, Login, Pro and Legal.
- Replace `ErrorRetry` with typed `ErrorState`; route snackbars through `AppError.messageRes()`.
- Auth: email check, confirm password, keyboard types, autofill. Delete the dead biometric code.
- Compare TalkBack row semantics.
- Add an Android i18n CI gate.

**Infrastructure (keeps it from sliding back):**
- Committed goldens at 360dp, in si and ta, with real photos, for Watchlist, Alerts, Compare, Insights and Login.
- A release smoke test that installs the release APK on an emulator and checks for a launch crash. That would have caught §0.
- Fix the Firebase Test Lab APK path for the flavoured builds.
