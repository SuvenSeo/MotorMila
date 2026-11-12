#!/usr/bin/env node
/**
 * i18n:untranslated — list si/ta UI strings whose final (merged) value is still
 * identical to English. Skips brand names, units, numbers, codes and pure
 * placeholders. Bundles the real locales/index.ts so the result matches what
 * the app renders (bundle spreads included).
 *
 *   node scripts/i18n-untranslated.mjs           human report
 *   node scripts/i18n-untranslated.mjs --json    { si: {key: en}, ta: {key: en} }
 */
import { build } from "esbuild";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(os.tmpdir(), `mm-locales-${process.pid}.mjs`);
await build({
  entryPoints: [path.join(ROOT, "src/locales/all.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: out,
  logLevel: "silent",
});
const { DICTIONARIES } = await import(out);
fs.rmSync(out, { force: true });

// Words that are the same in every language on MotorMila (brands, units, codes).
const KEEP = new Set(
  [
    "MotorMila", "Pro", "Free", "LKR", "Rs", "km", "km/l", "kWh", "cc", "CIF", "VAT", "SSCL", "DMT", "CR", "EV",
    "PHEV", "HEV", "BEV", "CSV", "PDF", "WhatsApp", "Android", "iOS", "Google", "Email", "OK", "FAQ", "API",
    "Toyota", "Honda", "Suzuki", "Nissan", "Mitsubishi", "Mazda", "Aqua", "Prius", "Vitz", "Alto", "Wagon R",
    "ikman", "Riyasewana", "patpat", "AutoLanka", "Mn", "M", "K", "/mo", "AED", "USD", "JPY", "GBP", "SGD",
  ].map((s) => s.toLowerCase()),
);

// Keys whose English value is correct in every language (paths, brand/product names).
const KEEP_KEYS = new Set([
  "adminLogin.path", "alerts.channelTelegram", "footer.ardenoStudio", "nav.github", "trans.tiptronic",
  "ev.chargersSourceValue", "seo.botTitle",
  // Dealer plan names are product names, like "Pro" (the FAQ copy uses them as-is too).
  "pricing.dealerTier.starter.name", "pricing.dealerTier.yard.name", "acct.proPreview.gapExports.meta", "pulseGuide.cbsl_fx.short", "search.preset50to75L", "search.preset75to100L",
]);

function skippable(v) {
  const s = v.trim();
  if (!s) return true;
  if (!/[A-Za-z]/.test(s)) return true; // numbers, symbols, placeholders only
  const stripped = s.replace(/\{\w+\}/g, " ").replace(/[^A-Za-z/.' ]+/g, " ").trim();
  if (!stripped) return true;
  if (KEEP.has(s.toLowerCase()) || KEEP.has(stripped.toLowerCase())) return true;
  if (/^[A-Z0-9_.\-/ ]{1,6}$/.test(s)) return true; // short codes: "N/A", "SUV", "4WD"
  if (/^https?:\/\//.test(s) || /^[\w.+-]+@[\w.-]+$/.test(s)) return true; // urls, emails
  return stripped.split(/\s+/).every((w) => KEEP.has(w.toLowerCase().replace(/[.']/g, "")));
}

const en = DICTIONARIES.en;
const result = {};
for (const lang of ["si", "ta"]) {
  result[lang] = {};
  for (const [k, v] of Object.entries(en)) {
    const lv = DICTIONARIES[lang][k];
    if ((lv === undefined || lv === v) && !KEEP_KEYS.has(k) && !skippable(v)) result[lang][k] = v;
  }
}
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  for (const lang of ["si", "ta"]) {
    const keys = Object.keys(result[lang]);
    console.log(`${lang}: ${keys.length} untranslated`);
    for (const k of keys) console.log(`  ${k}: ${JSON.stringify(result[lang][k])}`);
  }
  if (process.argv.includes("--strict") && (Object.keys(result.si).length || Object.keys(result.ta).length)) process.exit(1);
}
