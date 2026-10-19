import { TestRouter } from "@/test/testUtils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppPreferencesProvider } from "@/lib/appPreferences";
import { AuthProvider } from "@/lib/authContext";

vi.mock("@/components/SnapshotModeNotice", () => ({
  SnapshotModeNotice: () => null,
  default: () => null,
}));

vi.mock("@/components/StatsBar", () => ({
  StatsBar: () => <div>StatsBar</div>,
}));

vi.mock("@/components/FilterSidebar", () => ({
  FilterSidebar: () => <div>FilterSidebar</div>,
}));

vi.mock("@/components/ListingCard", () => ({
  ListingCard: () => <div>ListingCard</div>,
}));

vi.mock("@/components/MarketPredictor", () => ({
  MarketPredictor: () => <div>MarketPredictor</div>,
}));

vi.mock("@/components/MobileFilterSheet", () => ({
  MobileFilterSheet: () => null,
}));

vi.mock("@/components/ComparisonModal", () => ({
  ComparisonModal: () => null,
}));

vi.mock("@/components/PipelineStatusBar", () => ({
  PipelineStatusBar: () => <div>PipelineStatusBar</div>,
}));

vi.mock("@/components/RevealSection", () => ({
  RevealSection: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/useServerMarketAlerts", () => ({
  useServerMarketAlerts: () => ({
    alerts: [],
    loading: false,
    error: null,
    token: "test-token",
    refresh: () => Promise.resolve(),
    create: () => Promise.resolve(),
    remove: () => Promise.resolve(),
  }),
}));

vi.mock("@/services/api", () => ({
  APIError: class APIError extends Error {
    status = 500;
    detail = "";
  },
  LISTINGS_PAGE_SIZE: 12,
  SNAPSHOT_BASE: "",
  SNAPSHOT_ONLY: false,
  getStats: vi.fn(),
  getListings: vi.fn(),
  getDistrictPrices: vi.fn(),
  getMakes: vi.fn(),
  getModels: vi.fn(),
  getPriceTrends: vi.fn(),
  getPriceTrendSeries: vi.fn(),
  getListingSearchSuggestions: vi.fn(),
  getPipelineStatus: vi.fn(),
  getPipelineRuns: vi.fn(),
  triggerPipelineJob: vi.fn(),
  getLiveMarketSnapshot: vi.fn(),
  getLiveMarketStreamUrl: vi.fn().mockReturnValue("/api/v1/stats/live/stream"),
  getDashboardInsights: vi.fn(),
  getDistrictQuickInsight: vi.fn(),
  estimateCustomVehicle: vi.fn(),
  sendFeedback: vi.fn(),
  getListingThumbnailProxyUrl: vi.fn().mockReturnValue("https://example.com/thumbnail.jpg"),
  getFuelMix: vi.fn().mockResolvedValue({ total: 0, buckets: [], generated_at: new Date().toISOString() }),
  getHybridBands: vi.fn().mockResolvedValue({ total_hybrids: 0, bands: [], generated_at: new Date().toISOString() }),
  getOrCreateAlertToken: vi.fn().mockReturnValue("test-token-abc"),
  getAlerts: vi.fn().mockResolvedValue([]),
  createAlert: vi.fn(),
  deleteAlert: vi.fn(),
  matchAlerts: vi.fn().mockResolvedValue({ results: [], checked_at: new Date().toISOString() }),
  getDistrictVelocity: vi.fn().mockResolvedValue({ points: [], generated_at: new Date().toISOString() }),
  getPriceDrops: vi.fn().mockResolvedValue([]),
  formatPrice: (value: number | null) => (value == null ? "N/A" : `Rs. ${value}`),
}));

import Dashboard from "@/pages/Dashboard";
import * as api from "@/services/api";

function renderDashboard(initialEntries: string[] = ["/"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppPreferencesProvider>
          <TestRouter initialEntries={initialEntries}>
            <Dashboard />
          </TestRouter>
        </AppPreferencesProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getStats).mockResolvedValue(null);
  vi.mocked(api.getListings).mockResolvedValue({ listings: [], total: 0 });
  vi.mocked(api.getDistrictPrices).mockResolvedValue([]);
  vi.mocked(api.getMakes).mockResolvedValue([]);
  vi.mocked(api.getModels).mockResolvedValue([]);
  vi.mocked(api.getPriceTrends).mockResolvedValue([]);
  vi.mocked(api.getPriceTrendSeries).mockResolvedValue({ points: [], coverage_scope: "none", coverage_note: null });
  vi.mocked(api.getListingSearchSuggestions).mockResolvedValue([]);
  vi.mocked(api.getPipelineStatus).mockResolvedValue(null);
  vi.mocked(api.getPipelineRuns).mockResolvedValue({ count: 0, runs: [] });
  vi.mocked(api.getLiveMarketSnapshot).mockResolvedValue(null);
  vi.mocked(api.triggerPipelineJob).mockResolvedValue({
    accepted: true,
    job: "sync",
    pid: 1,
    command: "",
    started_at: new Date().toISOString(),
  });
  vi.mocked(api.getDashboardInsights).mockResolvedValue(null);
  vi.mocked(api.getDistrictQuickInsight).mockResolvedValue(null);
  vi.mocked(api.estimateCustomVehicle).mockResolvedValue(null);
});

describe("Dashboard runtime safety", () => {
  it("centers the home hero headline lockup", () => {
    renderDashboard(["/?hero=expressway-dusk"]);

    const heading = screen.getByRole("heading", {
      name: /sri lanka's entire vehicle market/i,
    });
    expect(heading).toHaveClass("display-hero--lockup");
    expect(heading.querySelector(".display-hero__lead")).not.toBeNull();
    expect(heading.querySelector(".display-hero__accent")).not.toBeNull();
  });

  it("renders the market pulse section without throwing", () => {
    renderDashboard();

    expect(screen.getByRole("heading", { name: /what.s moving right now/i })).toBeInTheDocument();
  });

  it("renders the trending models section", () => {
    renderDashboard();

    expect(screen.getByText(/trending models/i)).toBeInTheDocument();
  });

  it("hides spotlight deal card when dashboard insights only provide zero-priced deals", async () => {
    vi.mocked(api.getDashboardInsights).mockResolvedValue({
      new_listings_24h: 3,
      segment_performance: [],
      trending_models: [],
      hot_deals: [
        {
          id: 100,
          make: "Toyota",
          model: "Vitz",
          year: 2018,
          district: "Colombo",
          source: "ikman",
          price_lkr: 0,
          deal_score: 11,
          thumbnail_url: null,
        },
      ],
    });

    renderDashboard();

    await screen.findByRole("heading", { name: /what.s moving right now/i });
    expect(screen.queryByText(/Toyota\s+Vitz/i)).not.toBeInTheDocument();
  });

  it("loads safely when district is provided in URL query", async () => {
    renderDashboard(["/?district=Jaffna"]);

    await screen.findByText(/trending models/i);

    await waitFor(() => {
      expect(api.getListings).toHaveBeenCalled();
    });
  });

  it("shows listings error with Retry instead of empty-filter copy", async () => {
    vi.mocked(api.getListings).mockRejectedValue(new Error("listings down"));

    renderDashboard();

    expect(
      await screen.findByText(/couldn't load listings/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no results/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/widen your filters/i)).not.toBeInTheDocument();

    vi.mocked(api.getListings).mockResolvedValue({ listings: [], total: 0 });
    fireEvent.click(screen.getByRole("button", { name: /^retry$/i }));

    await waitFor(() => {
      expect(screen.getByText(/no results/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/couldn't load listings/i)).not.toBeInTheDocument();
  });
});
