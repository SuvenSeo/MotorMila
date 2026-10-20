import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";

describe("PriceHistoryChart", () => {
  it("derives median and change from live trend points", () => {
    render(
      <PriceHistoryChart
        title="Colombo Market"
        points={[
          { month: "2026-01", median_price: 10000000, avg_price: 9800000, sample_count: 15 },
          { month: "2026-02", median_price: 12000000, avg_price: 11900000, sample_count: 18 },
        ]}
      />,
    );

    expect(screen.getByText("Rs. 12.00M")).toBeInTheDocument();
    expect(screen.getByText("+20.0%")).toBeInTheDocument();
  });

  it("renders a clear empty state when trend points are unavailable", () => {
    render(
      <PriceHistoryChart
        title="Kandy Market"
        points={[]}
        emptyMessage="No historical values available for this filter"
      />,
    );

    expect(screen.getByText("No historical values available for this filter")).toBeInTheDocument();
  });

  it("renders coverage notes for fallback trend data", () => {
    render(
      <PriceHistoryChart
        title="Toyota Vitz"
        points={[{ month: "2026-04", median_price: 7200000, avg_price: 7300000, sample_count: 8 }]}
        coverageNote="District samples are thin, so this chart shows the Sri Lanka-wide trend."
      />,
    );

    expect(screen.getByText(/District samples are thin/i)).toBeInTheDocument();
  });
});
