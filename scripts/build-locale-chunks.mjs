#!/usr/bin/env node
/**
 * build-locale-chunks — splits the English dictionary into on-disk chunks.
 *
 *   node scripts/build-locale-chunks.mjs [--check]
 *
 * Source of truth stays src/locales/{en,listing,shell,features,data,tools,
 * account,strings,content}.ts (merged in that order, exactly as locales/index.ts
 * used to spread them). This script writes the merged dictionary out as
 * prefix-partitioned modules under src/locales/chunks/:
 *
 *   core.ts    eager — entry chunk; the shell (nav/footer/meta/error) plus the
 *              home above-the-fold copy
 *   market.ts  deferred — listing cards, filters, search, market strips
 *   tools.ts   deferred — calculators, estimator, compare, permits, docs
 *   account.ts deferred — auth, settings, profile, plans, admin
 *   rest.ts    deferred — everything else (pricing, trends, pulse, dealer…)
 *
 * Partitioning happens on the *merged* dictionary, so a key exists in exactly
 * one chunk with its final (winning) value and merging every chunk reproduces
 * the old EN_DICTIONARY exactly. src/test/localeChunks.test.ts enforces that.
 *
 * --check  writes nothing; exits 1 if the files on disk are stale.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const LOCALES = path.join(ROOT, "src", "locales");
const OUT = path.join(LOCALES, "chunks");

const MERGE_ORDER = ["en", "listing", "shell", "features", "data", "tools", "account", "strings", "content"];

const LINE_RE = /^\s*"((?:[^"\\]|\\.)+)":\s*("(?:[^"\\]|\\.)*"),?\s*$/;

function readDictionary(name) {
  const file = path.join(LOCALES, `${name}.ts`);
  const map = new Map();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(LINE_RE);
    if (m) map.set(JSON.parse(`"${m[1]}"`), JSON.parse(m[2]));
  }
  return map;
}

const CORE_PREFIXES = [
  // Shell chrome — the modules App.tsx imports statically (Navbar → NavMoreMenu,
  // MobileBottomNav, MotormilaTearFooter, RouteMeta, effect gates) plus the
  // error boundaries in main.tsx and the home hero above the fold.
  "shell", "nav", "common", "footer", "seo", "mobile", "home", "hero",
  "freshness", "routeError", "errorBoundary", "palette", "ticker", "sourceMarquee",
  "freeBanner", "banner", "proGate", "snapshot", "upgrade", "theme", "language",
  "currency", "ui", "combobox", "trans", "compareTray", "authGate", "signInPortal",
  "notifications", "search", "filter", "alerts", "stats", "index", "valuation", "signals",
];

// Keys outside those prefixes that the shell still renders (the footer's map
// caption). src/test/localeChunks.test.ts fails the build if this list is short.
const CORE_EXTRA_KEYS = ["mapp.title"];

const MARKET_PREFIXES = [
  "listing", "deal", "verdict", "condition", "listingCard", "listingImage", "listingMeta",
  "thumbnail", "mileageTrust", "safety", "trust", "priceTimeline", "priceChart",
  "historyReport", "dealLadder", "lowData", "timeMachine", "sourceQuality", "body",
  "vehicle", "fuel", "fuelMix", "nhtsa", "trendTone", "intel", "sourceCredits",
];

const TOOLS_PREFIXES = [
  "tools", "calc", "calcNote", "estimate", "quiz", "howPrice", "comparePage", "permits",
  "taxModel", "taxBreakdown", "afford", "transfer", "howItWorks",
];

const CONTENT_PREFIXES = [
  "docs", "bot", "ev", "picks", "sell", "sellSpeed", "sellFast", "importEra", "mapp",
];

const ACCOUNT_PREFIXES = [
  "acct", "auth", "signin", "signup", "admin", "adminLogin", "profile", "settings",
  "plan", "apiError", "proPreview", "proDash", "deleteAcct", "adminGate",
];

const GROUPS = [
  { id: "core", prefixes: CORE_PREFIXES, exportName: "EN_CORE" },
  { id: "market", prefixes: MARKET_PREFIXES, exportName: "EN_MARKET" },
  { id: "tools", prefixes: TOOLS_PREFIXES, exportName: "EN_TOOLS" },
  { id: "content", prefixes: CONTENT_PREFIXES, exportName: "EN_CONTENT" },
  { id: "account", prefixes: ACCOUNT_PREFIXES, exportName: "EN_ACCOUNT" },
  { id: "rest", prefixes: [], exportName: "EN_REST" },
];

function build() {
  const merged = new Map();
  for (const name of MERGE_ORDER) {
    for (const [key, value] of readDictionary(name)) merged.set(key, value);
  }
  const claimed = new Map();
  for (const group of GROUPS) for (const p of group.prefixes) claimed.set(p, group.id);
  const coreKeys = new Set(CORE_EXTRA_KEYS);
  const buckets = Object.fromEntries(GROUPS.map((g) => [g.id, {}]));
  for (const [key, value] of merged) {
    const group = coreKeys.has(key) ? "core" : (claimed.get(key.split(".")[0]) ?? "rest");
    if (buckets[group][key] !== undefined) throw new Error(`duplicate key ${key}`);
    buckets[group][key] = value;
  }
  return GROUPS.map((group) => ({
    ...group,
    source: render(group, buckets[group.id]),
    keys: Object.keys(buckets[group.id]).length,
    bytes: Buffer.byteLength(JSON.stringify(buckets[group.id])),
  }));
}

function render(group, dict) {
  const keys = Object.keys(dict).sort();
  const body = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(dict[k])},`).join("\n");
  return `/**
 * GENERATED by scripts/build-locale-chunks.mjs — do not edit.
 * English dictionary chunk "${group.id}" (${keys.length} keys).
 * Regenerate with \`node scripts/build-locale-chunks.mjs\` after changing
 * src/locales/{en,listing,shell,features,data,tools,account,strings,content}.ts.
 */
export const ${group.exportName} = {
${body}
} as const;
`;
}

const chunks = build();
const stale = [];
for (const chunk of chunks) {
  const file = path.join(OUT, `${chunk.id}.ts`);
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (current !== chunk.source) stale.push(chunk);
}
const report = chunks
  .map((c) => `  ${c.id.padEnd(8)} ${String(c.keys).padStart(5)} keys  ${(c.bytes / 1024).toFixed(1).padStart(6)} kB raw`)
  .join("\n");
console.log(`English locale chunks:\n${report}`);

if (process.argv.includes("--check")) {
  if (stale.length) {
    console.log(`\nSTALE: ${stale.map((c) => c.id).join(", ")} — run node scripts/build-locale-chunks.mjs`);
    process.exit(1);
  }
  console.log("\nChunks are up to date.");
} else {
  fs.mkdirSync(OUT, { recursive: true });
  for (const chunk of stale) fs.writeFileSync(path.join(OUT, `${chunk.id}.ts`), chunk.source);
  console.log(`\nWrote ${stale.length} chunk file(s) to src/locales/chunks/.`);
}
