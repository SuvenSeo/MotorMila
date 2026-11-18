import { describe, expect, it } from "vitest";
import {
  DEFAULT_HERO_VARIANT_ID,
  HERO_VARIANTS,
  PREVIEW_DEFAULT_HERO_VARIANT_ID,
  getHeroVariant,
  isHeroPreviewHost,
  resolveHeroTone,
} from "@/lib/heroVariants";

describe("home hero layout", () => {
  it("keeps baseline production default on night-drive and preview default on studio-bay", () => {
    const baseline = getHeroVariant(DEFAULT_HERO_VARIANT_ID);
    const preview = getHeroVariant(PREVIEW_DEFAULT_HERO_VARIANT_ID);

    expect(baseline.id).toBe("night-drive");
    expect(baseline.align).toBe("left");
    expect(preview.id).toBe("studio-bay");
    expect(preview.surfaceKind).toBe("cine-stage");
    expect(preview.image?.src).toMatch(/page_home_hero_studio/);
    expect(HERO_VARIANTS.map((v) => v.id)).toEqual([
      "evidence",
      "telemetry-map",
      "studio-bay",
      "plaster-gallery",
      "colombo-split",
      "night-drive",
    ]);
  });

  it("enables hero preview only on local hosts and Cloudflare Pages preview subdomains", () => {
    expect(isHeroPreviewHost("preview-hero-redesigns.motormila.pages.dev")).toBe(true);
    expect(isHeroPreviewHost("abc123.motormila.pages.dev")).toBe(true);
    expect(isHeroPreviewHost("localhost")).toBe(true);
    expect(isHeroPreviewHost("127.0.0.1")).toBe(true);

    expect(isHeroPreviewHost("motormila.pages.dev")).toBe(false);
    expect(isHeroPreviewHost("motormila.com")).toBe(false);
    expect(isHeroPreviewHost("www.motormila.com")).toBe(false);
    expect(isHeroPreviewHost("")).toBe(false);
    expect(isHeroPreviewHost(null)).toBe(false);
  });

  it("resolves fixed tones vs auto theme-following variants", () => {
    expect(resolveHeroTone(getHeroVariant("studio-bay"), "light")).toBe("dark");
    expect(resolveHeroTone(getHeroVariant("plaster-gallery"), "dark")).toBe("light");
    expect(resolveHeroTone(getHeroVariant("evidence"), "dark")).toBe("dark");
    expect(resolveHeroTone(getHeroVariant("evidence"), "light")).toBe("light");
  });
});

