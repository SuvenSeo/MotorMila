import { en } from "./en";
import { si } from "./si";
import { ta } from "./ta";
import { listingEn, listingSi, listingTa } from "./listing";
import { shellEn, shellSi, shellTa } from "./shell";
import { featuresEn, featuresSi, featuresTa } from "./features";

export type Language = "en" | "si" | "ta";
export type Dictionary = Record<string, string>;

/** A feature bundle for one language, with its English entries as the fallback for untranslated keys. */
function bundle(enBundle: Dictionary, langBundle: Dictionary): Dictionary {
  return { ...enBundle, ...langBundle };
}

export const DICTIONARIES: Record<Language, Dictionary> = {
  en: { ...(en as unknown as Dictionary), ...listingEn, ...shellEn, ...featuresEn },
  si: {
    ...(si as unknown as Dictionary),
    ...bundle(listingEn, listingSi),
    ...bundle(shellEn, shellSi),
    ...bundle(featuresEn, featuresSi),
  },
  ta: {
    ...(ta as unknown as Dictionary),
    ...bundle(listingEn, listingTa),
    ...bundle(shellEn, shellTa),
    ...bundle(featuresEn, featuresTa),
  },
};

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
