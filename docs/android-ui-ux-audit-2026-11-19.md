# MotorMila Android — UI / UX / Visual Audit

**Date:** 2026-11-19 · **Release reviewed:** 1.8.0 "night-showroom" (versionCode 21, tag android-v1.8.0)
**Method:** design review (native Android — automated web detector not applicable). 8 parallel evidence agents (website benchmark; home/chrome/nav; search/filters/cards; detail; compare/alerts/watchlist/auth; theme/motion drift quantification; secondary-screen inventory; docs/build/i18n/test infra) + parent visual pass on Paparazzi goldens and marketing renders, computed WCAG contrast, and source verification. Two lanes (search, detail) hit model rate limits mid-run; their analyses were recovered from transcripts and re-verified against source by the parent.
**Benchmark:** the live MotorMila website (`docs/REDESIGN_SPEC.md`, `src/index.css`, `src/styles/tokens.css`, `src/styles/type-scale.ts`, `src/lib/motion.ts`, `src/pages/Dashboard.tsx`, `src/components/ListingCard.tsx`).
**Testing limits:** no emulator/device run. Evidence = source code + 30 committed Paparazzi goldens (Pixel 6 412×915dp, English, reduced-motion, null-image fixtures) + 5 real marketing renders (`assets/mobile-app/*.webp`, 1080×2400 emulator captures of v1.8.0 live data, shown on `/mobile-app`). Goldens misrepresent production in known ways (see §8). Runtime claims (cold-start flash, TalkBack traversal, blur cost) are code-inferred, not device-measured.

---

## 1. Verdict

**The app is not architecturally "mid" — it is an unfinished design migration with a trust and localization debt.** The v2 foundation (semantic tokens, Cal Sans + Noto si/ta, real Haze liquid glass with fallbacks, a unified price-verdict engine, disciplined spring motion, robust navigation) is genuinely strong and in places flagship-grade (Compare matrix, filter live-count CTA, card→detail container transform). But:

- The website evolved into a **warm night-showroom art direction** (asphalt `#0C0A09`, ivory text, three-role blue, 48–80px cinematic heroes, evidence-rich cards). The app ported the **October brand-bible tokens** (neutral Ink `#09090B`, single `#0A7AFF`, 32sp hero, thin cards) and never ported the composition. That divergence is the single biggest reason the app reads "mid" next to the site.
- **32.5% of UI files (53/163) still run the legacy system** — two deal-greens, two blues, four motion systems, five press scales, two shape scales, fake no-blur "glass" cards (69 call sites) next to real blur chrome.
- **~17% of UI text is hardcoded English** (192 Text literals + 64 contentDescriptions) and **119 Sinhala / 122 Tamil resource values are byte-identical English copies** — including account-deletion, billing-checkout and notification-permission consent copy. A si/ta user gets a translated Browse/Compare and an English Alerts/Watchlist/Auth/error layer.
- **Trust leaks**: fabricated "sell speed / ad health" scores, a default "Verified Seller" claim, an import-duty calculator that treats a used car's asking price as CIF, an In-app alert channel silently dropped on save, "FMV" wording the verdict policy bans.
- **Core browse mechanics fail on the dominant device class**: ≤393dp phones get ONE column and a dead grid/list toggle; Home rail cards skip the flagship shared-element morph; half the sort options and the create-alert action live off-screen.

**Design Health Score: 20/40 — Acceptable** ("significant improvements needed before users are happy"). For an English-only Pro user on a ≥412dp phone the experience scores ~28; for a Sinhala free-tier user on a 360dp phone it scores ~15. The composite reflects the unfinished migration, not a broken core loop.

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Excellent skeleton/error/empty/offline phases, watchdog, live counts — but Detail secondary loads stick at "Loading…" forever; no result count / end-of-list; tab badge counts invisible to TalkBack |
| 2 | Match System / Real World | 2 | Strong SL domain fit (CBSL, CR/NIC safety, districts, Rs Mn) — undermined by "FMV"/"sell speed" jargon, ISO dates, steering-wheel copy for a bookmark, English walls in si/ta |
| 3 | User Control and Freedom | 2 | Predictive back + tab restore + removable filter chips are good; ClearAll is one-tap irreversible, alert draft orphaned after login, grid toggle + tab reselect are dead controls |
| 4 | Consistency and Standards | 2 | v2 screens cohere; 53 legacy files, two greens/blues on one Detail page, 4 motion systems, fake vs real glass, Watchlist/Alerts/Auth read as a previous-generation app |
| 5 | Error Prevention | 1 | Signup typo = permanent lockout (no confirm/verify/reset); free-text alert make/district + silent Colombo default = dead alerts; ClearAll unguarded; In-app channel deceptively dropped |
| 6 | Recognition Rather Than Recall | 2 | Labeled tabs + active-filter chips + suggestions; but card verdict has no typical-price anchor and no on-card "Why?", sort/alert hidden off-screen, recents session-only |
| 7 | Flexibility and Efficiency | 2 | Voice search, plate scan, QS tile, widget, deep links are real accelerators; submit-only search, dead grid toggle, no bulk/sort on watchlist, no autofill/IME on auth |
| 8 | Aesthetic and Minimalist Design | 2 | Calm tokens and tidy Home — but no photographic hero or scale contrast, Detail "card soup" (two always-open calculators bury history/seller), 6 chrome rows on Search, uniform 6-tile grid |
| 9 | Error Recovery | 2 | Calm auth/server copy + retry + offline cache exist; 404 collapses to generic "Something went wrong" + futile Retry, any seeded error mislabels as "offline", secondary loads swallowed, raw exception leak, no undo anywhere |
| 10 | Help and Documentation | 2 | Why-sheet + Before-you-pay are excellent contextual help; Docs/Legal/Pulse guides are English-only Kotlin constants, privacy policy untranslated in a trilingual app |
| **Total** | | **20/40** | **Acceptable** |

