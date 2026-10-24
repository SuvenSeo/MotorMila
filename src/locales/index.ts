import { en } from "./en";
import { listingEn } from "./listing";
import { shellEn } from "./shell";
import { featuresEn } from "./features";
import { dataEn } from "./data";
import { toolsEn } from "./tools";
import { accountEn } from "./account";
import { stringsEn } from "./strings";
import { contentEn } from "./content";

export type Language = "en" | "si" | "ta";
export type Dictionary = Record<string, string>;

/**
 * English ships in the entry chunk. Sinhala and Tamil (~2/3 of all strings) are
 * separate chunks loaded on demand: main.tsx awaits the saved language before
 * the first render, and setLanguage() waits for the chunk before switching, so
 * there is never a frame of the wrong language. Tests/scripts that need every
 * dictionary synchronously import ./all.
 */
export const EN_DICTIONARY: Dictionary = {
  ...(en as unknown as Dictionary),
  ...listingEn,
  ...shellEn,
  ...featuresEn,
  ...dataEn,
  ...toolsEn,
  ...accountEn,
  ...stringsEn,
  ...contentEn,
};

const loaded: Partial<Record<Language, Dictionary>> = { en: EN_DICTIONARY };
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
