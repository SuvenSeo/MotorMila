import { describe, expect, it } from "vitest";
import {
  formatLkrAxis,
  formatLkrAxisFromMillions,
  formatLkrCompact,
  formatLkrFull,
  formatLkrMonthly,
  formatLkrRange,
  groupThousands,
} from "@/lib/price";
import { formatPriceLkrLakhs, formatPriceLkrMillions, formatPriceTickMillions } from "@/lib/formatting";

describe("canonical LKR formatter", () => {
  it("always uses millions, never lakhs", () => {
    expect(formatLkrCompact(8_500_000)).toBe("Rs 8.5 Mn");
    expect(formatLkrCompact(7_250_000)).toBe("Rs 7.25 Mn");
    expect(formatLkrCompact(8_490_000)).toBe("Rs 8.49 Mn");
    expect(formatLkrCompact(100_000)).toBe("Rs 0.1 Mn");
    expect(formatLkrCompact(350_000)).toBe("Rs 0.35 Mn");
    expect(formatLkrCompact(747_000)).toBe("Rs 0.75 Mn");
    expect(formatLkrCompact(8_500_000)).not.toMatch(/ L$/);
  });

  it("keeps trimmed 2-decimal Mn above 10 million", () => {
    expect(formatLkrCompact(10_000_000)).toBe("Rs 10 Mn");
    expect(formatLkrCompact(12_500_000)).toBe("Rs 12.5 Mn");
    expect(formatLkrCompact(12_750_000)).toBe("Rs 12.75 Mn");
    expect(formatLkrCompact(9_997_000)).toBe("Rs 10 Mn");
  });

  it("keeps meaning for small amounts (2 significant digits under 0.1 Mn, full rupees under 10k)", () => {
    expect(formatLkrCompact(85_400)).toBe("Rs 0.085 Mn");
    expect(formatLkrCompact(12_000)).toBe("Rs 0.012 Mn");
    expect(formatLkrCompact(2_500)).toBe("Rs 2,500");
    expect(formatLkrCompact(0)).toBe("Rs 0");
  });

  it("never prints cents", () => {
    expect(formatLkrFull(477_589.37)).toBe("Rs 477,589");
    expect(formatLkrCompact(477_589.37)).toBe("Rs 0.48 Mn");
    expect(formatLkrMonthly(85_399.6)).toBe("Rs 85,400/mo");
    expect(groupThousands(1234567.89)).toBe("1,234,568");
  });

  it("formats full and monthly prices", () => {
    expect(formatLkrFull(7_250_000)).toBe("Rs 7,250,000");
    expect(formatLkrMonthly(85_400)).toBe("Rs 85,400/mo");
    expect(formatLkrMonthly(90_000)).not.toContain("M");
  });

  it("returns the fallback for missing values", () => {
    expect(formatLkrCompact(null)).toBe("N/A");
    expect(formatLkrCompact(undefined, "—")).toBe("—");
    expect(formatLkrFull(Number.NaN)).toBe("N/A");
    expect(formatLkrMonthly(Infinity)).toBe("N/A");
    expect(formatLkrCompact("8500000")).toBe("Rs 8.5 Mn");
  });

  it("formats chart ticks", () => {
    expect(formatLkrAxis(7_000_000)).toBe("7 Mn");
    expect(formatLkrAxis(500_000)).toBe("0.5 Mn");
    expect(formatLkrAxis(15_000_000)).toBe("15 Mn");
    expect(formatLkrAxis(0)).toBe("0");
    expect(formatLkrAxisFromMillions(7.9)).toBe("7.9 Mn");
    expect(formatLkrAxisFromMillions(12)).toBe("12 Mn");
  });

  it("formats ranges", () => {
    expect(formatLkrRange(3_000_000, 5_000_000)).toBe("Rs 3 Mn – Rs 5 Mn");
    expect(formatLkrRange(undefined, 3_000_000)).toBe("Under Rs 3 Mn");
    expect(formatLkrRange(10_000_000, undefined)).toBe("Rs 10 Mn+");
  });

  it("legacy helpers delegate to the canonical formatter", () => {
    expect(formatPriceLkrLakhs(8_500_000)).toBe("Rs 8.5 Mn");
    expect(formatPriceLkrMillions(12_500_000)).toBe("Rs 12.5 Mn");
    expect(formatPriceLkrMillions(null)).toBe("N/A");
    expect(formatPriceTickMillions(7_250_000)).toBe("7.25 Mn");
  });
});
