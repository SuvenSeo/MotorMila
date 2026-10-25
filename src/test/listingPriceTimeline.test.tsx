import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListingPriceTimeline, niceMillionsAxis } from "@/components/ListingPriceTimeline";
import { TestRouter } from "@/test/testUtils";
import type { PriceHistoryInfo } from "@/types/car";

function renderTimeline(history: PriceHistoryInfo | null) {
  return render(
    <TestRouter>
      <ListingPriceTimeline history={history} marketMedianLkr={9_200_000} />
    </TestRouter>,
  );
}

const sampleHistory: PriceHistoryInfo = {
  listing_id: 1,
  points: [
    { price_lkr: 10_000_000, scraped_at: "2026-07-01T10:00:00Z" },
    { price_lkr: 9_500_000, scraped_at: "2026-07-10T10:00:00Z" },
    { price_lkr: 9_000_000, scraped_at: "2026-07-16T10:00:00Z" },
  ],
  first_price_lkr: 10_000_000,
  current_price_lkr: 9_000_000,
  change_pct: -10,
  cut_count: 2,
  raise_count: 0,
  last_change_at: "2026-07-16T10:00:00Z",
  tracked_points: 3,
};

describe("ListingPriceTimeline", () => {
  it("renders chart stats for multi-point history", () => {
    renderTimeline(sampleHistory);

    expect(screen.getByText("Price timeline")).toBeInTheDocument();
    expect(screen.getByText("-10.0%")).toBeInTheDocument();
    expect(screen.getByText("2↓")).toBeInTheDocument();
    expect(screen.getByText(/2 cuts recorded/i)).toBeInTheDocument();
  });

  it("renders  state for a single point", () => {
    renderTimeline({
      listing_id: 1,
      points: [{ price_lkr: 8_500_000, scraped_at: "2026-07-16T10:00:00Z" }],
      first_price_lkr: 8_500_000,
      current_price_lkr: 8_500_000,
      change_pct: 0,
      cut_count: 0,
      raise_count: 0,
      tracked_points: 1,
    });

    expect(screen.getByText(/Tracking started/i)).toBeInTheDocument();
    expect(screen.getByText(/chart fills in when the seller changes/i)).toBeInTheDocument();
  });

  it("returns null when history is empty", () => {
    const { container } = renderTimeline(null);
    expect(container.firstChild).toBeNull();
  });
});

describe("niceMillionsAxis", () => {
  it("snaps the price axis to round, evenly spaced ticks", () => {
    // 3 points from /listing/637176: 3.9M, 6.5M, 0.65M. The old domain topped out at an odd 7.2 Mn.
    expect(niceMillionsAxis([3.9, 6.5, 0.65])).toEqual({ domain: [0, 8], ticks: [0, 2, 4, 6, 8] });
    const tight = niceMillionsAxis([9, 9.5, 10], 9_200_000);
    expect(tight.ticks[0]).toBe(tight.domain[0]);
    expect(tight.ticks[tight.ticks.length - 1]).toBe(tight.domain[1]);
    const gaps = tight.ticks.slice(1).map((v, i) => +(v - tight.ticks[i]).toFixed(4));
    expect(new Set(gaps).size).toBe(1);
    expect(tight.ticks.length - 1).toBeLessThanOrEqual(5);
    expect(tight.domain[0]).toBeLessThanOrEqual(9);
    expect(tight.domain[1]).toBeGreaterThanOrEqual(10);
  });
});
