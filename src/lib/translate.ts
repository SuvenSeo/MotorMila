export type TranslateVars = Record<string, string | number | null | undefined>;

/** Same shape as useAppPreferences().t, so lib helpers can take it as an argument. */
export type TranslateFn = (key: string, fallback?: string, vars?: TranslateVars) => string;

/**
 * Default translator for lib helpers called without one (unit tests, non-React
 * callers): renders the English fallback with its {vars} filled in.
 */
export const englishT: TranslateFn = (key, fallback, vars) => {
  const template = fallback ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (!(name in vars)) return match;
    const value = vars[name];
    return value === null || value === undefined ? "" : String(value);
  });
};

/** A [key, English fallback] pair, the shape lib content uses for translatable copy. */
export type I18nText = readonly [key: string, fallback: string];

export const tx = (t: TranslateFn, [key, fallback]: I18nText, vars?: TranslateVars): string => t(key, fallback, vars);
