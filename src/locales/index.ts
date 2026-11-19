import { EN_CORE } from "./chunks/core";

export type Language = "en" | "si" | "ta";
export type Dictionary = Record<string, string>;

/**
 * Live English dictionary. It starts as the eager core (shell chrome, nav,
 * footer, route meta and the home above-the-fold copy — see
 * scripts/build-locale-chunks.mjs) and gains each deferred chunk as the route
 * that needs it loads (./namespaces.ts, awaited by lib/lazyPage.ts).
 *
 * t() stays synchronous, so a key that has not arrived yet resolves through the
 * English fallback literal at the call site: never a bare key, never another
 * language. Every deferred key resolves to the same string the chunk would
 * have supplied (src/test/localeChunks.test.ts), so nothing changes on screen
 * when a chunk lands late.
 *
 * Sinhala and Tamil are one chunk each, loaded on demand: main.tsx awaits the
 * saved language before the first render, and setLanguage() waits for the
 * chunk before switching, so there is no frame of the wrong language.
 */
export const ENGLISH: Dictionary = { ...EN_CORE };

/** Fold a deferred English chunk into the live dictionary. */
export function mergeEnglish(part: Dictionary): void {
  Object.assign(ENGLISH, part);
}

const loaded: Partial<Record<Language, Dictionary>> = { en: ENGLISH };
const pending: Partial<Record<Language, Promise<Dictionary>>> = {};

/** The dictionary for a language if it is already in memory. */
export function getDictionary(language: Language): Dictionary | undefined {
  return loaded[language];
}

/** Load (once) and return a language's dictionary. English resolves immediately. */
export function loadDictionary(language: Language): Promise<Dictionary> {
  const ready = loaded[language];
  if (ready) return Promise.resolve(ready);
  if (!pending[language]) {
    const importer = language === "si" ? () => import("./si/index") : () => import("./ta/index");
    pending[language] = importer().then(
      (mod) => {
        loaded[language] = mod.default;
        return mod.default;
      },
      (error: unknown) => {
        delete pending[language];
        throw error;
      },
    );
  }
  return pending[language]!;
}

export const LOCALE_TAGS: Record<Language, string> = {
  en: "en-LK",
  si: "si-LK",
  ta: "ta-LK",
};

export function interpolate(
  template: string,
  vars?: Record<string, string | number | null | undefined>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (!(key in vars)) return match;
    const value = vars[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}
