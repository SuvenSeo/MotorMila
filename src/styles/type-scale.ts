/**
 * Motormila type scale (web/premium-p0). Nine steps, nothing below 12px.
 * Apple-style names. `large` and `hero` set in the Cal Sans display face
 * (pair them with `font-display`); everything else is Cal Sans Text.
 *
 *   caption 12/16 · footnote 13/18 · body 15/22 · callout 17/24 · title3 20/26
 *   title2 24/30 · title1 32/38 · large 44/48 · hero clamp(48, 6vw, 80)
 *
 * Arbitrary `text-[Npx]` is banned (ESLint warns); scripts/codemods/type-scale.py
 * maps old sizes onto this scale.
 */
type Size = [string, { lineHeight: string; letterSpacing?: string; fontWeight?: string }];

export const TYPE_SCALE = {
  caption: ["0.75rem", { lineHeight: "1rem" }],
  footnote: ["0.8125rem", { lineHeight: "1.125rem" }],
  body: ["0.9375rem", { lineHeight: "1.375rem" }],
  callout: ["1.0625rem", { lineHeight: "1.5rem" }],
  title3: ["1.25rem", { lineHeight: "1.625rem", letterSpacing: "-0.01em" }],
  title2: ["1.5rem", { lineHeight: "1.875rem", letterSpacing: "-0.01em" }],
  title1: ["2rem", { lineHeight: "2.375rem", letterSpacing: "-0.01em" }],
  large: ["2.75rem", { lineHeight: "3rem", letterSpacing: "-0.01em" }],
  hero: ["clamp(3rem, 1.6rem + 3.9vw, 5rem)", { lineHeight: "1.02", letterSpacing: "-0.01em" }],
} satisfies Record<string, Size>;

export type TypeToken = keyof typeof TYPE_SCALE;
export const TYPE_TOKENS = Object.keys(TYPE_SCALE) as TypeToken[];

/** Four tracking steps. Display sizes (title2 and up) carry their own -0.01em. */
export const LETTER_SPACING = {
  tight: "-0.02em",
  normal: "0",
  wide: "0.02em",
  caps: "0.08em",
} as const;
