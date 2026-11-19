import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";
import { AppPreferencesProvider } from "@/lib/appPreferences";
import { TestRouter } from "@/test/testUtils";
import type { MakeModelInsight } from "@/types/car";

vi.mock("@/services/api", () => ({
  getMakeModelInsight: vi.fn(),
  getListings: vi.fn(),
  getListingsForExport: vi.fn(),
  getModelPriceHistory: vi.fn(),
  getVehicleSafetyResearch: vi.fn(),
  formatPrice: (value: number | null) =>
    value == null ? "N/A" : `Rs. ${(value / 1_000_000).toFixed(1)}M`,
}));

import MakeModelHub from "@/pages/MakeModelHub";
import * as api from "@/services/api";

const INSIGHT_FIXTURE: MakeModelInsight = {
  make: "Toyota",
  model: "Prius",
  total: 142,
  avg_price_lkr: 8_500_000,
  median_price_lkr: 8_200_000,
  top_districts: [
    { district: "Colombo", count: 54, avg_price_lkr: 8_700_000 },
    { district: "Kandy", count: 20, avg_price_lkr: 8_100_000 },
    { district: "Gampaha", count: 18, avg_price_lkr: 8_300_000 },
  ],
};

function renderHub(make = "toyota", model = "prius") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <AppPreferencesProvider>
      <QueryClientProvider client={queryClient}>
        <TestRouter initialEntries={[`/cars/${make}/${model}`]}>
          <Routes>
            <Route path="/cars/:make/:model" element={<MakeModelHub />} />
          </Routes>
        </TestRouter>
      </QueryClientProvider>
    </AppPreferencesProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getMakeModelInsight).mockResolvedValue(INSIGHT_FIXTURE);
  vi.mocked(api.getListings).mockResolvedValue({ listings: [], total: 0 });
  vi.mocked(api.getListingsForExport).mockResolvedValue({ listings: [], total: 0 });
  vi.mocked(api.getVehicleSafetyResearch).mockResolvedValue({
    make: "Toyota",
    model: "Prius",
    vehicle_key: "2015|toyota|prius",
    safety: {
      available: false,
      provider: "nhtsa",
      market_scope: "US federal (NHTSA)",
      fetched_at: "2026-08-18T00:00:00Z",
      match_confidence: null,
      limitation: "US research not available for this model.",
      data: null,
    },
    reliability: {
      available: false,
      provider: "problemsbyvin",
      market_scope: "US NHTSA-derived (ProblemsByVin)",
      fetched_at: "2026-08-18T00:00:00Z",
      match_confidence: null,
      limitation: "US research not available for this model.",
      data: null,
    },
  });
  vi.mocked(api.getModelPriceHistory).mockResolvedValue({
    make: "Toyota",
    model: "Prius",
    from_year: 2010,
    to_year: 2026,
    calendar_series: { live_aggregates: [], archive_observations: [] },
    cross_section_by_yom: [
      { yom: 2015, listing_count: 12, avg_price_lkr: 8_000_000, median_price_lkr: 7_800_000 },
    ],
    counts: {
      aggregate_points: 0,
      archive_points: 0,
      archive_listings: 0,
      yom_buckets: 1,
    },
    interpretation: {
      calendar_series: "Calendar",
      cross_section_by_yom: "YOM cross-section",
    },
  });
});

describe("MakeModelHub", () => {
  it("renders the hero heading with title-cased make and model", async () => {
    renderHub();
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    });
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/Toyota/i);
    expect(heading.textContent).toMatch(/Prius/i);
  });

  it("shows the market snapshot section heading", () => {
    renderHub();
    expect(screen.getByText(/market snapshot/i)).toBeInTheDocument();
  });

  it("displays live listing count after data loads", async () => {
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("142")).toBeInTheDocument();
    });
  });

  it("displays the district breakdown after data loads", async () => {
    renderHub();
    await waitFor(() => {
      expect(screen.getByText("Colombo")).toBeInTheDocument();
      expect(screen.getByText("Kandy")).toBeInTheDocument();
    });
  });

  it("renders CTA links to browse, trends, and estimate pages", () => {
    renderHub();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.includes("#market"))).toBe(true);
    expect(hrefs.some((h) => h.includes("/trends"))).toBe(true);
    expect(hrefs.some((h) => h.includes("/estimate"))).toBe(true);
  });

  it("sets document.title after insight data loads", async () => {
    renderHub();
    await waitFor(() => {
      expect(document.title).toMatch(/Toyota/i);
      expect(document.title).toMatch(/Prius/i);
    });
  });

  it("renders without crashing when API returns empty data", async () => {
    vi.mocked(api.getMakeModelInsight).mockResolvedValue({
      make: "Honda",
      model: "Fit",
      total: 0,
      avg_price_lkr: null,
      median_price_lkr: null,
      top_districts: [],
    });
    renderHub("honda", "fit");
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    });
  });

  it("shows an error message when the API call fails", async () => {
    vi.mocked(api.getMakeModelInsight).mockRejectedValue(new Error("Network error"));
    renderHub();
    await waitFor(() => {
      expect(screen.getByText(/could not load market data/i)).toBeInTheDocument();
    });
  });

  it("shows the price time machine section", async () => {
    renderHub();
    // The section is a lazy chunk now, so give the import room under load.
    expect(await screen.findByText(/Price Time Machine/i, {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
