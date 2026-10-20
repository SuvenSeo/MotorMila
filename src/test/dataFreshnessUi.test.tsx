import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataFreshnessIndicator } from "@/components/DataFreshnessIndicator";
import { MarketIntelligencePanel } from "@/components/MarketIntelligencePanel";
import { PipelineStatusBar } from "@/components/PipelineStatusBar";
import { StatsBar } from "@/components/StatsBar";
import type { LiveMarketSnapshot, StatsOverview } from "@/types/car";

const now = new Date("2026-07-13T18:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

const freshStats: StatsOverview = {
  total_listings: 1200,
  avg_price_lkr: 7_500_000,
  listings_this_week: 42,
  price_change_mom: -1.2,
  top_makes: [],
  district_count: 18,
  good_deals_count: 24,
  source_count: 8,
  last_updated: "2026-07-13T17:30:00Z",
};

const staleStats: StatsOverview = {
  ...freshStats,
  last_updated: "2026-07-13T09:00:00Z",
};

const freshSnapshot: LiveMarketSnapshot = {
  generated_at: "2026-07-13T17:55:00Z",
  total_listings: 1300,
  priced_listings: 1200,
  unavailable_price_listings: 100,
  avg_price_lkr: 7_500_000,
  latest_listing_at: "2026-07-13T17:40:00Z",
  active_scrape_sources: ["ikman", "riyasewana"],
  latest_run: null,
  source_status: [
    {
      source: "ikman",
      status: "success",
      started_at: "2026-07-13T17:50:00Z",
      finished_at: "2026-07-13T17:54:00Z",
      listings_found: 900,
      listings_new: 12,
    },
  ],
  latest_listings: [],
};

describe("DataFreshnessIndicator", () => {
  it("shows a data-as-of badge for fresh listing data", () => {
    render(
      <DataFreshnessIndicator
        latestListingAt={freshSnapshot.latest_listing_at}
        lastUpdated={freshStats.last_updated}
        now={now}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/Data as of/i);
    expect(screen.queryByText(/Stale/i)).not.toBeInTheDocument();
  });

  it("shows a stale banner when listing data is older than six hours", () => {
    render(
      <DataFreshnessIndicator
        lastUpdated={staleStats.last_updated}
        variant="banner"
        now={now}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/Listing data is 9h old/i);
    expect(screen.getByText(/Data as of 9h ago/i)).toBeInTheDocument();
  });
});

describe("MarketIntelligencePanel freshness", () => {
  it("renders synced feed timing and data-as-of copy", () => {
    render(
      <MarketIntelligencePanel snapshot={freshSnapshot} stats={freshStats} insights={null} />,
    );

    expect(screen.getByText(/Synced 5m/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Data as of/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/stats refreshed 30m ago/i)).toBeInTheDocument();
  });

  it("surfaces a stale warning when listing data is older than six hours", () => {
    render(
      <MarketIntelligencePanel
        snapshot={{ ...freshSnapshot, latest_listing_at: "2026-07-13T08:00:00Z" }}
        stats={staleStats}
        insights={null}
      />,
    );

    expect(screen.getByText(/Listing data is 10h old/i)).toBeInTheDocument();
    expect(screen.getByText(/Stale · 10h/i)).toBeInTheDocument();
  });

  it("shows building history when month-over-month change is unavailable", () => {
    render(
      <MarketIntelligencePanel
        snapshot={freshSnapshot}
        stats={{ ...freshStats, price_change_mom: null }}
        insights={null}
      />,
    );

    expect(screen.getByText("Building history")).toBeInTheDocument();
  });
});

describe("StatsBar freshness", () => {
  it("renders data-as-of subline metadata", () => {
    render(<StatsBar stats={freshStats} latestListingAt={freshSnapshot.latest_listing_at} />);

    expect(screen.getByText(/Data as of/i)).toBeInTheDocument();
    expect(screen.getByText(/8 sources/i)).toBeInTheDocument();
  });
});

describe("PipelineStatusBar freshness", () => {
  it("shows listing freshness alongside pipeline refresh timing", () => {
    render(
      <PipelineStatusBar
        status={{
          generated_at: "2026-07-13T17:58:00Z",
          overall_status: "ok",
          jobs: [],
        }}
        latestListingAt={freshSnapshot.latest_listing_at}
        lastUpdated={freshStats.last_updated}
      />,
    );

    expect(screen.getByText(/Data as of/i)).toBeInTheDocument();
    expect(screen.getByText(/Pipeline refreshed/i)).toBeInTheDocument();
  });
});
