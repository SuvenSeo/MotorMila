/**
 * Every dictionary, loaded synchronously. For tests, scripts and build steps
 * only: app code imports ./index (eager shell core) and ./namespaces (deferred
 * English chunks) so a visitor never downloads a language or a namespace they
 * are not reading.
 */
import { LOCALE_TAGS, interpolate, type Dictionary, type Language } from "./index";
import { EN_CORE } from "./chunks/core";
import { EN_MARKET } from "./chunks/market";
import { EN_TOOLS } from "./chunks/tools";
import { EN_CONTENT } from "./chunks/content";
import { EN_ACCOUNT } from "./chunks/account";
import { EN_REST } from "./chunks/rest";
import siDictionary from "./si/index";
import taDictionary from "./ta/index";

export { interpolate, LOCALE_TAGS } from "./index";
export type { Dictionary, Language } from "./index";

/** The complete English dictionary — the union of every generated chunk. */
export const EN_FULL: Dictionary = {
  ...EN_CORE,
  ...EN_MARKET,
  ...EN_TOOLS,
  ...EN_CONTENT,
  ...EN_ACCOUNT,
  ...EN_REST,
};

export const DICTIONARIES: Record<Language, Dictionary> = {
  en: EN_FULL,
  si: siDictionary,
  ta: taDictionary,
};
