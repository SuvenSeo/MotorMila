#!/usr/bin/env node
/**
 * i18n:check — find translation keys used in code (t("key", "fallback"))
 * that are missing from src/locales/{en,si,ta}.ts.
 *
 *   npm run i18n:check            report only (exit 1 if any key missing from en)
 *   npm run i18n:check -- --write add missing keys to en.ts using the code's fallback string,
 *                                 then copy any en key missing from si/ta as English fallback (parity)
 *   npm run i18n:check -- --json  machine-readable report
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "src");
const LOCALES = ["en", "si", "ta"];
const args = new Set(process.argv.slice(2));

const LINE_RE = /^\s*"((?:[^"\\]|\\.)+)":\s*("(?:[^"\\]|\\.)*"),?\s*$/;

export function readLocale(lang) {
  const file = path.join(SRC, "locales", `${lang}.ts`);
  const map = new Map();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(LINE_RE);
    if (m) map.set(JSON.parse(`"${m[1]}"`), JSON.parse(m[2]));
  }
  return map;
}

/**
 * Feature bundles (src/locales/<area>.ts, e.g. shell.ts / listing.ts / features.ts)
 * are spread into DICTIONARIES by locales/index.ts, with the bundle's English
 * entries as the si/ta fallback — so a key defined in any bundle counts as present
 * for every language.
 */
export function readBundleKeys() {
  const dir = path.join(SRC, "locales");
  const keys = new Set();
  for (const name of fs.readdirSync(dir)) {
    if (!/\.ts$/.test(name) || ["index.ts", ...LOCALES.map((l) => `${l}.ts`)].includes(name)) continue;
    for (const line of fs.readFileSync(path.join(dir, name), "utf8").split("\n")) {
      const m = line.match(LINE_RE);
      if (m) keys.add(JSON.parse(`"${m[1]}"`));
    }
  }
  return keys;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "locales") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(p);
  }
  return out;
}

// t("key") | t('key', "fallback") | t(`key`, `fallback`) — static strings only.
const STR = String.raw`("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\`(?:[^\`\\$]|\\.)*\`)`;
const CALL_RE = new RegExp(String.raw`(?<![\w.$])t\(\s*` + STR + String.raw`(?:\s*,\s*` + STR + ")?", "g");

function unquote(s) {
  const q = s[0];
  const body = s.slice(1, -1);
  if (q === '"') return JSON.parse(s);
  return JSON.parse(`"${body.replace(/\\'/g, "'").replace(/\\`/g, "`").replace(/"/g, '\\"')}"`);
}

export function scanCode() {
  const used = new Map(); // key -> { fallback, files:Set }
  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(CALL_RE)) {
      let key;
      try { key = unquote(m[1]); } catch { continue; }
      if (!/^[A-Za-z][\w-]*(\.[\w-]+)+$/.test(key)) continue; // dotted keys only
      let fallback;
      let dynamic = false;
      if (m[2]) { try { fallback = unquote(m[2]); } catch { /* ignore */ } }
      else if (/^\s*,/.test(text.slice(m.index + m[0].length))) dynamic = true; // computed fallback, e.g. `${days}-day trial`
      const rec = used.get(key) ?? { fallback: undefined, dynamic: false, files: new Set() };
      if (fallback && !rec.fallback) rec.fallback = fallback;
      if (dynamic) rec.dynamic = true;
      rec.files.add(path.relative(ROOT, file));
      used.set(key, rec);
    }
  }
  return used;
}

function main() {
  const used = scanCode();
  const dicts = Object.fromEntries(LOCALES.map((l) => [l, readLocale(l)]));
  // Keys whose fallback is computed at runtime must NOT be added to a dictionary
  // (a static entry would override the interpolated value) — report them separately.
  const dynamicKeys = [...used.keys()].filter((k) => used.get(k).dynamic && !used.get(k).fallback && !dicts.en.has(k)).sort();
  const checked = [...used.keys()].filter((k) => !dynamicKeys.includes(k));
  const bundleKeys = readBundleKeys();
  const missing = Object.fromEntries(LOCALES.map((l) => [l, checked.filter((k) => !dicts[l].has(k) && !bundleKeys.has(k)).sort()]));
  const noFallback = missing.en.filter((k) => !used.get(k).fallback);

  if (args.has("--write")) {
    const toAdd = missing.en.filter((k) => used.get(k).fallback);
    if (toAdd.length) {
      const file = path.join(SRC, "locales", "en.ts");
      const src = fs.readFileSync(file, "utf8");
      const lines = toAdd.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(used.get(k).fallback)},`).join("\n");
      fs.writeFileSync(file, src.replace(/\n\} as const;/, `\n${lines}\n} as const;`));
      console.log(`Added ${toAdd.length} keys to en.ts`);
      missing.en = missing.en.filter((k) => !used.get(k).fallback);
    }
    // si/ta must keep key parity with en (src/test/localeParity.test.ts). Untranslated
    // keys get the English string as an explicit fallback; translate them later.
    const enNow = readLocale("en");
    for (const lang of ["si", "ta"]) {
      const have = readLocale(lang);
      const fill = [...enNow.keys()].filter((k) => !have.has(k));
      if (!fill.length) continue;
      const file = path.join(SRC, "locales", `${lang}.ts`);
      const lines = fill.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(enNow.get(k))},`).join("\n");
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/\n\} as const;/, `\n${lines}\n} as const;`));
      console.log(`Filled ${fill.length} untranslated keys in ${lang}.ts with English fallback`);
      missing[lang] = [];
    }
  }

  if (args.has("--json")) {
    console.log(JSON.stringify({ used: used.size, missing, noFallback, dynamicKeys }, null, 2));
  } else {
    console.log(`i18n: ${used.size} static keys used in code`);
    for (const l of LOCALES) console.log(`  missing in ${l}.ts: ${missing[l].length}`);
    if (dynamicKeys.length) console.log(`  runtime-fallback keys (intentionally not in dictionaries): ${dynamicKeys.length}`);
    if (missing.en.length) {
      console.log("\nMissing from en.ts:");
      for (const k of missing.en) console.log(`  ${k}${used.get(k).fallback ? "" : "  (no fallback in code!)"}  — ${[...used.get(k).files][0]}`);
    }
  }
  process.exit(missing.en.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
