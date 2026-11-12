/**
 * Full ta dictionary, loaded on demand (dynamic import from ../index.ts) so
 * English sessions never download it. Each feature bundle keeps its English
 * entries as the fallback for untranslated keys, exactly as before the split.
 */
import { ta } from "../ta";
import { listingEn } from "../listing";
import { shellEn } from "../shell";
import { featuresEn } from "../features";
import { dataEn } from "../data";
import { toolsEn } from "../tools";
import { accountEn } from "../account";
import { stringsEn } from "../strings";
import { contentEn } from "../content";
import { listingTa } from "./listing";
import { shellTa } from "./shell";
import { featuresTa } from "./features";
import { dataTa } from "./data";
import { toolsTa } from "./tools";
import { accountTa } from "./account";
import { stringsTa } from "./strings";
import { contentTa } from "./content";

type Dictionary = Record<string, string>;

function bundle(enBundle: Dictionary, langBundle: Dictionary): Dictionary {
  return { ...enBundle, ...langBundle };
}

const dictionary: Dictionary = {
  ...(ta as unknown as Dictionary),
  ...bundle(listingEn, listingTa),
  ...bundle(shellEn, shellTa),
  ...bundle(featuresEn, featuresTa),
  ...bundle(dataEn, dataTa),
  ...bundle(toolsEn, toolsTa),
  ...bundle(accountEn, accountTa),
  ...bundle(stringsEn, stringsTa),
  ...bundle(contentEn, contentTa),
};

export default dictionary;
