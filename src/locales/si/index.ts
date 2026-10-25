/**
 * Full si dictionary, loaded on demand (dynamic import from ../index.ts) so
 * English sessions never download it. Each feature bundle keeps its English
 * entries as the fallback for untranslated keys, exactly as before the split.
 */
import { si } from "../si";
import { listingEn } from "../listing";
import { shellEn } from "../shell";
import { featuresEn } from "../features";
import { dataEn } from "../data";
import { toolsEn } from "../tools";
import { accountEn } from "../account";
import { stringsEn } from "../strings";
import { contentEn } from "../content";
import { listingSi } from "./listing";
import { shellSi } from "./shell";
import { featuresSi } from "./features";
import { dataSi } from "./data";
import { toolsSi } from "./tools";
import { accountSi } from "./account";
import { stringsSi } from "./strings";
import { contentSi } from "./content";

type Dictionary = Record<string, string>;

function bundle(enBundle: Dictionary, langBundle: Dictionary): Dictionary {
  return { ...enBundle, ...langBundle };
}

const dictionary: Dictionary = {
  ...(si as unknown as Dictionary),
  ...bundle(listingEn, listingSi),
  ...bundle(shellEn, shellSi),
  ...bundle(featuresEn, featuresSi),
  ...bundle(dataEn, dataSi),
  ...bundle(toolsEn, toolsSi),
  ...bundle(accountEn, accountSi),
  ...bundle(stringsEn, stringsSi),
  ...bundle(contentEn, contentSi),
};

export default dictionary;
