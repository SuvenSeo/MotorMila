import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { DICTIONARIES } from "@/locales/all";
import { EN_CORE } from "@/locales/chunks/core";
import { EN_MARKET } from "@/locales/chunks/market";
import { EN_TOOLS } from "@/locales/chunks/tools";
import { EN_CONTENT } from "@/locales/chunks/content";
import { EN_ACCOUNT } from "@/locales/chunks/account";
import { EN_REST } from "@/locales/chunks/rest";

const ROOT = path.resolve(__dirname, "../..");
const CHUNKS = { core: EN_CORE, market: EN_MARKET, tools: EN_TOOLS, content: EN_CONTENT, account: EN_ACCOUNT, rest: EN_REST };

/**
 * Files that render in the entry chunk's module graph — App.tsx and everything
 * it imports statically (nav, footer, mobile dock, route meta, error
 * boundaries, notice banners). Their keys must be in EN_CORE: that is the whole
 * promise of the split, since these components paint before any deferred chunk
 * can arrive. lib/lazyPage.ts additionally awaits chunks per route for pages.
 */
const SHELL_FILES = [
  "src/App.tsx",
  "src/main.tsx",
  "src/components/Navbar.tsx",
  "src/components/NavMoreMenu.tsx",
  "src/components/MobileBottomNav.tsx",
  "src/components/MotormilaTearFooter.tsx",
  "src/components/RouteMeta.tsx",
  "src/components/RouteErrorBoundary.tsx",
  "src/components/AppErrorBoundary.tsx",
  "src/components/ErrorFallback.tsx",
  "src/components/RouteFallback.tsx",
  "src/components/LocaleSwitcher.tsx",
  "src/components/MobileAppPromo.tsx",
  "src/components/NavFreshnessIndicator.tsx",
  "src/components/CommandPalette.tsx",
  "src/components/compare/CompareTray.tsx",
];

const STR = String.raw`("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')`;
const CALL_RE = new RegExp(String.raw`(?<![\w.$])t\(\s*` + STR + String.raw`(?:\s*,\s*` + STR + ")?", "g");

function unquote(literal: string): string {
  const body = literal.slice(1, -1);
  if (literal[0] === '"') return JSON.parse(literal);
  return JSON.parse(`"${body.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`);
}

type Usage = { key: string; fallback?: string; file: string };

function usagesIn(file: string): Usage[] {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  const out: Usage[] = [];
  for (const match of text.matchAll(CALL_RE)) {
    const key = unquote(match[1]);
    if (!/^[A-Za-z][\w-]*(\.[\w-]+)+$/.test(key)) continue;
    out.push({ key, fallback: match[2] ? unquote(match[2]) : undefined, file });
  }
  return out;
}

describe("English locale chunks", () => {
  it("are disjoint and together rebuild the full dictionary", () => {
    const seen = new Map<string, string>();
    for (const [id, chunk] of Object.entries(CHUNKS)) {
      for (const [key, value] of Object.entries(chunk)) {
        expect(seen.has(key), `${key} appears in ${seen.get(key)} and ${id}`).toBe(false);
        seen.set(key, id);
      }
    }
    expect([...seen.keys()].sort()).toEqual(Object.keys(DICTIONARIES.en).sort());
    for (const [key, id] of seen) {
      expect(DICTIONARIES.en[key], `${key} (from ${id})`).toEqual(CHUNKS[id as keyof typeof CHUNKS][key]);
    }
  });

  it("resolve every key the shell renders straight from the eager core", () => {
    const missing: string[] = [];
    let checked = 0;
    for (const file of SHELL_FILES) {
      for (const usage of usagesIn(file)) {
        checked++;
        if (EN_CORE[usage.key] === undefined) missing.push(`${usage.key} (${file})`);
      }
    }
    expect(checked).toBeGreaterThan(100);
    // Not a bare key and not a deferred load: the shell paints from the core.
    expect(missing).toEqual([]);
  });

  it("never change text when a deferred chunk arrives late", () => {
    const deferred = { ...EN_MARKET, ...EN_TOOLS, ...EN_CONTENT, ...EN_ACCOUNT, ...EN_REST };
    // Every consumer of these renders on a route whose pageRoute awaits their
    // chunk, so the dictionary value replaces the fallback before first paint.
    const gatedBeforeRender = new Set(["listing.compareFull", "pulse.feedDesc"]);
    const drifted: string[] = [];
    for (const dir of ["src/pages", "src/components", "src/lib", "src/hooks"]) {
      const walk = (current: string) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
            for (const usage of usagesIn(path.relative(ROOT, full))) {
              if (usage.fallback === undefined || !(usage.key in deferred)) continue;
              if (gatedBeforeRender.has(usage.key)) continue;
              if (deferred[usage.key] !== usage.fallback) drifted.push(`${usage.key} (${usage.file})`);
            }
          }
        }
      };
      walk(path.join(ROOT, dir));
    }
    expect(drifted).toEqual([]);
  });

  it("are in sync with the dictionaries they are generated from", () => {
    const output = execFileSync(process.execPath, ["scripts/build-locale-chunks.mjs", "--check"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(output).toContain("Chunks are up to date.");
  });
});
