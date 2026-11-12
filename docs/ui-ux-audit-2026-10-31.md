# MotorMila interface audit and first polish pass

## Scope and confidence
Code/content audit, 2026-10-31. Reviewed the existing redesign specification, theme foundations, motion tokens, route transition, listing cards/gallery, compare tray, shared dialogs, filter combobox, error states, saved-listing recovery and earlier live API findings. Public competitor pages were fetched as readable content, not visually inspected. This is NOT an exhaustive rendered-screen, accessibility certification, motion-performance or all-route audit. This cloud host has no browser automation; screenshots, responsive layouts, focus occlusion, actual animation continuity and contrast measurements remain pending.

Preserve the existing Apex M, Blue/Ink/Paper semantic identity, Cal Sans, photographic showroom direction and React/Vite architecture. Do not replace the product with a marketplace clone or add animation for its own sake.

## Competitor evidence
- https://ikman.lk/en/ads/sri-lanka/cars — retrieved 2026-10-31. Visible result range/count, sort, Save search; cards emphasize model/year, mileage, condition, district, asking price and recency. Promoted/member labels are differentiated in the extracted content. Counts are time-dependent and are not directly comparable to MotorMila's cross-market index.
- https://riyasewana.com/search/cars — retrieved 2026-10-31. Visible result range, sort, page navigation; price/negotiable, year, locality, mileage and recency are easy to identify in extracted content.
- Take the task clarity, not their visual styling: help people find a car, know which filters are active, return to the same results, compare evidence and reach the source safely. MotorMila's differentiator remains cross-source price intelligence, not ad volume or paid placements.

## Fixed in this pass
- `src/components/ListingImageCarousel.tsx`: global detail-gallery arrow listener intercepted unrelated controls. Scope keyboard handling to the gallery region, respect modifiers/prevented events and editable/slider/select targets.
- Gallery animation used a mount-time-only OS preference. Use the existing live reduced-motion/low-data hook for Embla jumps/duration too.
- Photo dots were 6×6px controls. Expand to 24×24px non-overlapping targets with 4px separation, visible focus and white photo-overlay dots. Adjust active-dot transform to the new geometry. This meets the 24px target floor, not a claim that every gallery control is 44px.
- Thumbnail strip advertised incomplete tab semantics without tabpanels/roving tabs. Use a labeled group of ordinary pressed buttons, preserving tab order.
- `src/components/ui/dialog.tsx`: constrain shared dialogs to viewport minus 2rem, contain vertical scroll and retain horizontal breathing room. Retain Radix focus trapping/dismissal. Decorative close icon hidden from assistive tech. Call-site max-width/height overrides still warrant rendered review.
- `src/components/ui/combobox.tsx`: closed Enter could pick All and clear an existing selection. Handle selection keys only while open; arrow keys open the filter. Escape returns focus to trigger and stops propagation so it does not also dismiss a surrounding sheet; picking restores trigger focus. Add active-option linkage and contain list scrolling.

## Strengths retained
- One shared CSS/JS motion vocabulary, reduced-motion/low-data hooks, transform/opacity-oriented transitions, route View Transitions with persistent chrome, instant POP navigation and card/detail image handoff.
- Semantic theme tokens, native color-scheme, shared visible focus treatment, safe-area/dock coordination and explicit device-local save wording.
- Listing source attribution, asking-price rather than sold-price claims, insufficient-evidence handling and action-specific save/compare states.
- Dashboard announces result count and marks result refreshing busy. No need to add a duplicate announcement system.

## Prioritized remaining work
### P0 — trustworthy recovery (implemented in follow-up)
- Detail now preserves temporary failures and offers retry; only confirmed 404s become missing listings. Speculative prefetch rejections remain observable without unhandled promise errors.
- Compare now identifies unresolved IDs and offers retry/removal while retaining loaded comparisons. All-failed requests no longer masquerade as an empty selection.
- Saved listings now offer retry and removal by ID even when details cannot load, without claiming temporary failures mean permanent removal.

Original findings:
- `src/lib/listingHandoff.ts`: all detail errors become null; transient failures look like missing listings. Preserve missing vs retryable state and offer retry without losing navigation context.
- `src/services/api.ts:getListingsBatch` / `src/pages/Compare.tsx`: allSettled silently drops failures; partial and all-failed comparisons need per-ID explanations, retry and remove/replace controls.
- `src/pages/Dashboard.tsx`: saved failures can read as permanently removed and unresolved IDs cannot be managed in place. Preserve valid selections, distinguish transient errors and allow retry/removal.

### P1 — rendered visual and interaction review
- Audit home/search/filter sheet/detail/compare/saved/sell/account at 360, 390, 768, 1280 and 1440px; both themes; keyboard; 200% text; EN/SI/TA. Check horizontal overflow and long titles/prices.
- Inspect mobile dock + sticky price CTA + compare tray + cookie/banner combinations for overlap and obscured focus. Test keyboard opening/closing and focus restoration in nested sheets/popovers.
- Inspect photo hover, fullscreen open/close, lazy image decode, card→detail→Back and rapid navigation for double animations or ghosted snapshots; verify slow images and reduced motion. No FPS/speed claims without traces.
- Verify photo controls on real source images in both themes; source failures must retain meaningful placeholders without false loading loops.
- Measure contrast on actual composite photo overlays, muted labels, chart axes and disabled/selected controls; token comments alone are not measurements.
- Confirm every hero loop has pause/stop where needed and stops offscreen; inspect FlipWords usage before modifying unused components.
- Combobox still warrants full ARIA pattern review: active-option scrolling, touch/outside dismissal, typing across long model lists and localization of generated search labels.

### P2 — consistency and completeness
- Compare result density and primary-action hierarchy across all tools, not just the buyer path. Inventory seller/dealer/payment screens before calling the whole app polished.
- Check error/loading/empty states on every data page; preserve filters and avoid fake evidence. Audit card metadata density versus small-screen scanning.
- Inspect language parity and content overflow, native form autocomplete/inputmode, unsaved changes and destructive confirmations across account/seller flows.
- Validate real-device motion and source image delivery under constrained network/CPU; measure rather than assume performance gains.

## Verification
Two gallery regressions and two combobox regressions reproduced before their fixes. Focused gallery, detail, Dashboard and combobox checks passed (23 tests) before final cleanup; final follow-up verification passed all 140 frontend test files / 1,025 tests. TypeScript passed; targeted ESLint reported no errors and four existing warnings. No rendered browser/device certification was performed. No application dependencies added. The follow-up request authorized committing and pushing this work. Deployment verification is separate; no new deployment was manually requested in this pass.

## Completion standard
No finite pass makes an app 'perfect' or certifies 'best in the world.' Close the recorded behavioral issues, complete the rendered-device matrix, measure performance/accessibility and gather buyer feedback before making broader quality claims.
