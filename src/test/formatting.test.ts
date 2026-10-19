import { describe, expect, it } from "vitest";
import {
  formatPriceLkrMillions,
  formatPriceTickMillions,
  formatRelativeTime,
  formatRelativeTimeI18n,
} from "@/lib/formatting";

describe("formatting helpers", () => {
  it("returns N/A when price is not provided", () => {
    expect(formatPriceLkrMillions(null)).toBe("N/A");
  });

  it("formats prices in lakhs below 100 L and Mn above", () => {
    expect(formatPriceLkrMillions(747000)).toBe("Rs 7.5 L");
    expect(formatPriceLkrMillions(7250000)).toBe("Rs 72.5 L");
    expect(formatPriceLkrMillions(14990000)).toBe("Rs 14.99 Mn");
  });

  it("formats axis ticks in lakhs / Mn", () => {
    expect(formatPriceTickMillions(7250000)).toBe("73 L");
    expect(formatPriceTickMillions(14990000)).toBe("15 Mn");
  });

  it("formats relative timestamps in hour/day buckets", () => {
    const now = new Date("2026-04-18T12:00:00Z");

    expect(formatRelativeTime(null, now)).toBe("never");
    expect(formatRelativeTime("2026-04-18T11:45:00Z", now)).toBe("just now");
    expect(formatRelativeTime("2026-04-18T10:30:00Z", now)).toBe("1h ago");
    expect(formatRelativeTime("2026-04-16T12:00:00Z", now)).toBe("2d ago");
  });

  it("formats relative timestamps via translator", () => {
    const now = new Date("2026-04-18T12:00:00Z");
    const t = (key: string, fallback?: string, vars?: Record<string, string | number | null | undefined>) => {
      if (key === "common.hoursAgo") return `${vars?.n}h ago`;
      if (key === "common.daysAgo") return `${vars?.n}d ago`;
      return fallback ?? key;
    };

    expect(formatRelativeTimeI18n(null, t, now)).toBe("never");
    expect(formatRelativeTimeI18n("2026-04-18T11:45:00Z", t, now)).toBe("just now");
    expect(formatRelativeTimeI18n("2026-04-18T10:30:00Z", t, now)).toBe("1h ago");
    expect(formatRelativeTimeI18n("2026-04-16T12:00:00Z", t, now)).toBe("2d ago");
  });
});
