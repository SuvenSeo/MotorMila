import { en } from "./en";
import { si } from "./si";
import { ta } from "./ta";
import { listingEn, listingSi, listingTa } from "./listing";
import { shellEn, shellSi, shellTa } from "./shell";
import { featuresEn, featuresSi, featuresTa } from "./features";
import { dataEn, dataSi, dataTa } from "./data";
import { toolsEn, toolsSi, toolsTa } from "./tools";
import { accountEn, accountSi, accountTa } from "./account";
import { stringsEn, stringsSi, stringsTa } from "./strings";

export type Language = "en" | "si" | "ta";
export type Dictionary = Record<string, string>;

/** A feature bundle for one language, with its English entries as the fallback for untranslated keys. */
function bundle(enBundle: Dictionary, langBundle: Dictionary): Dictionary {
  return { ...enBundle, ...langBundle };
}

export const DICTIONARIES: Record<Language, Dictionary> = {
  en: { ...(en as unknown as Dictionary), ...listingEn, ...shellEn, ...featuresEn, ...dataEn, ...toolsEn, ...accountEn, ...stringsEn },
  si: {
    ...(si as unknown as Dictionary),
    ...bundle(listingEn, listingSi),
    ...bundle(shellEn, shellSi),
    ...bundle(featuresEn, featuresSi),
    ...bundle(dataEn, dataSi),
    ...bundle(toolsEn, toolsSi),
    ...bundle(accountEn, accountSi),
    ...bundle(stringsEn, stringsSi),
  },
  ta: {
    ...(ta as unknown as Dictionary),
    ...bundle(listingEn, listingTa),
    ...bundle(shellEn, shellTa),
    ...bundle(featuresEn, featuresTa),
    ...bundle(dataEn, dataTa),
    ...bundle(toolsEn, toolsTa),
    ...bundle(accountEn, accountTa),
    ...bundle(stringsEn, stringsTa),
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
