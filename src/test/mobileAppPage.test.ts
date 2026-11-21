import { describe, expect, it } from "vitest";
import { BRAND } from "@/lib/brand";
import manifest from "@/lib/approvedAndroidStable.json";
import { approvedAndroidRelease, selectApprovedRelease } from "@/lib/approvedAndroidRelease";
import { MOBILE_APP_QR_PATH, MOBILE_APP_QR_SIZE, MOBILE_APP_QR_URL } from "@/lib/mobileAppQr";

const future = { ...manifest.fallback, version: "2.0.0", version_code: 30, bytes: 8_250_000, sha256: "a".repeat(64) };

describe("/mobile-app approved stable channel", () => {
  it("pins the emulator-tested rollback artifact independently of approvals", () => {
    expect(selectApprovedRelease(null)).toEqual({
      channel: "stable", version: "1.8.0", version_code: 21, bytes: 5_800_279, size: "5.8 MB",
      sha256: "6d9d417bf837deb6277d387318e88acc79fdcef6f95d6ed401cfd7258732634f",
      published_at: "2026-10-30T21:55:11Z",
      apkUrl: "https://pub-f15911ef9a914db9a44e1fd6b47dfe4e.r2.dev/app/motormila-1.8.0.apk",
    });
  });

  it("fails the PR check if a checked-in approval was rejected", () => {
    expect(approvedAndroidRelease).toEqual({
      ...(manifest.approved ?? manifest.fallback), apkUrl: expect.any(String), size: expect.any(String),
    });
  });

  it("derives every release field from the same future approval", () => {
    expect(selectApprovedRelease(future)).toEqual({ ...future, size: "8.3 MB",
      apkUrl: "https://pub-f15911ef9a914db9a44e1fd6b47dfe4e.r2.dev/app/motormila-2.0.0.apk" });
  });

  it.each([
    { channel: "preview" }, { version: "2.0.0-rc.1" }, { version: "1.9.1" }, { version_code: 23 },
    { sha256: "d36d624adf29210e07a0232026b51f105cdaab4c561191d2cfb57f97bfa0e349" },
    { version: "../../user.apk" }, { apk_url: "https://example.invalid/file.apk" },
    { sha256: "invalid" }, { bytes: 0 }, { bytes: 1.5 }, { published_at: "not a date" },
  ])("falls back for disallowed metadata %j", (override) => {
    expect(selectApprovedRelease({ ...future, ...override })).toEqual(selectApprovedRelease(null));
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
