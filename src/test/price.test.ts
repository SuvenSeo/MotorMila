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
  it("uses lakhs below 100 L", () => {
    expect(formatLkrCompact(8_500_000)).toBe("Rs 85 L");
    expect(formatLkrCompact(7_250_000)).toBe("Rs 72.5 L");
    expect(formatLkrCompact(8_490_000)).toBe("Rs 84.9 L");
    expect(formatLkrCompact(100_000)).toBe("Rs 1 L");
    expect(formatLkrCompact(747_000)).toBe("Rs 7.5 L");
  });

  it("switches to Mn at 100 L (10 million)", () => {
    expect(formatLkrCompact(10_000_000)).toBe("Rs 10 Mn");
    expect(formatLkrCompact(12_500_000)).toBe("Rs 12.5 Mn");
    expect(formatLkrCompact(12_750_000)).toBe("Rs 12.75 Mn");
    expect(formatLkrCompact(9_997_000)).toBe("Rs 10 Mn");
  });

  it("shows small amounts in full rupees, never 0.0xM", () => {
    expect(formatLkrCompact(85_400)).toBe("Rs 85,400");
    expect(formatLkrCompact(2_500)).toBe("Rs 2,500");
    expect(formatLkrCompact(0)).toBe("Rs 0");
  });

  it("never prints cents", () => {
    expect(formatLkrFull(477_589.37)).toBe("Rs 477,589");
    expect(formatLkrCompact(477_589.37)).toBe("Rs 4.8 L");
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
    expect(formatLkrCompact("8500000")).toBe("Rs 85 L");
  });

  it("formats chart ticks", () => {
    expect(formatLkrAxis(7_000_000)).toBe("70 L");
    expect(formatLkrAxis(500_000)).toBe("5 L");
    expect(formatLkrAxis(15_000_000)).toBe("15 Mn");
    expect(formatLkrAxis(0)).toBe("0");
    expect(formatLkrAxisFromMillions(7.9)).toBe("79 L");
    expect(formatLkrAxisFromMillions(12)).toBe("12 Mn");
  });

  it("formats ranges", () => {
    expect(formatLkrRange(3_000_000, 5_000_000)).toBe("Rs 30 L – Rs 50 L");
    expect(formatLkrRange(undefined, 3_000_000)).toBe("Under Rs 30 L");
    expect(formatLkrRange(10_000_000, undefined)).toBe("Rs 10 Mn+");
  });

  it("legacy helpers delegate to the canonical formatter", () => {
    expect(formatPriceLkrLakhs(8_500_000)).toBe("Rs 85 L");
    expect(formatPriceLkrMillions(12_500_000)).toBe("Rs 12.5 Mn");
    expect(formatPriceLkrMillions(null)).toBe("N/A");
    expect(formatPriceTickMillions(7_250_000)).toBe("73 L");
  });
});
