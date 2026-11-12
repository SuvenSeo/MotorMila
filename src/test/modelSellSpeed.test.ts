import { describe, expect, it } from "vitest";
import { computeModelSellSpeed, sellSpeedFromStats } from "@/lib/modelSellSpeed";

const NOW = Date.parse("2026-10-19T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe("model sell speed", () => {
  it("needs enough dated ads", () => {
    expect(computeModelSellSpeed(Array.from({ length: 10 }, () => ({ first_seen_at: daysAgo(3) })), { nowMs: NOW })).toBeNull();
    expect(computeModelSellSpeed(Array.from({ length: 30 }, () => ({ first_seen_at: null })), { nowMs: NOW })).toBeNull();
  });
  it("flags fast when the median live ad is young", () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ first_seen_at: daysAgo(i) }));
    expect(computeModelSellSpeed(rows, { nowMs: NOW })).toMatchObject({ fast: true, medianAgeDays: 12, sample: 25 });
  });
  it("is not fast for old stock and ignores inactive ads", () => {
    const rows = [
      ...Array.from({ length: 25 }, () => ({ first_seen_at: daysAgo(80) })),
      ...Array.from({ length: 40 }, () => ({ first_seen_at: daysAgo(1), is_active: false })),
    ];
    expect(computeModelSellSpeed(rows, { nowMs: NOW })).toMatchObject({ fast: false, sample: 25 });
  });
  it("accepts API stats with the same thresholds", () => {
    expect(sellSpeedFromStats(14, 50)).toMatchObject({ fast: true });
    expect(sellSpeedFromStats(14, 5)).toBeNull();
  });
});
