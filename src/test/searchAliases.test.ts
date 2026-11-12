import { describe, expect, it } from "vitest";
import { normalizeSearchQuery, resolveSearchAlias } from "@/lib/searchAliases";

describe("normalizeSearchQuery", () => {
  it.each([
    ["wagonr", "wagon r"],
    ["wagon r", "wagon r"],
    ["Wagon-R", "wagon r"],
    ["aqua", "aqua"],
    ["akwa", "aqua"],
    ["premio", "premio"],
    ["primio", "premio"],
    ["vitz", "vitz"],
    ["vits", "vitz"],
    ["toyata akwa 2015", "toyota aqua 2015"],
    ["suzki wagan r fx", "suzuki wagon r fx"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeSearchQuery(input)).toBe(expected);
  });

  it("passes unknown words through", () => {
    expect(normalizeSearchQuery("kdh van 2014")).toBe("kdh van 2014");
    expect(normalizeSearchQuery("")).toBe("");
    expect(normalizeSearchQuery(null)).toBe("");
  });

  it("does not rewrite ordinary words that look like aliases", () => {
    expect(normalizeSearchQuery("7 days old")).toBe("7 days old");
  });
});

describe("resolveSearchAlias", () => {
  it("resolves a single model to make + model and keeps the rest", () => {
    expect(resolveSearchAlias("akwa 2015")).toMatchObject({ make: "Toyota", model: "Aqua", rest: "2015", corrected: true });
    expect(resolveSearchAlias("wagonr")).toMatchObject({ make: "Suzuki", model: "Wagon R", rest: "" });
    expect(resolveSearchAlias("primio")).toMatchObject({ make: "Toyota", model: "Premio" });
    expect(resolveSearchAlias("vits")).toMatchObject({ make: "Toyota", model: "Vitz" });
  });

  it("resolves a make alone", () => {
    expect(resolveSearchAlias("hundai")).toMatchObject({ make: "Hyundai", rest: "" });
    expect(resolveSearchAlias("hundai").model).toBeUndefined();
  });

  it("keeps ambiguous queries as text", () => {
    const r = resolveSearchAlias("aqua vs vitz");
    expect(r.make).toBeUndefined();
    expect(r.rest).toBe("aqua vs vitz");
    const mismatch = resolveSearchAlias("honda aqua");
    expect(mismatch.make).toBeUndefined();
  });

  it("flags uncorrected queries", () => {
    expect(resolveSearchAlias("aqua").corrected).toBe(false);
  });
});
