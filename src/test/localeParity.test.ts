import { describe, expect, it } from "vitest";
import { DICTIONARIES, interpolate, LOCALE_TAGS } from "@/locales/all";

describe("locale dictionaries", () => {
  it("keeps en/si/ta key sets in parity", () => {
    const enKeys = Object.keys(DICTIONARIES.en).sort();
    const siKeys = Object.keys(DICTIONARIES.si).sort();
    const taKeys = Object.keys(DICTIONARIES.ta).sort();

    expect(enKeys.length).toBeGreaterThan(800);
    expect(siKeys).toEqual(enKeys);
    expect(taKeys).toEqual(enKeys);
  });

  it("preserves placeholders across languages", () => {
    const placeholder = /\{(\w+)\}/g;
    for (const key of Object.keys(DICTIONARIES.en)) {
      const enPh = new Set([...(DICTIONARIES.en[key].matchAll(placeholder))].map((m) => m[1]));
      const siPh = new Set([...(DICTIONARIES.si[key].matchAll(placeholder))].map((m) => m[1]));
      const taPh = new Set([...(DICTIONARIES.ta[key].matchAll(placeholder))].map((m) => m[1]));
      expect(siPh, key).toEqual(enPh);
      expect(taPh, key).toEqual(enPh);
    }
  });

  it("maps language codes to Sri Lanka locale tags", () => {
    expect(LOCALE_TAGS).toEqual({ en: "en-LK", si: "si-LK", ta: "ta-LK" });
  });

  it("interpolates vars and leaves unknown placeholders intact", () => {
    expect(interpolate("Hello {name}", { name: "Lanka" })).toBe("Hello Lanka");
    expect(interpolate("Count {n}", { n: 3 })).toBe("Count 3");
    expect(interpolate("Keep {missing}", {})).toBe("Keep {missing}");
  });
});
