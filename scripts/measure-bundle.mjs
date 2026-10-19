#!/usr/bin/env node
// Measures the first-load critical path of a vite build: everything index.html
// references (entry, modulepreloads, stylesheets, preloaded images/fonts),
// raw / gzip / brotli. Usage: node scripts/measure-bundle.mjs [distDir]
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const dist = path.resolve(process.argv[2] || "dist");
const html = readFileSync(path.join(dist, "index.html"), "utf8");
const refs = new Set();
for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) {
  const ref = m[1].split("?")[0];
  if (/\.(js|css|woff2?|png|webp|avif|svg|jpg)$/.test(ref) && existsSync(path.join(dist, ref))) refs.add(ref);
}
const size = (buf) => ({
  raw: buf.length,
  gz: zlib.gzipSync(buf, { level: 9 }).length,
  br: zlib.brotliCompressSync(buf).length,
});
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
let tot = { raw: 0, gz: 0, br: 0 };
const rows = [];
for (const ref of refs) {
  const s = size(readFileSync(path.join(dist, ref)));
  const compressible = /\.(js|css|svg)$/.test(ref);
  const eff = compressible ? s : { raw: s.raw, gz: s.raw, br: s.raw };
  tot = { raw: tot.raw + eff.raw, gz: tot.gz + eff.gz, br: tot.br + eff.br };
  rows.push([ref, kb(eff.raw), kb(eff.gz), kb(eff.br)]);
}
const js = (dir) => readdirSync(dir).filter((f) => f.endsWith(".js"));
const assets = path.join(dist, "assets");
const allJs = js(assets);
const biggest = allJs
  .map((f) => [f, statSync(path.join(assets, f)).size])
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8);
console.log("Critical path (index.html):");
for (const r of rows) console.log(`  ${r[0].padEnd(52)} raw ${r[1].padStart(10)}  gz ${r[2].padStart(10)}  br ${r[3].padStart(10)}`);
console.log(`  TOTAL raw ${kb(tot.raw)}  gz ${kb(tot.gz)}  br ${kb(tot.br)}  (${refs.size} files)`);
console.log(`JS chunks: ${allJs.length}; largest:`);
for (const [f, n] of biggest) console.log(`  ${f.padEnd(52)} ${kb(n)}`);
const imgs = readdirSync(assets).filter((f) => /\.(webp|png|jpg|avif)$/.test(f)).map((f) => [f, statSync(path.join(assets, f)).size]).sort((a, b) => b[1] - a[1]).slice(0, 4);
console.log("Largest images:");
for (const [f, n] of imgs) console.log(`  ${f.padEnd(52)} ${kb(n)}`);
