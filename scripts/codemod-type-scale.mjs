#!/usr/bin/env node
/**
 * Codemod: arbitrary font sizes -> type-scale classes (exact-size matches only).
 *   node scripts/codemod-type-scale.mjs [--write] <files...>
 * Sizes without an exact scale step (10px, 14px, 12.5px, …) are left alone and reported.
 */
import fs from "node:fs";
const MAP = {
  "11px": "2xs", "0.6875rem": "2xs",
  "12px": "xs", "0.75rem": "xs",
  "13px": "sm", "0.8125rem": "sm",
  "15px": "base", "0.9375rem": "base",
  "17px": "lg", "1.0625rem": "lg",
  "20px": "xl", "1.25rem": "xl",
  "24px": "2xl", "1.5rem": "2xl",
  "30px": "3xl", "1.875rem": "3xl",
  "36px": "4xl", "2.25rem": "4xl",
  "48px": "5xl", "3rem": "5xl",
};
const write = process.argv.includes("--write");
const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const RE = /(?<![\w-])text-\[([0-9.]+(?:px|rem))\]/g;
let changed = 0; const left = {};
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  let n = 0;
  const out = src.replace(RE, (m, size) => {
    if (MAP[size]) { n++; return `text-${MAP[size]}`; }
    left[size] = (left[size] || 0) + 1; return m;
  });
  if (n) { changed += n; if (write) fs.writeFileSync(f, out); console.log(`${n}\t${f}`); }
}
console.log(`converted: ${changed}${write ? "" : " (dry run)"}`);
console.log("left (no exact step):", JSON.stringify(left));
