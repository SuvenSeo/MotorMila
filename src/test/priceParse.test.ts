import { describe, expect, it } from "vitest";
import { formatPriceInputDisplay, parsePriceInput } from "@/lib/priceParse";

describe("parsePriceInput", () => {
  it.each([
    ["85L", 8_500_000],
    ["85 L", 8_500_000],
    ["85 lakhs", 8_500_000],
    ["85 lakh", 8_500_000],
    ["85lks", 8_500_000],
    ["72.5 lacs", 7_250_000],
    ["8.5M", 8_500_000],
    ["8.5Mn", 8_500_000],
    ["8.5 mn", 8_500_000],
    ["8.5 million", 8_500_000],
    ["1.2 Cr", 12_000_000],
    ["850k", 850_000],
    ["Rs 7,250,000", 7_250_000],
    ["Rs. 7,250,000", 7_250_000],
    ["LKR 7250000", 7_250_000],
    ["7250000", 7_250_000],
    ["7,250,000/=", 7_250_000],
    ["85 ලක්ෂ", 8_500_000],
    ["8.5 மில்லியன்", 8_500_000],
  ])("parses %s", (input, expected) => {
    expect(parsePriceInput(input)).toBe(expected);
  });

  it("reads bare small numbers as millions (the display unit)", () => {
    expect(parsePriceInput("8.5")).toBe(8_500_000);
    expect(parsePriceInput("12")).toBe(12_000_000);
    expect(parsePriceInput("0.35")).toBe(350_000);
  });

  it("never returns cents", () => {
    expect(parsePriceInput("8.123456M")).toBe(8_123_456);
    expect(Number.isInteger(parsePriceInput("1.23456789 L"))).toBe(true);
  });

  it("rejects junk", () => {
    expect(parsePriceInput("")).toBeNull();
    expect(parsePriceInput("   ")).toBeNull();
    expect(parsePriceInput(null)).toBeNull();
    expect(parsePriceInput("abc")).toBeNull();
    expect(parsePriceInput("85 apples")).toBeNull();
    expect(parsePriceInput("Rs")).toBeNull();
  });
});

describe("formatPriceInputDisplay", () => {
  it("adds thousands separators to plain numbers", () => {
    expect(formatPriceInputDisplay("7250000")).toBe("7,250,000");
    expect(formatPriceInputDisplay("7,2500,00")).toBe("7,250,000");
    expect(formatPriceInputDisplay("850")).toBe("850");
  });

  it("leaves shorthand untouched while typing", () => {
    expect(formatPriceInputDisplay("85L")).toBe("85L");
    expect(formatPriceInputDisplay("8.5 mn")).toBe("8.5 mn");
  });
});
