import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListingPriceTimeline } from "@/components/ListingPriceTimeline";
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
