import { describe, expect, it } from "vitest";
import { plausibleEngineCc } from "@/lib/engineCapacity";

describe("plausibleEngineCc", () => {
  it("keeps sane capacities", () => {
    expect(plausibleEngineCc(1498, 2019)).toBe(1498);
    expect(plausibleEngineCc(300, 2015)).toBe(300);
    expect(plausibleEngineCc(8000, 2020)).toBe(8000);
  });

  it("rejects the manufacture year leaked into engine cc", () => {
    expect(plausibleEngineCc(2016, 2016)).toBeUndefined();
    expect(plausibleEngineCc(2007, 2007)).toBeUndefined();
  });

  it("rejects implausible values", () => {
    expect(plausibleEngineCc(150, 2018)).toBeUndefined();
    expect(plausibleEngineCc(20000, 2018)).toBeUndefined();
    expect(plausibleEngineCc(null, 2018)).toBeUndefined();
    expect(plausibleEngineCc("1498", 2018)).toBeUndefined();
    expect(plausibleEngineCc(NaN, 2018)).toBeUndefined();
  });

  it("does not need a year to sanity-check the range", () => {
    expect(plausibleEngineCc(1498, null)).toBe(1498);
    expect(plausibleEngineCc(150, null)).toBeUndefined();
  });
});
