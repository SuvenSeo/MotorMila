# Motormila design tokens

Source of truth: `src/index.css` (core surfaces) + `src/styles/tokens.css` (semantic layer) + `tailwind.config.ts` (utilities).
Reach for these utilities; don't hard-code `emerald-*`, `rose-*`, `amber-*`, `bg-white`, `text-[Npx]`, or `rounded-[Npx]` in new work.

## Colour

| Utility | Use | Notes |
|---|---|---|
| `bg-primary` + `text-primary-foreground` | Primary buttons, solid chips | Fill blue: `#0067E6` light / `#006AEB` dark, white text ≥ 4.9:1 |
| `text-primary` | Blue text, links, icons on page surfaces | Maps to `--primary-text` (not the fill): `#0060D6` light / `#5CA5FF` dark |
| `text-primary-text` | Same as above, explicit | Use in arbitrary contexts (`[&_a]:text-primary-text`) |
| `text-primary-bright` | Legacy alias for small blue text | Kept; prefer `text-primary` |
| `bg-brand` / `--brand-blue` | `#0A7AFF` — logo mark & decoration only | **Never** for text (4.07:1 with white) |
| `border-primary`, `ring-primary`, `ring-ring` | Focus, selected borders | Fill blue; ≥ 3:1 non-text against both backgrounds |
| `text-muted-foreground` | Secondary text | ≥ 5:1 light, ≥ 6.6:1 dark. Avoid `/60`-style opacity on it for body text |
| `bg-background` `bg-card` `bg-surface` `bg-muted` `text-foreground` | Surfaces | Theme-aware — use instead of `bg-white` / `bg-black` / `text-black` |

### Deal signals — one set

| Token | Meaning | Maps from (dealTiers) |
|---|---|---|
| `deal-great` | Well below the market median (score ≥ 15) | `steal` |
| `deal-good` | Below median (score ≥ 8) | `great` |
| `deal-fair` | Within the market band — neutral, **not** green | `fair` |
| `deal-high` | Asking price above median (score ≤ −5) | `overpriced` |
| `deal-caution` | Amber: verify first, unusually low, risk flags | trust / bait-price signals |

Each has three utilities: `bg-deal-X` (solid fill), `text-deal-X-foreground` (text on the fill), `text-deal-X-text` (text/icon on background, card, muted or a tint).

```
Badge (tinted):  border border-deal-good/30 bg-deal-good/10 text-deal-good-text
Badge (solid):   bg-deal-good text-deal-good-foreground
Dot / bar:       bg-deal-high
```

Legacy `deal-green` / `deal-amber` / `deal-red` utilities still work and alias to `deal-good` / `deal-caution` / `deal-high`.
Copy rule: these describe the asking price against other asking prices — never call it "market value", never "guaranteed".

### Contrast (WCAG 2.x, checked with `scripts/contrast.py`)

| Theme | Token | Solid | fg on solid | -text | -text on bg / card / muted / 10% tint |
|---|---|---|---|---|---|
| light | `primary` | #0067E6 | 5.14 | #0060D6 | 5.42 / 5.63 / 5.17 / 4.71 |
| light | `deal-great` | #107546 | 5.77 | #0F6C40 | 6.15 / 6.39 / 5.87 / 5.35 |
| light | `deal-good` | #1D8147 | 4.91 | #1A7440 | 5.46 / 5.67 / 5.21 / 4.80 |
| light | `deal-fair` | #546378 | 6.12 | #44546A | 7.34 / 7.63 / 7.00 / 6.42 |
| light | `deal-high` | #C11F3A | 5.95 | #B11B34 | 6.44 / 6.69 / 6.14 / 5.48 |
| light | `deal-caution` | #F59F0A | 8.95 | #914C08 | 6.09 / 6.32 / 5.81 / 5.67 |
| light | `destructive` | #CE2D22 | 5.21 | — | — |
| dark | `primary` | #006AEB | 4.95 | #5CA5FF | 7.79 / 7.41 / 6.54 / 7.32 |
| dark | `deal-great` | #26BA75 | 7.64 | #51D698 | 10.76 / 10.23 / 9.03 / 9.58 |
| dark | `deal-good` | #3BBA70 | 7.69 | #6ECF96 | 10.31 / 9.80 / 8.65 / 9.16 |
| dark | `deal-fair` | #8391A5 | 5.97 | #AEBACB | 10.06 / 9.57 / 8.44 / 9.06 |
| dark | `deal-high` | #EC516A | 5.40 | #F78296 | 8.08 / 7.69 / 6.78 / 7.40 |
| dark | `deal-caution` | #F6A823 | 9.62 | #FABD42 | 11.65 / 11.08 / 9.78 / 10.10 |
| dark | `destructive` | #E02C1F | 4.61 | — | — |
| light | `muted-foreground` | — | — | #67676F | 5.31 / 5.51 / 5.06 / — |
| dark | `muted-foreground` | — | — | #ACA39A | 7.96 / 7.57 / 6.69 / — |

## Type scale

`text-2xs` 11 · `text-xs` 12 · `text-sm` 13 · `text-base` 15 · `text-lg` 17 · `text-xl` 20 · `text-2xl` 24 · `text-3xl` 30 · `text-4xl` 36 · `text-5xl` 48 · `text-display-sm` fluid 32→48 · `text-display` fluid 40→76 (700, −3.5%).
Labels: `text-label` (11px, +12% tracking, uppercase eyebrows) · `text-caption` (11px).
Nothing below 11px for text people must read (10px/9px arbitrary sizes are being retired).

## Radius

| Utility | Value | Use |
|---|---|---|
| `rounded-xs` | 4px | tiny marks |
| `rounded-sm` | 6px | kbd, tags |
| `rounded` | 8px | small controls |
| `rounded-md` / `rounded-input` | 10px | inputs, selects, buttons |
| `rounded-lg` / `rounded-card` | 12px | cards (`--radius`) |
| `rounded-xl` | 14px | |
| `rounded-2xl` / `rounded-sheet` | 16px | panels, dialogs, sheets |
| `rounded-3xl` | 20px | |
| `rounded-4xl` | 24px | hero media |
| `rounded-full` / `rounded-pill` | 9999px | pills, chips, avatars |

`--radius` dropped from 32px to 12px, so existing `rounded-2xl` cards go from 32px to 16px and `rounded-3xl` from 40px to 20px automatically.

## Fonts

- **Display:** Space Grotesk 500/700 (`font-display`, `--font-display`, `--font-wordmark`) — per MOTORMILA-BRAND.md (2026-10-06), which supersedes the earlier Satoshi experiment.
- **Body/UI/numbers:** Inter 400–700 (`font-sans`, `font-body`). Prices: `font-numeric` / `font-mono` / `.tabular-price` → Inter with `tabular-nums` — never a monospace fallback.
- **Code only:** `font-code` (system monospace).
- **Sinhala / Tamil:** Noto Sans Sinhala / Noto Sans Tamil 400+600 (Fontsource, OFL) loaded by `src/lib/scriptFonts.ts` only when the language is si/ta; stacks switch via `:root:lang(si|ta)`.
- Type is Cal Sans only (OFL 1.1, self-hosted, `styles/fonts.css`). Font Studio, Azonix, Russo One, Inter, Space Grotesk and the Google Fonts links were removed in web/premium-p0.

## i18n

`npm run i18n:check` lists keys used in code (`t("key", "fallback")`) but missing from `src/locales/{en,si,ta}.ts`; `-- --write` adds them to en from the code fallback and copies en into si/ta (key parity is enforced by `src/test/localeParity.test.ts`). An si/ta value identical to en means "not translated yet".
