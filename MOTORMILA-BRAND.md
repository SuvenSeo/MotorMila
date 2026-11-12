# MOTORMILA — Brand Bible

Adopted 2026-10-06. Replaces all previous marks (the circular "PRICE INTELLIGENCE"
badge, the speed-lines SVG icon, the ChatGPT variants, and the gold Android "M").
Those files are deleted from the repo — do not reintroduce them.

## The mark

**Apex M** — a bold electric-blue M whose final stroke launches into a rising
arrow. One idea: *the market, moving the buyer's way.* It doubles as the
initial of the wordmark: **[M]otormila**.

## Lockups

| Use | Asset | Notes |
|---|---|---|
| Primary (headers, hero) | `/logo-wordmark.png` (transparent) | M is the first letter — never set "motormila" in plain type next to it |
| Dark surfaces | `/brand-lockup.png` | Pre-composed on Ink |
| App / PWA icon | `/logo.png` (512, rounded 22%) | Manifest + favicon PNG link |
| Mark only | `/logo-mark.png` (dark) · `/logo-mark-light.png` (light) | Follows color scheme in `BrandLogo` |
| Social / docs | `/brand-sheet.png` | One-page reference |
| Link previews | `/og-card.jpg` (1200×630) | Referenced in `index.html` + `RouteMeta` |
| Favicon | `/favicon.ico` (16/32/48) | |
| iOS touch | `/apple-touch-icon.png` (180) | |
| Android | `drawable/motormila_logo.png` (in-app) · adaptive `ic_launcher_foreground.xml` (vector Apex M) | Launcher bg `@color/launcher_bg` |

Masters (AI originals + transparent key): `~/workspace/motormila-brand/`.

## Palette

- **Motormila Blue** `#0A7AFF` — the mark, primary actions. Never recolor the mark.
- **Ink** `#09090B` — ground. The brand is dark-first.
- **Paper** `#FFFFFF` — light surfaces only, with the white-bg mark.
- **Deal Green** `#00C853` — reserved for underpriced-deal signals. Never in the logo.

## Typography

- The logo lockup is artwork (SVG): never re-set it in a live font.
- **Cal Sans** (SIL OFL 1.1, github.com/calcom/sans v2.011) is the only UI typeface:
  - *Cal Sans* (display optical size) 600/700 — headlines, tracking −2%.
  - *Cal Sans Text* (Text UI optical size) 400/500/600 — body, UI and prices
    (tabular numbers). Body 15/22.
- Sinhala and Tamil fall back to Noto Sans Sinhala / Noto Sans Tamil.
- Self-hosted Latin-subset WOFF2 in `public/fonts/cal-sans/` with `OFL.txt`;
  wiring in `src/styles/fonts.css`. No Google Fonts, no runtime font switcher.

## Rules

1. The Apex M is the **only** mark. No badges, no car clip-art, no gradients other
   than the mark's own blue.
2. Blue on Ink. On light surfaces use the white-bg mark — never invert or
   recolor the artwork.
3. Minimum sizes: mark 24px, lockup 120px wide. Below that, use the app icon.
4. Clearspace: at least the height of the arrowhead on all sides.
5. BANNED: the old circular badge, the speed-lines SVG, gold "M", any AI
   variant not in `~/workspace/motormila-brand/ai-logos/`, car silhouettes,
   price-tag clip-art, "PRICE INTELLIGENCE" curved text.

## Code

- Single source of truth: `src/lib/brand.ts` (`BRAND.logo`, `BRAND.colors`).
- Web lockup component: `src/components/BrandLogo.tsx` (mark follows
  `prefers-color-scheme`; compact/nav use the rounded icon).
- Android lockup: `android/.../ui/components/BrandLogo.kt`.
- After changing any asset, hard-refresh PWA caches and bump
  `public/app/latest-release.json` if the release flow requires it.
