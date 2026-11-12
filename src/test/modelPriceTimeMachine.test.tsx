import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelPriceTimeMachine } from "@/components/ModelPriceTimeMachine";

vi.mock("@/services/api", () => ({
  getModelPriceHistory: vi.fn(),
  formatPrice: (value: number | null) =>
    value == null ? "N/A" : `Rs. ${(value / 1_000_000).toFixed(1)}M`,
}));

import * as api from "@/services/api";

describe("ModelPriceTimeMachine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getModelPriceHistory).mockResolvedValue({
      make: "Toyota",
      model: "Aqua",
      from_year: 2010,
      to_year: 2026,
      calendar_series: {
        live_aggregates: [
          {
            period: "2024-06",
            period_year: 2024,
            period_month: 6,
            median_price_lkr: 7_500_000,
            listing_count: 20,
            origin: "live_aggregates",
          },
        ],
        archive_observations: [
          {
            period: "2018-03",
            period_year: 2018,
            period_month: 3,
            median_price_lkr: 3_200_000,
            listing_count: 8,
            origin: "archive_observations",
          },
        ],
      },
      cross_section_by_yom: [
        {
          yom: 2015,
          listing_count: 14,
          avg_price_lkr: 7_200_000,
          median_price_lkr: 7_000_000,
        },
      ],
      counts: {
        aggregate_points: 1,
        archive_points: 1,
        archive_listings: 8,
        yom_buckets: 1,
      },
      interpretation: {
        calendar_series: "Calendar median asks",
        cross_section_by_yom: "YOM cross-section note",
      },
    });
  });

  it("renders the time machine heading and mode toggles", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ModelPriceTimeMachine make="toyota" model="aqua" />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/Price Time Machine/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Calendar history/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /By manufacture year/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Archive months: 1/i)).toBeInTheDocument();
    });
  });
});
