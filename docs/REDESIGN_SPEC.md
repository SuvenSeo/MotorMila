# Motormila — World-Class Redesign Spec (dual-theme, dark default)

This is the **binding contract** for the platform redesign. Every page and component
must conform so the coordinated sweep stays coherent. When in doubt, match the
reference implementations: `src/pages/Dashboard.tsx`, `src/components/Navbar.tsx`,
`src/components/ListingCard.tsx`, `src/components/AppFooter.tsx`.

## 0. North star

> "What if Apple built a Sri Lankan automotive intelligence platform."

Calm, confident, editorial. The UI recedes; the **cars, prices, and data are the
heroes**. Dramatic scale contrast, generous whitespace, one clear hero per view,
motion that feels physical. Both **dark (default)** and **light** are first-class.

## 1. Theming — the #1 rule

**Never hardcode a UI surface colour. Route everything through semantic tokens so it
adapts across `:root` (light) and `.theme-dark`.**

The single decision rule:

- **On a photograph or an intentionally-dark media overlay** → keep hardcoded dark
  values (`text-white`, `bg-black/60`, `from-black/…`, `bg-zinc-950/85`, deal badges
  over images). Photos are dark in both themes; this is correct.
- **On a UI surface (cards, panels, sections, chrome)** → use tokens.

### Migration map (hardcoded → token)

| Hardcoded (surface context)            | Replace with                                   |
| -------------------------------------- | ---------------------------------------------- |
| `bg-white/[0.01 .. 0.04]`, `bg-white/5`| `bg-card` (elevated) or `bg-surface` (inset)   |
| `border-white/5`, `border-white/10`    | `border-border`                                |
| `text-white` (on surface)              | `text-foreground`                              |
| `text-white/70`, `text-zinc-300/400`   | `text-muted-foreground`                        |
| `bg-zinc-900`, `bg-slate-900`, etc.    | `bg-card` / `bg-surface`                        |
| `text-indigo/violet/blue-*` as accent  | `text-primary`                                  |
| ring/hover accent `indigo/violet-*`    | `primary` (`ring-primary`, `hover:border-primary/40`) |
| generic shadows `shadow-black/…`       | `shadow-soft` / `shadow-soft-lg` / `shadow-soft-xl` |

**Keep (semantic, already theme-adaptive):** `text-emerald-600 dark:text-emerald-400`
(good/below-market), `text-rose-600 dark:text-rose-400` (bad/above-market),
`amber` (warning). Or use the `deal-green/amber/red` and `signal-*` tokens.

Prefer the existing CSS component classes where they fit: `.surface`,
`.surface--glass`, `.data-card`, `.metric-tile`, `.premium-surface`,
`.command-surface`, `.status-chip`, `.section-eyebrow`, `.num` (all price/data).

## 2. Typography — build hierarchy from weight + size + leading

Use the new display utilities (size-specific tracking baked in):

- **Page hero H1** → `.display-hero` (~40→84px). One per page, top of hero.
- **Section H2** → `.display-2` (via `<SectionHeader>`), or `.display-1` for a
  major sub-hero.
- **Lead paragraph under a hero** → `.text-body-lg` (17→20px, muted).
- **Eyebrow / kicker** → `.section-eyebrow` or the `<SectionHeader eyebrow>` (accent).
- **All numbers, prices, stats, dates** → add `.num` (tabular, tight).
- Body copy stays 15px (`text-base`). Don't shrink below `text-xs` (12px) for content.

**Do:** make the hero headline tower over everything; let one number be huge on data
pages. **Don't:** stack three same-size bold headings; don't use ALL-CAPS for long text.

## 3. Layout & rhythm

- Page width: `.layout-shell` (1320) or `.layout-wide` (1560). Sections use
  `.page-section` or `py-14 lg:py-20`. Give sections room to breathe.
- **One hero, then a calm grid.** Avoid "card soup" — vary card size and weight so the
  eye has a path. Use a 12-col mental grid; feature the primary item at 2× size.
- Consistent radii: cards `rounded-2xl`/`.data-card`; chips/buttons pill
  (`rounded-full`); inputs `rounded-xl`.
- Elevation ladder: page bg → `bg-surface` inset → `bg-card` raised → `.surface--glass`
  floating chrome. **Never stack a translucent surface on another** (§apple-design 12).

## 4. Motion (Framer Motion; app sets `reducedMotion="user"`)

Import presets from `@/lib/motion`: `springSoft` (default, no overshoot),
`springSnappy` (controls), `springBouncy` (only after a flick/drag), `revealContainer`
+ `revealItem` (staggered section entrances). Scroll-reveal via `<RevealSection>`.

- Entrances: fade + 16px rise, staggered ~60ms. Materialize glass (scale+blur), don't
  just fade.
- Press feedback is instant (`active:scale-[0.97]`, already in Button). Hover lifts
  cards ~1–2px with a shadow step.
- Only animate `transform`/`opacity`. No layout-thrashing animations. No infinite
  attention-grabbing loops except a calm live-dot.

## 5. Components to reuse (don't reinvent)

- CTAs → `<Button>` (pill, token-driven). Primary = filled `default`; secondary =
  `outline`; quiet = `ghost`.
- Section intros → `<SectionHeader eyebrow title description actions />`.
- Panels → `<Surface variant="default|elevated|glass" interactive>`.
- Listing tiles → `<ListingCard>` (already the reference for photo-forward cards).
- Charts (Recharts) → theme via tokens: axis/grid `hsl(var(--border))`, text
  `hsl(var(--muted-foreground))`, series `hsl(var(--primary))` + emerald/rose signals.
  Never leave default black-on-white chart chrome.

## 6. Accessibility (non-negotiable — WCAG 2.2 AA, axe = 0 violations)

- Text contrast ≥ 4.5:1 (≥ 3:1 for ≥ 24px/▪19px-bold). Small accent text on dark →
  use `text-primary-bright`. Verify BOTH themes.
- Every interactive element keyboard-focusable with a visible `:focus-visible` ring.
- Icons that convey meaning need `aria-label`; decorative ones `aria-hidden`.
- Respect `prefers-reduced-motion` (presets + CSS already do). Don't remove focus
  outlines. Maintain heading order (one h1/page).

## 7. Verification gate (every changed file)

`npm run typecheck` → 0 errors · `npm run test` → all pass · keep axe clean.
Never introduce console errors. Prices/dates always formatted (`formatPrice`, `.num`).

## 8. Page ownership (sweep)

Each page owns its page-specific components; shared chrome is already migrated.
Home `Dashboard` · `ListingDetail` · `Trends` · `Calculator` · `Estimate` ·
`BestPicks` · `EVHub` · `MapPage` · `MakeModelHub` · `Alerts` · `Blogs` · `SignIn` ·
`Settings` · `ProDashboard` · `ProPreview` · `DealerDashboard` · `NotFound`.
