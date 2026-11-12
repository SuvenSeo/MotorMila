/**
 * Every dictionary, loaded synchronously. For tests and build scripts only:
 * app code uses EN_DICTIONARY + loadDictionary() from ./index so si/ta stay
 * out of the entry chunk.
 */
import { EN_DICTIONARY, type Dictionary, type Language } from "./index";
import siDictionary from "./si/index";
import taDictionary from "./ta/index";

export { interpolate, LOCALE_TAGS } from "./index";
export type { Dictionary, Language } from "./index";

export const DICTIONARIES: Record<Language, Dictionary> = {
  en: EN_DICTIONARY,
  si: siDictionary,
  ta: taDictionary,
};
