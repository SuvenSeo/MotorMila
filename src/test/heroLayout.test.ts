import { describe, expect, it } from "vitest";
import {
  DEFAULT_HERO_VARIANT_ID,
  getHeroVariant,
} from "@/lib/heroVariants";

describe("home hero layout", () => {
  it("ships the production hero as the night-drive editorial (left) layout", () => {
    const variant = getHeroVariant(DEFAULT_HERO_VARIANT_ID);

    expect(variant.id).toBe("night-drive");
    expect(variant.align).toBe("left");
  });
});
