import { describe, expect, it } from "vitest";
import { localizeCalcNote } from "./calcNotesI18n";
import { DICTIONARIES, interpolate } from "@/locales/all";

const tFor = (lang: "en" | "si" | "ta") => (key: string, fallback?: string, vars?: Record<string, string | number>) =>
  interpolate(DICTIONARIES[lang][key] ?? fallback ?? key, vars);

describe("localizeCalcNote", () => {
  const note = "Calculated with 300 USD/LKR rate. Includes 50% CID surcharge per gazette. Computed on-device (offline engine).";
  it("keeps English wording in en", () => {
    expect(localizeCalcNote(note, tFor("en"))).toBe(note);
  });
  it("translates known sentences and keeps numbers", () => {
    const si = localizeCalcNote(note, tFor("si"));
    expect(si).toContain("300");
    expect(si).not.toContain("Calculated with");
    expect(localizeCalcNote("Model year 2016 is ~10 years old — typically outside practical used-import windows even after the ban lift.", tFor("ta"))).toContain("2016");
  });
  it("passes unknown sentences through", () => {
    expect(localizeCalcNote("Brand new server note. Using fallback fuel prices.", tFor("ta"))).toMatch(/^Brand new server note\. /);
  });
});
