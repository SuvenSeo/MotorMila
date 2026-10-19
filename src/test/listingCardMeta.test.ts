import { describe, expect, it } from "vitest";
import { formatListedDateTime, getListingDealLabel, getListingRecencyLabel } from "@/lib/listing-card-meta";

describe("listing card metadata helpers", () => {
  it("maps deal scores to Good Deal, Fair Price, and Overpriced", () => {
    expect(getListingDealLabel(12)).toBe("Good Deal");
    expect(getListingDealLabel(3)).toBe("Fair Price");
    expect(getListingDealLabel(-8)).toBe("Overpriced");
  });

  it("formats recency from first_seen_at when present", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
    expect(getListingRecencyLabel(twoHoursAgo)).toBe("2h ago");
  });

  it("falls back to Today when date is missing", () => {
    expect(getListingRecencyLabel(null)).toBe("Today");
  });

  it("formats an absolute listed date+time in Sri Lanka time", () => {
    // 2026-05-19T10:05:00Z == 3:35 PM in Asia/Colombo (+05:30)
    expect(formatListedDateTime("2026-05-19T10:05:00+00:00")).toBe("19 May 2026, 3:35 PM");
  });

  it("returns null for missing or invalid listed timestamps", () => {
    expect(formatListedDateTime(null)).toBeNull();
    expect(formatListedDateTime(undefined)).toBeNull();
    expect(formatListedDateTime("not-a-date")).toBeNull();
  });
});
