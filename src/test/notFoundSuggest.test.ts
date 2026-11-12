import { describe, expect, it } from "vitest";
import { pathWords, suggestPages } from "@/lib/notFoundSuggest";

describe("404 suggestions", () => {
  it("splits a dead URL into words", () => {
    expect(pathWords("/Price-Trends/index.html")).toEqual(["price", "trends", "index"]);
  });
  it("maps common typed paths and typos to real pages", () => {
    expect(suggestPages("/prices")[0].to).toBe("/trends");
    expect(suggestPages("/tools")[0].to).toBe("/calculator");
    expect(suggestPages("/calculater")[0].to).toBe("/calculator");
    expect(suggestPages("/listings")[0].to).toBe("/#market");
    expect(suggestPages("/watchlist")[0].to).toBe("/alerts");
  });
  it("returns nothing for gibberish or the root", () => {
    expect(suggestPages("/zzqxw")).toEqual([]);
    expect(suggestPages("/")).toEqual([]);
  });
  it("caps the list", () => {
    expect(suggestPages("/price-tax-sell-compare-app", 3)).toHaveLength(3);
  });
});