---

## 2. Design specificity verdict

**Specific in motion and data; interchangeable in composition.** The alloy-wheel pull-to-refresh, fly-to-tray compare flight, price-drop ticker choreography, single-verdict engine and Sri Lanka-specific safety content are authored for this product — no generic template has them. But the *visual world* is a category-standard dark dashboard: neutral charcoal cards at one elevation, six equal icon tiles, a 32sp text hero, no photography above the fold, no oversized number moment. The website's premium feel comes from art direction (warm asphalt/ivory, cinematic photo hero, dramatic scale contrast, hairline editorial rhythm, evidence-rich cards) — none of which crossed over. The app's own `MmColors` comment claims "matching the web"; that is true only for the deal tones.

Deterministic scan: not applicable (native platform).

---

## 3. What's working (keep these)

1. **One price verdict, everywhere.** `PriceVerdicts.resolve` computed once per detail and handed to badge, ring, gauge, ladder, Why-sheet and share card so they cannot contradict; withheld verdicts get an honest explanation instead of a fake number; ≥35% below flips to amber "verify first" (scam-aware); lease takeovers get no price verdict; the Why-sheet states the asking-not-market-value caveat with comparables count. Fully localized en/si/ta. This is the product's soul — protect it.
2. **Motion craft with reduced-motion parity.** Card→detail container transform (unified 360/0.88 spring, predictive-back seekable, animated 24→0dp corners, `ListingPreviewCache` so Detail's first frame is real content), 45% gallery parallax + rubber-band over-pull zoom, once-per-drop 900ms strike→roll→green-wash→haptic ticker (reduced path still shows the struck old price), draw-phase-only shimmer, fly-to-tray Bézier. The alloy-wheel PTR is a brand signature.
3. **Real material system + flagship Compare.** Haze 1.5.4 backdrop blur in three weights with API<32 denser fallback and a fully-opaque reduce-transparency mode (in-app switch + system high-contrast); scroll-minimising tab bar with a stretching selection pill. Compare matrix: sticky label column AND sticky car header on one scroll state, diff dots + best-value tinting, "Only differences" filter, unit-tested pure logic, full si/ta, 48dp targets. Filter sheet: debounced 300ms live backend count with "Counting…" state, per-section reset, pinned 48dp "Show N results" CTA, accessible dual-knob slider with per-knob TalkBack setProgress.

---

## 4. Priority issues (5 clusters, all P1)

### P1-A · Port the website's art direction, not just its tokens
**What:** The app runs the October brand-bible palette and a compressed type scale while the live site runs a warm night-showroom system with cinematic heroes and evidence-rich cards.
**Evidence (verified):**
- Ground/text: app `MmColors.Dark` bg `#09090B`, text `#F5F5F7`, surface `#111114` (neutral) vs web `.theme-dark` bg `hsl(24 16% 4.2%)`=`#0C0A09` (warm asphalt), fg `#F8F5F2` (ivory), card `#14110F`, warm hairlines `hsl(32 18% 88%)/0.05`. Light: app `#F5F5F7`/white vs web warm plaster `#FAF8F6`/`#FDFDFB`.
- Blue roles: web splits `--primary` FILL `#006AEB` dark / `#0067E6` light (white text 4.93/5.14 ✓), `--primary-text` `#5CA5FF`/`#0060D6` (7.79/5.42 ✓), `--brand-blue` `#338FFF` mark/decoration ONLY. App uses `#0A7AFF` for fill+mark → **white-on-brand 4.01:1 FAILS AA** on every primary CTA, Compare CTA, selected chip, filter count badge (14sp semibold < large-text threshold). `brandPressed #0868D9` = 5.26 ✓ already exists.
- Text tiers: app `textTertiary #71717A` = 4.12/3.90/3.66/3.27 on dark surfaces (FAIL for 12sp captions); light `#8A8A94` = 3.14/3.42/2.93 (FAIL even 3:1 on surfaceHigh). Web `--muted-foreground #ACA39A` 7.96 ✓, `--label-3 #8A8075` 5.10/4.86 ✓. Carries stat captions, card meta, filter summaries, chart dates, placeholders.
- Type scale: web caption12/footnote13/body15/callout17/title3 20/title2 24/title1 32/large44/hero clamp(48,1.6rem+3.9vw,80) lh1.02 + display word-spacing +0.1em. App displayL40/displayM32/titleL26/titleM20/titleS17/body16/15/13 — no 24/44 steps; **Home hero = displayM 32sp vs web mobile hero ≥48px**; **Detail price = hardcoded 26.sp** (`DetailScreen.kt:770-775`) under a 20sp title vs web 38–52px "Asking price" hero; app's own priceL30/displayL40 unused; price duplicated in sticky bar.
- Card substance: web `ListingCard.tsx` = 16/10 swipeable photo, condition chip, title callout17, year .num, spec line, **price title2 24 .num + monthly estimate**, DealBadge, badge row (archived/price-drop/days-on-market/on-N-sites), **"Typical {price}" + market-position bar**, 56×18 sparkline + "n price changes", district + "Listed on {source} · checked {ago}" footer; no-photo fallback = vehicle silhouette plate. App card = single static 4:3 photo + badge + title15 + price20 + one meta line; **no typical-price anchor, no bar, no sparkline, no source freshness; badge not tappable (onWhy wired only in Detail)**; fallback = Apex M wordmark tile.
- Home composition: web Dashboard = full-bleed cinematic night-photo hero (letterbox curtain, exposure lift, grain, masked word-rise, credits stat strip) → inventory → market-pulse tiles with thumbs → trust bar → Pro panel low → tear-off poster footer; sections py-14/20 (56–80px), dot-eyebrow SectionHeader (display-2 32px H2 + description). App Home = banner → wordmark+bell → 32sp text hero → search pill → 3-number strip → six equal shortcut tiles → rails; uniform 24dp gaps; photography only below the fold; no eyebrow/description; no focal point.
**Why it matters:** This is the owner's "mid vs website" feeling, made concrete. The app asserts verdicts without the visible evidence the web card argues with, and never delivers the brand's "one huge number / one hero per view" drama. The contrast failures are also the spec's own non-negotiable (§6).
**Fix:** (1) Refresh `MmColors` to the web's warm grounds/ivory text/warm hairlines and the three-role blue split (fill `#006AEB`/`#0067E6`, text `#5CA5FF`/`#0060D6`, mark `#338FFF`); raise textTertiary to ≥4.5 both themes (or use web label-3 values). One token pass fixes brand-fill + tertiary + teal-pill contrast together. (2) Add the missing type steps (24/44) and promote Home hero to ≥40sp display + Detail price to priceL/displayL with the existing localized `mm_detail_asking` eyebrow; keep the sticky-bar price compact-only. (3) Add one quiet evidence line under the card price ("Typical Rs 7.2 Mn" + 1.5dp market-position bar), make the on-photo badge tappable → same Why-sheet, add source+checked-ago footer and drop badge where data exists; reorder meta to lead with district. (4) Give Home one art-directed photographic hero moment (a featured car + its verdict, or a night-showroom banner) and vary section rhythm/weight; demote the 6-tile grid to 4 + overflow. (5) Replace the wordmark error tile with a vehicle-silhouette plate.
**Commands:** `/impeccable colorize` (palette+contrast) → `/impeccable typeset` (scale+hero) → `/impeccable layout` (home composition, card evidence) → `/impeccable bolder` (photographic hero drama).

### P1-B · Stop the trust leaks — the honest-data brand is undermined by its own UI
**What/ Evidence (verified):**
- **Fabricated intelligence pills** (`DetailScreen.kt:942-977`): sellSpeed = `(dealScore ?: 7.5)*2.5+68` clamp 30..96; adHealth = field-presence sum (15+14×5+15) fallback 71; mileage pill asserts "looks typical" when mileage/year are absent. Rendered as "89 SELL SPEED / 71 AD HEALTH" in off-brand sky-teal `#38BDF8` (`Color(0x2E38BDF8)` + `MotormilaTeal`) — **light-mode contrast 1.86:1 (teal) / 1.88:1 (amber), effectively unreadable**; dark 6.59/6.55 fine.
- **"Verified Seller" by default** (`DetailScreen.kt:2046,2055`): `seller?.sellerName ?: "Verified Seller"` + "Direct Seller" shown while loading OR failed — and `loadSeller` swallows exceptions, so the false claim can persist forever. Badges two lines below are correctly source-gated ("never invented").
- **Import-duty estimator on every listing** (`DetailScreen.kt:399-405,1661`): treats a registered used car's asking price as CIF (`baseCif = asking`) and stacks CID/Excise/SSCL/VAT/Luxury on top — financially misleading even with the INDICATIVE pill. Lease calculator caption says "CBSL-oriented max LTV 40%" while the slider allows 10–80% down (contradiction). Both ~600dp cards always open → bury price history, seller and similar listings ("card soup", REDESIGN_SPEC §3).
- **In-app alert channel silently dropped** (`AlertsScreen.kt:264-270` renders it selectable for everyone, default on; `AlertsViewModel.kt:75` adds 'inapp' only if isPro) — the saved alert comes back without what the form showed selected.
- **"FMV" wording** (`WatchlistScreen.kt:266,272` "under FMV"/"FMV {price}") contradicts the verdict policy "never market value" (`MmDealVerdict.kt:17-18`); empty state tells users to "tap the steering wheel" when the save control is a bookmark.
- **Stale Pro copy**: Alerts upgrade CTA says Pro is "coming soon" despite a live Pro screen; free cap = 1 alert including paused.
**Why:** Fake precision sits directly under an honest verdict system; a buyer could act on these numbers. False verification claims and misleading tax math erode the exact trust the verdict architecture earns. Deceptive channel state is a dark pattern.
**Fix:** Delete the pills or replace with real backend signals (if a completeness heuristic stays, label it "Ad completeness", no number when inputs missing, never assert "typical" without data); use theme-aware deal/brand tokens. Neutral seller fallback ("Seller on {source}") until loaded; reserve "Verified" for source-reported badges. Gate the duty estimator behind import/reconditioned context or move to Tools; clamp the lease slider to the CBSL-consistent range or relabel generic; collapse both behind expandable rows by default. Decide the in-app channel policy and apply it in form AND row (free → make it free, or lock the chip with upgrade affordance); never persist a subset of displayed selections silently. Replace FMV→"typical", fix the bookmark copy, update Pro copy.
**Commands:** `/impeccable harden` + `/impeccable clarify`.

### P1-C · Finish localization — si/ta users get English at the worst moments
**Evidence (verified counts):**
- 192 hardcoded `Text("…")` + 64 `contentDescription="…"` literals in ui/ (932 stringResource calls exist → ~17% unlocalized). Worst: AdminScreen 61, InsightsScreen 35, DetailScreen 30, AlertsScreen ~40, ProScreen 22 (paywall value prop), LegalScreen 22 (full privacy policy), NotificationsScreen 8 (zero stringResource), DocsScreen 12 (help catalog is Kotlin constants).
- Key parity is 100% (si/ta each have all 1008 translatable keys) **but 119 si / 122 ta values are byte-identical English**; 83 are sentence-level in `overhaul_strings.xml`: account_delete_body, billing_continue_checkout, notif_permission_title/body, ui_auth_email, update_install_permission_hint, offline_cached_data… → **consent, payment, account-deletion and install-permission copy renders in English**.
- `ErrorMapper.kt:22-41` English-only feeds every screen's snackbars/ErrorRetry; `ErrorState` (States.kt:279-333) headings/bodies/buttons all English and **classifies errors by sniffing English substrings** ("reach", "timed out", "Unauthorized") — localizing messages later would silently break routing. ViewModel fallback literals across Alerts/Watchlist/Compare/Auth/Search.
- No Android i18n CI gate (web ci.yml has Key Parity + Untranslated --strict).
**Why:** Sinhala/Tamil are registered locales and core audiences. A screen that switches language mid-scroll reads unfinished; untranslated consent/payment copy is a trust/legal comprehension gap, not a missing-key gap.
**Fix:** Extract literals to strings.xml (Admin+Insights+Detail = 66% of the debt first); genuinely translate the ~83 overhaul keys + residuals; whitelist intentional identicals (brand names, CVT, SSCL/VAT, CBSL/DMT, WhatsApp). Make AppError carry a string-res id (or map at the UI edge) and replace substring classification with the typed enum. Add an Android CI step mirroring ci.yml: key-parity + untranslated-value check with allowlist. Localize semantics labels too (they're both i18n and a11y defects).
**Command:** `/impeccable harden` (i18n/edge cases) + `/impeccable clarify` (copy).

### P1-D · Fix the core browse loop on the dominant device class
**Evidence (verified):**
- **Grid/list toggle is a no-op ≤393dp** (`SearchScreen.kt:310,356`): `GridCells.Adaptive(172dp)` + 20dp gutters + 12dp gap → 320/360/393dp = **1 column**; 2 cols need ≥396dp. List mode = `Fixed(1)` of the SAME card; `MmListingRowSkeleton` defined, **zero call sites** — no row variant ever built. Goldens/marketing are Pixel 6 412dp → show 2 cols; most SL budget phones (360dp) get one column of giant cards and a dead toggle.
- **Home rail cards skip the flagship morph**: `HomeSections.RailCard` registers no sharedBounds; Home navigates `ListingDetail(id)` without `fromCard=true` (`MotormilaNavGraph.kt:287`) → navKind=PUSH generic slide, while Search/hub cards morph. The signature transition is absent exactly where most browsing starts.
- **Sort/alert reachability** (`SearchScreen.kt:680-734`): filter button + 5 sort chips + AddAlert in a weight(1f) LazyRow; even at 412dp Price↓ is clipped ("Pric…"), Low-km and create-alert fully off-screen. Free-tier Best-deal tap → silent downgrade to newest + scolding error toast; chip carries no lock.
- **Submit-only search**: debounce(300) drives suggestions only; grid stays on old query until IME Search; suggestions open Detail directly with no "Search for q" row; recents in-memory take(8)/displayed take(5), no prune, lost on process death.
- **Meta truncation**: `metaLine` order year·km·fuel·trans·district,city maxLines=1 → at 180dp cells district/city NEVER visible ("2018 · 48,000 km · Hybr…"); titles cut at one line (2 only >1.3 fontScale).
- **Chrome density**: up to 6 permanent rows before first result (OfflineBanner + SearchBar + free-plan note + CategoryChipRow + SortFilterRow + ActiveFilterChipsRow); golden fixture omits category row + free-plan note → understates production.
- Dead controls: active-tab reselect no-op (`onReselect` never wired to scaffold); "See all" on Most-listed-models → blank Search (`MotormilaNavGraph.kt:290-296`); Sell tab root carries a back button; "Show cached results" actually re-hits network (`onShowCached = items.retry()`); no result count / end-of-list footer.
**Why:** On the majority install base the promised browse density never appears, the flagship motion is missing from the main surface, half the sorts and the entire alert-from-filters feature are undiscoverable, and the most decision-relevant meta (location) is always clipped.
**Fix:** Lower adaptive min to ~156dp (or Fixed(2) + compact card) so 360dp gets two columns; build a true list row (112×84 thumb + title/price/meta, reuse the skeleton geometry); hide/disable the toggle when a mode can't change column count. Wire `fromCard=true` + sharedBounds on Home rail cards. Replace the sort chip row with a compact sort menu showing the active sort (all 5 reachable in one tap); move create-alert into the filter sheet near the apply CTA; lock-icon the Best-deal chip for free users → upsell sheet, not error toast. Debounce keyword into the paging key (~400ms) OR pin a "Search for q" row; persist recents (DataStore/SavedStateHandle) with per-row remove + clear history. Reorder meta to lead with district (or two quiet lines); allow 2-line titles in grid. Collapse the free-plan note into the locked chip; merge category into the filter sheet on narrow screens. Wire onReselect→scroll-to-top; fix See-all trends route; remove Sell back button; make Show-cached actually show cache; add a result count + end-of-list footer.
**Commands:** `/impeccable layout` + `/impeccable adapt` + `/impeccable optimize`.

### P1-E · Catch users when they fall — destructive actions, recovery, auth, accessibility
**Evidence (verified):**
- **ClearAll wipes the watchlist in one tap** (`WatchlistScreen.kt:96-102` → VM:107-114 → `DELETE FROM watchlist`), no confirm, no undo — destroys every add-price baseline that powers drop badges. Swipe-remove and alert-delete also have no undo. ClearAll icon sits adjacent to Refresh.
- **Sign-in round-trip orphans the alert draft**: signed-out user fills the form → Create blocked → Login → `onLoggedIn` navigates Home (`MotormilaNavGraph.kt:272-277`), no returnTo mechanism; draft survives in the back stack but nothing surfaces it. The core conversion moment leaks. Form stays fully editable before the gate is revealed.
- **Signup typo = permanent lockout**: no email-format validation, no confirm-password, no verification email, no self-serve reset ("Forgot password?" → transient snackbar "ask your admin", no contact action). Web shipped verification+reset (commit 7fa3e38b); Android `AuthRepository` has neither. **Biometric is dead wiring** — LoginScreen receives `onBiometricAuth` but never calls it; settings toggle removed; no app-lock at all. Auth fields lack Email/Password keyboard types, autofill hints, IME submit.
- **Recovery dead-ends**: Detail secondary loads (`loadSimilar/loadHistory/loadFmv/loadSeller`) all `catch(_:Exception){}` → permanent "Loading price history…"/"Loading seller profile…"; 404 → generic "Something went wrong" + futile Retry (typed AppError.NotFound exists in the data layer but the UI loses it); with a card seed, ANY error renders seeded content + a static OfflineBanner labeled "offline" even for 404/5xx (no retry/dismiss wired); toggleWatch failures silent; ErrorState generic branch shows the RAW exception message.
- **Accessibility**: white-on-brand 4.01 + textTertiary 3.1–4.1 + teal pills 1.86 (see P1-A); **Compare matrix TalkBack reads ALL labels then ALL values** with no row association (`CompareScreen.kt:259-294`, no mergeDescendants/row headers) — flagship feature unusable non-visually; diff dots/best-value are color-only; ListingCard `mergeDescendants=false` → name+price read twice, verdict omitted from primary label; tab badge counts overridden by merged contentDescription; **8 components/10 sites sub-48dp** (MmChip 36, FilterSheet Reset/Show-all/segmented 40, combobox rows 44, active chips 36, banner dismiss 32, Why-pill ~26, detail glass buttons 44, MmScreen back 44); **MakeCombobox expand/collapse is the one truly unlabeled interactive control**; **reduced-motion holes**: MarketLivePill infinite pulse on Login (no gate), PillTabs indicator/label, MakeCombobox dropdown, `MmMotion.itemPlacement` (used ungated in Watchlist); haptics split-brain (26 ungated HapticHelper sites still buzz with animations off; CONFIRM/REJECT no-op API<30; DetailScreen uses 4 haptic paths).
**Why:** Irreversible loss of the app's longitudinal asset, a leaking conversion funnel, a lockout path, and a flagship comparison feature that screen-reader users cannot use — these are the moments users contact support about.
**Fix:** Confirm dialog ("Remove all 12 saved cars? Price-drop history will be lost") + Undo snackbar (retain entities until expiry) for ClearAll; Undo for swipe-remove/alert-delete; move ClearAll to overflow/management mode. Pass returnTo through Login and pop back to Alerts; collapse/disable the form until authenticated; preserve the draft explicitly. Add confirm-password + email-format validation + a persistent reset contact card now; ship self-serve reset/verification to match web; wire biometric app-lock or delete the dead plumbing; add keyboard types/autofill/IME. Tri-state (loading/loaded/failed) each Detail payload with inline retry; dedicated "This listing is no longer available" + Back-to-search for NotFound; wire OfflineBanner onRetry and only show for genuine network errors; surface save failures; typed error enum → localized copy, never raw messages. Compare: per-row `semantics(mergeDescendants=true)` with "Price: Toyota Aqua Rs 6.95 Mn, best; …" + spoken best/differs states; merge card semantics into one composed description incl. verdict; announce badge counts; `minimumInteractiveComponentSize(48dp)` at the 10 sites (keep small visuals); label the combobox toggle + stateDescription/Role.DropdownList; gate the 4 reduced-motion holes; route all haptics through MmHaptics.
**Commands:** `/impeccable harden` + `/impeccable onboard` (auth/first-run) + `/impeccable audit` (a11y).

---

## 5. Persona red flags

**Casey — distracted mobile buyer (360dp, one-handed, interrupted, slow net):** grid/list toggle does nothing on her phone; six chrome rows eat 30% of the viewport before the first car; Price↓/Low-km/create-alert are off-screen; district is always ellipsized away; sort chips are 36dp targets; one mis-tap on ClearAll (next to Refresh) permanently destroys her saved cars and their price baselines; she fills an alert, signs in, and lands on Home with the draft orphaned; on a Sinhala UI the error snackbar and consent copy are English; cold start flashes light before the dark app.

**Jordan — first-timer:** the card says "Rs 0.75 Mn below typical" with no typical price shown and no tappable explanation — he can't check the claim; "89 SELL SPEED / 71 AD HEALTH" look like data but are formulas; the seller card reassures "Verified Seller" before any verification loaded; the chart is an unlabeled green line with a raw ISO date; the watchlist empty state tells him to tap a steering wheel that doesn't exist (it's a bookmark); "FMV" is unexplained jargon; one mistyped password at signup locks him out until human intervention; Docs/privacy policy are English-only.

**Alex — power user:** search is submit-only (no live results), recents vanish on process death with no prune; no bulk actions or sort on the watchlist; re-tapping the active tab does nothing; "See all" on trending models dumps him on a blank Search; compare caps at 4; auth fields have no autofill/IME action; the grid toggle is dead; "Show cached results" secretly re-hits the network.

**Project persona — Sinhala used-car buyer on a 360dp Android, 3G:** combines the worst: English consent/error/auth layer, one-column browse, dead alerts from free-text "Toyata"/silent Colombo default, misleading import-duty math on a registered car, light-flash cold start, dark-only English widget showing stale deals silently, and a paywall whose value proposition is hardcoded English.

---

## 6. Minor observations (P2/P3 backlog — full list in §7)

- Save-burst fires **Tailwind blue `#3B82F6`** (not brand `#0A7AFF`) + `#FFC53D`, 560ms (>web 500ms budget), ~27.5% overshoot; `mmWobbleOnSelect` ±3° on EVERY chip select (spec: bouncy only after flick/drag).
- Five press scales in the wild (0.88/0.92/0.95/0.96/0.97); two shape scales (MmShapes 10/14/18 vs MotormilaRadius 12/16/20; M3 mapped to legacy → stock widgets 2dp rounder); `MmShapes` comment claims mirroring — false.
- **Fake glass**: `Glass.kt` defines a SAME-NAME `Modifier.liquidGlass` (no blur, 80% fill) used by MotormilaSurface (69 call sites) — content ghosts through cards next to real Haze chrome; compile-time overload trap. **Translucent stacking** (spec §3 ban): CompareTray glass on tab-bar glass + glass snackbar = 3 layers; FilterSheet 55–72%-alpha sections inside a glass sheet.
- Motion drift vs web: Base 280 vs 260, Slow 450 vs 400, Standard (0.2,0,0,1) vs (0.32,0.72,0,1), Exit (0.4,0,1,1) vs (0.3,0,1,1), snappy/gentle overshoot ~1.5% where web bounce=0; 4 coexisting motion systems + 3 reduced-motion readers (theme override never reaches applePress/core.motion).
- Skeleton fidelity: Home `LoadingSkeletonCard` = legacy bento (headline+4 tiles) vs real 3-stat strip; Detail skeleton 2×3 spec grid vs real 3×2, non-immersive top, no sticky-bar placeholder → visible reflow when data lands.
- **Cold-start light flash**: system splash + window pinned light `#F5F5F7` (values-v31, no values-night) while app defaults dark → light→dark double-splash on every default cold start.
- Widget: RemoteViews (not Glance), dark-only `#FFFFFF` hardcoded, English worker labels baked into DataStore (can never localize), stale-on-failure with no freshness cue, picker preview = launcher icon. QS tile hardcodes "Scan plate" despite translated `R.string.tile_scan` + uses AOSP camera icon.
- AnnouncementBanner: maxLines=1 ellipsizes ~100-char si/ta messages; dismiss 32dp, CTA ~31dp, no Role.Button; shows even offline.
- Splash AVD itself is excellent (900ms draw-up, reduced 200ms fade, parallel session gate) — only the system-splash theme is wrong.
- Stale comments/docs: HomeScreen header describes a removed "Cinematic Hero Header / Live Feed Ticker"; "22dp rhythm" comment vs 24dp token; compare "max 3" comments vs MAX_COMPARE_IDS=4; `android/README-WINDOWS-BUILD.md` materially stale (Gradle/AGP/SDK/minify/billing claims wrong); `baselineprofile/build.gradle.kts:7` references a deleted workflow.
- Legacy dead code kept alive by tests: HeroStatsCard/PriceDropCard (HomeScreen), HowItWorksBand, ContextCapsuleBadge, MotormilaHero, unused `live` param + feedQuery (60s poll), MotormilaPredictiveBackTransform. InsightsScreen has its OWN user-visible legacy PriceDropCard (English semantics, raw ISO date).
- Two chrome languages: v2 MmTopBar vs legacy MotormilaTopBar floating pill (hardcoded "Back") on BestPicks/EvHub/Calculator/Docs/Permits/Pulse/Legal/Admin; Login leaks English tagline "Sri Lanka Vehicle Market Intelligence", "LIVE" pill, "INVITE-ONLY INTELLIGENCE" eyebrow; BrandLogo TalkBack label wrongly "Browse the market".
- EvChargers status line always green even for "Status unlisted"; Dealer shows the same error twice (snackbar + inline) and displays a raw claim-token fragment; Tools `titleS.copy(fontSize=bodyL.fontSize)` hack.
- Compose BOM 2025.02.00 (~21 months old) pins Haze 1.5.4; Noto script Bold synthesized from 600; API 26–28 rely on OEM system Noto; .git grown 144→274MB (filter-repo purge still unexecuted).

---

## 7. Quantified drift inventory (agent grep census, ui/ 163 files)

| Metric | Count | Worst files |
|---|---|---|
| Files referencing legacy Motormila* tokens | 53/163 (32.5%), 1376 refs | MotormilaChrome.kt (~170 downstream call sites), AdminScreen, InsightsScreen, AlertsScreen, WatchlistScreen, LoginScreen, DetailScreen, CalculatorScreen |
| Hardcoded `Color(0x…)` outside theme | 28 in 15 files (+29 named Color.*) | HomeScreen 7, MotormilaChrome 3, ListingCard 3, DetailParts 2, MmMotionKit 2 (burst `#3B82F6`), DealBadge 2 |
| Hardcoded `fontSize = N.sp` outside theme | 171 | AdminScreen 47, MotormilaChrome 25, InsightsScreen 12, PulseGuide 10, Permits 9, EvChargers 8; extremes 8.5sp/9sp (BrandLogo) |
| English `Text("…")` literals | 192 | Admin 61, Insights 35, Detail 30, Alerts ~40, Pro 22, Legal 22, Notifications 8 (0 stringResource), Docs 12 |
| English `contentDescription` literals | 64 | States 7, Pro 7, Insights 6, Watchlist 6, Alerts 5 |
| si/ta resource values identical to English | 119 si / 122 ta (of 1008 keys) | overhaul_strings.xml 83 sentence-level (consent/billing/auth/update) |
| Motion systems | 4 (MmMotion 125 refs; apple family 50/10 files; MotionTokens 18; core.motion 21) + 3 reduced-motion readers | — |
| Haptic paths | 4 (MmHaptics 22 gated; HapticHelper 26 UNGATED; LocalHapticFeedback 3; direct 1) | DetailScreen uses all 4; Calculator 6 ungated |
| Sub-48dp interactive targets | 8 components / 10 sites | MmChip 36, FilterSheet 40×3, combobox 44, active chips 36, banner dismiss 32, Why-pill ~26, detail glass 44, MmScreen back 44 |
| Truly unlabeled interactive icons | 1 | MakeCombobox expand/collapse |
| Fake-glass call sites | 69 MotormilaSurface + 3 MotormilaGlass + 3 PillTabs + 1 TopBar | same-name liquidGlass collision |
| Translucent-on-translucent violations | 2 | Search dock (3 layers), FilterSheet sections |

**Secondary-screen token census:** v2 content = tools, valuation, profile, settings, splash ONLY. Legacy = calc, ev, bestpicks, pulse, insights, district, make, permits, sell, docs, legal, admin. Mixed = dealer, pro, notifications, updates, scan. Worst five: **InsightsScreen** (flagship hub, 79 EN, 1060-line monolith), **ProScreen** (revenue paywall, English value prop), **NotificationsScreen** (0 stringResource), **AdminScreen** (81 EN, raw 22/26sp), **Docs/Legal** (help + privacy policy untranslated — trust/compliance).

---

## 8. Visual-regression / CI infra gaps (why the "mid" persisted)

- 30 committed goldens cover ONLY Home/Search/Detail/Tools/Splash/components; **~20 major screens have no golden** (watchlist, alerts, compare, valuation, calc, ev, pulse, insights, bestpicks, hubs, settings, profile, auth, pricing, pro, sell, scan, notifications, dealer, admin, widget). Screens/Sweep tests are opt-in (MM_SCREENS_SHOTS=1 / MM_SWEEP=1) and explicitly never committed.
- **All goldens are English**; sweep matrix is 4 combos (si never light, ta never dark, no 100% si/ta). No 360dp golden (the dominant width — hides the 1-column defect). No real-photo fixture (null images → wordmark placeholders; on-photo badge legibility never exercised).
- **Dishonest goldens**: `home_loadedStats_dark` pictures the DEAD HeroStatsCard (not shipping Home), captured mid-ticker (325,980 vs fixture 325,984 — non-deterministic); `home_dark` strip lacks the stat captions current code renders; home/search goldens omit LocalBottomChrome → bar overlaps content (production pads barTop+20dp — NOT a shipping bug); `home_offlineCached_dark` matches no configuration Home ever renders; detail golden is a hand-assembled sample (titleL 26sp + chart readout), not the real PriceDealSection.
- Baseline profile (16,058 lines) last regenerated BEFORE 1.7.0–1.8.0 UI; **no CI job runs the generator or benchmarks anymore** (workflow deleted; module comment stale). Firebase Test Lab job broken (pre-flavor APK path `app-debug.apk` no longer exists with play/direct flavors; unpinned actions; en/API34 only). **Zero instrumentation tests** (all 62 test files JVM).
- No Android i18n parity/untranslated gate (web has both). No Direct-flavor Paparazzi verify (Play only).
- **Fix:** promote highest-traffic Screens/Sweep renders to committed CI goldens (watchlist, alerts, compare, valuation, settings, auth, pricing, EV, pulse) with ≥1 si + ≥1 ta each at 100% and 200%; add 360dp + full-production-header + real-photo fixtures; re-record honest home/detail goldens from the shipping composables with LocalBottomChrome provided; restore a scheduled baseline-profile/benchmark workflow; fix the FTL APK path + SHA-pin + si/ta + API26/36 matrix; add the i18n CI gate.

---

## 9. Already fixed — do NOT re-report (git-verified)

1.7.0 blank rolling digits + sticky-bar price clipping ("Rs 950,00C"); si/ta per-glyph price splitting; 200% font-scale number clipping (fitWidth/MmFitText/CappedFontScale guards); reduced-motion propagation through MmMotion; 1.7.2 unified PriceVerdict + signed deal ring (one verdict across card/detail/share); brand v2 Apex M logo + AVD splash; card→Detail container transform (Search/hub); search cold-start/IME/deep-link fixes; committed ci-signing.keystore removed (env-only fail-closed signing); web interaction-polish 2026-10-31 (gallery keyboard scoping, dialog bounds, combobox Enter/Escape) — web-only, all checked off. The remaining 200% defect is the CTA **source-name ellipsis** ("View on Riyase…"), which is distinct from the fixed price clipping.

---

## 10. Suggested execution order (time-boxed)

**Week 1 — trust + token pass (highest leverage, lowest risk):**
1. MmColors refresh to web warm palette + three-role blue + AA text tiers (fixes brand-fill/tertiary/teal contrast in one pass). [P1-A]
2. Delete/replace fabricated IntelligencePills; neutral seller fallback; fix In-app channel policy; FMV→typical + bookmark copy; Pro copy. [P1-B]
3. ClearAll confirm + Undo; swipe/alert-delete Undo; ErrorState typed-enum + localized copy + no raw leak. [P1-E, P1-C]

**Week 2–3 — browse loop + hero:**
4. Grid columns at 360dp + true list row + honest toggle; Home rail shared-element morph; sort menu + create-alert relocation + Best-deal lock/upsell; meta district-first; result count. [P1-D]
5. Detail price hero (priceL/displayL + asking eyebrow); collapse calculators behind expandable rows; gate duty estimator; chart axis/typical labels + formatted dates + empty/failure states. [P1-A, P1-B]
6. Home photographic hero moment + section rhythm/eyebrows; card evidence line + tappable badge + source footer. [P1-A]

**Week 3–4 — localization + auth + a11y:**
7. Extract top-3 literal offenders (Admin/Insights/Detail) + Alerts/Watchlist/Auth/ErrorMapper; translate 83 overhaul keys; i18n CI gate. [P1-C]
8. Auth: confirm-password + email validation + reset contact card + returnTo; wire or delete biometric; keyboard types/autofill/IME. [P1-E]
9. Compare TalkBack row semantics; card merged semantics + badge counts; 48dp targets; combobox label; reduced-motion holes; haptics unification. [P1-E]

**Month 2 — migration + infra:**
10. Migrate legacy screens to v2 (start MotormilaChrome.kt → ~170 call sites; then Alerts/Watchlist/Auth/Insights/Pro/Notifications); unify motion to MmMotion aligned to web curves; rename fake-glass modifier; fix stacking; one shape/press scale. [P2 drift]
11. Honest goldens + 360dp/si/ta/200%/real-photo fixtures + promoted screen coverage; baseline-profile CI restore; FTL fix; values-night splash; widget Glance/i18n/freshness; BOM bump plan. [§8]

**Verification gate per change:** `./gradlew :app:verifyPaparazziPlayDebug` + unit tests + computed contrast ≥4.5 on touched tokens + si/ta render check. Re-run this critique after the token+trust pass to measure the score delta.
