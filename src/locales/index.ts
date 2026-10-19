import { en } from "./en";
import { si } from "./si";
import { ta } from "./ta";
import { listingEn, listingSi, listingTa } from "./listing";
import { shellEn, shellSi, shellTa } from "./shell";
import { featuresEn, featuresSi, featuresTa } from "./features";

export type Language = "en" | "si" | "ta";
export type Dictionary = Record<string, string>;

export const DICTIONARIES: Record<Language, Dictionary> = {
  en: { ...(en as unknown as Dictionary), ...listingEn, ...shellEn, ...featuresEn },
  si: { ...(si as unknown as Dictionary), ...listingSi, ...shellSi, ...featuresSi },
  ta: { ...(ta as unknown as Dictionary), ...listingTa, ...shellTa, ...featuresTa },
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
