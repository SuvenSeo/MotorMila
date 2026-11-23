import { describe, expect, it } from "vitest";
import {
  DEFAULT_HERO_VARIANT_ID,
  getHeroVariant,
} from "@/lib/heroVariants";

describe("home hero layout", () => {
  it("ships the production hero as the studio-bay editorial (left) layout", () => {
    const variant = getHeroVariant(DEFAULT_HERO_VARIANT_ID);

    expect(variant.id).toBe("studio-bay");
    expect(variant.align).toBe("left");
    // Mode-aware plate: the night showroom by default, the daylight one in light mode.
    expect(variant.image.src).toMatch(/page_home_hero_showroom_dark/);
    expect(variant.imageLight?.src).toMatch(/page_home_hero_showroom_light/);
  });
});
