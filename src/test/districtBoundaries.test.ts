import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { districtKey } from "@/components/leaflet/DistrictBoundaries";
import { SRI_LANKA_DISTRICTS } from "@/data/districts";

const FILE = resolve(__dirname, "../../public/geo/lk-districts.json");

describe("lk-districts.json (geoBoundaries ADM2)", () => {
  it("is under 150 KB and has all 25 districts matching the app's names", () => {
    expect(statSync(FILE).size).toBeLessThan(150_000);
    const geo = JSON.parse(readFileSync(FILE, "utf8"));
    expect(geo.features).toHaveLength(25);
    expect(String(geo.attribution)).toMatch(/geoBoundaries/);
    const fileKeys = new Set(geo.features.map((f: { properties: { name: string } }) => districtKey(f.properties.name)));
    for (const d of SRI_LANKA_DISTRICTS) expect(fileKeys.has(districtKey(d))).toBe(true);
  });

  it("normalises district names for matching", () => {
    expect(districtKey("Nuwara Eliya District")).toBe("nuwaraeliya");
    expect(districtKey("Moneragala")).toBe(districtKey("Monaragala"));
  });
});
