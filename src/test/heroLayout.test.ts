import { describe, expect, it } from "vitest";
import {
  DEFAULT_HERO_VARIANT_ID,
  getHeroVariant,
} from "@/lib/heroVariants";

describe("home hero layout", () => {
  it("ships the production hero as a centered copy lockup", () => {
    const variant = getHeroVariant(DEFAULT_HERO_VARIANT_ID);

    expect(variant.id).toBe("coastal-aerial");
    expect(variant.align).toBe("center");
  });
});
