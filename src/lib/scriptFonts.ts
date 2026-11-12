/**
 * Sinhala / Tamil web fonts (Noto Sans, OFL-1.1, via Fontsource).
 *
 * Loaded only when the UI language is si / ta: each language's CSS is a
 * separate dynamic chunk, so English sessions never download them. Only the
 * script subset at two weights (400 body, 600 emphasis) is pulled in; Latin
 * glyphs stay in Cal Sans. The `:lang(si|ta)` font stacks live in styles/tokens.css.
 */
import type { Language } from "@/locales";

const loaded = new Set<Language>();

const LOADERS: Partial<Record<Language, () => Promise<unknown>>> = {
  si: () =>
    Promise.all([
      import("@fontsource/noto-sans-sinhala/sinhala-400.css"),
      import("@fontsource/noto-sans-sinhala/sinhala-600.css"),
    ]),
  ta: () =>
    Promise.all([
      import("@fontsource/noto-sans-tamil/tamil-400.css"),
      import("@fontsource/noto-sans-tamil/tamil-600.css"),
    ]),
};

export function loadScriptFonts(language: Language): Promise<void> {
  const load = LOADERS[language];
  if (!load || loaded.has(language)) return Promise.resolve();
  loaded.add(language);
  return load()
    .then(() => undefined)
    .catch(() => {
      // Network hiccup: allow a retry on the next language change. The system
      // Sinhala/Tamil font still renders meanwhile.
      loaded.delete(language);
    });
}
