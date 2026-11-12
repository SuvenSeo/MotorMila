import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND } from "@/lib/brand";
import { MOBILE_APP_QR_PATH, MOBILE_APP_QR_SIZE, MOBILE_APP_QR_URL } from "@/lib/mobileAppQr";

const ROOT = path.resolve(__dirname, "../..");
const page = readFileSync(path.join(ROOT, "src/pages/MobileApp.tsx"), "utf8");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "public/app/latest-release.json"), "utf8")) as {
  version: string;
  version_code: number;
  apk_url: string;
  sha256: string;
};
const gradle = readFileSync(path.join(ROOT, "android/app/build.gradle.kts"), "utf8");

const constant = (name: string) => {
  const match = page.match(new RegExp(`const ${name} = ([^;]+);`));
  if (!match) throw new Error(`${name} not found in MobileApp.tsx`);
  return match[1].trim();
};

describe("/mobile-app release constants", () => {
  it("match the in-app updater manifest", () => {
    expect(constant("APK_VERSION")).toBe(`"${manifest.version}"`);
    expect(Number(constant("APK_VERSION_CODE"))).toBe(manifest.version_code);
    expect(constant("APK_SHA256")).toBe(`"${manifest.sha256}"`);
    const url = constant("APK_URL").replace(/^`|`$/g, "").replace("${APK_VERSION}", manifest.version);
    expect(url).toBe(manifest.apk_url);
  });

  it("match the Android build", () => {
    expect(gradle).toContain(`versionName = ${constant("APK_VERSION")}`);
    expect(gradle).toContain(`versionCode = ${constant("APK_VERSION_CODE")}`);
  });
});

describe("/mobile-app QR code", () => {
  it("encodes this page on the canonical origin", () => {
    expect(MOBILE_APP_QR_URL).toBe(`${BRAND.origin}/mobile-app`);
  });

  it("stays inside its module grid and keeps the three finder patterns", () => {
    const dark = new Set<string>();
    for (const [, x, y, w] of MOBILE_APP_QR_PATH.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
      for (let i = 0; i < Number(w); i += 1) dark.add(`${Number(x) + i},${y}`);
    }
    const n = MOBILE_APP_QR_SIZE;
    for (const cell of dark) {
      const [x, y] = cell.split(",").map(Number);
      expect(x).toBeLessThan(n);
      expect(y).toBeLessThan(n);
    }
    // Finder pattern corners: top-left, top-right, bottom-left are dark; the
    // ring one module in is light.
    for (const [cx, cy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      expect(dark.has(`${cx},${cy}`)).toBe(true);
      expect(dark.has(`${cx + 6},${cy + 6}`)).toBe(true);
      expect(dark.has(`${cx + 1},${cy + 1}`)).toBe(false);
      expect(dark.has(`${cx + 3},${cy + 3}`)).toBe(true);
    }
  });
});
