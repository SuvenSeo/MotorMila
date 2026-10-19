import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestRouter } from "@/test/testUtils";
import { AuthProvider } from "@/lib/authContext";
import ProDashboard from "@/pages/ProDashboard";
import type { ProDetailPayload, ProDistrictProfile, ProMarketSnapshot, ProVehicleLane } from "@/types/pro";

vi.mock("@/components/AIChatWidget", () => ({
  AIChatWidget: () => null,
}));

vi.mock("@/lib/proReports", () => ({
  customizeProReport: vi.fn((report, options = {}) => ({
    ...report,
    ...options,
    title: options.title || report.title,
    subtitle: options.subtitle || report.subtitle,
    filters: options.includeFilters === false ? undefined : report.filters,
    includeDisclaimer: options.includeDisclaimer,
  })),
  exportProReport: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  getProMarketSnapshot: vi.fn(),
  getProVehicleLanes: vi.fn(),
  getProDistricts: vi.fn(),
  getProVehicleLaneDetail: vi.fn(),
  getProDistrictDetail: vi.fn(),
  getProArbitrageGaps: vi.fn(),
}));

import {
  getProArbitrageGaps,
  getProDistricts,
  getProMarketSnapshot,
  getProVehicleLaneDetail,
  getProVehicleLanes,
} from "@/services/api";
import { exportProReport } from "@/lib/proReports";

function installLocalStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}

const snapshot = {
  generated_at: "2026-05-20T10:00:00Z",
  total_listings: 1200,
  avg_price_lkr: 8_400_000,
  median_price_lkr: 8_100_000,
  min_price_lkr: 1_200_000,
  max_price_lkr: 42_000_000,
  new_listings_7d: 82,
  districts_covered: 18,
  source_count: 4,
  hot_deal_count: 31,
  last_updated: "2026-05-20T09:30:00Z",
  source_coverage: [
    { label: "Ikman", count: 700, share_pct: 58.3, avg_price_lkr: 8_200_000, latest_seen_at: "2026-05-20T09:30:00Z" },
    { label: "Riyasewana", count: 500, share_pct: 41.7, avg_price_lkr: 8_600_000, latest_seen_at: "2026-05-20T09:10:00Z" },
  ],
  top_opportunities: [
    {
      id: 10,
      title: "Toyota Aqua 2018",
      make: "Toyota",
      model: "Aqua",
      year: 2018,
      price_lkr: 7_600_000,
      district: "Colombo",
      source: "Ikman",
      deal_score: 12.4,
    },
  ],
};

const lane = {
  make: "Toyota",
  model: "Aqua",
  listing_count: 2,
  avg_price_lkr: 7_700_000,
  median_price_lkr: 7_650_000,
  min_price_lkr: 7_600_000,
  max_price_lkr: 7_800_000,
  avg_deal_score: 11.2,
  district_count: 2,
  source_count: 2,
  top_district: "Colombo",
  top_source: "Ikman",
  latest_seen_at: "2026-05-20T09:30:00Z",
};

const detail = {
  kind: "vehicle_lane",
  title: "Toyota Aqua",
  summary: "2 priced listings tracked for this lane across Motormila sources.",
  generated_at: "2026-05-20T10:00:00Z",
  metrics: [
    { label: "Listings", value: "2", detail: "Priced, non-outlier inventory" },
    { label: "Median price", value: "Rs. 7,650,000" },
  ],
  source_mix: [{ label: "Ikman", count: 2, share_pct: 100, avg_price_lkr: 7_650_000 }],
  district_mix: [{ label: "Colombo", count: 1, share_pct: 50, avg_price_lkr: 7_600_000 }],
  trend_points: [
    { month: "2026-04", median_price_lkr: 7_500_000, avg_price_lkr: 7_550_000, listing_count: 4 },
    { month: "2026-05", median_price_lkr: 7_650_000, avg_price_lkr: 7_700_000, listing_count: 5 },
  ],
  sample_listings: [
    {
      id: 10,
      title: "Toyota Aqua 2018",
      make: "Toyota",
      model: "Aqua",
      year: 2018,
      price_lkr: 7_600_000,
      district: "Colombo",
      source: "Ikman",
      deal_score: 12.4,
    },
  ],
};

describe("ProDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installLocalStorage();
    localStorage.setItem(
      "motormila.auth_user",
      JSON.stringify({ email: "pro@motormila.lk", name: "Pro User", plan: "pro", avatarInitials: "PU" }),
    );
    vi.mocked(getProMarketSnapshot).mockResolvedValue(snapshot as ProMarketSnapshot);
    vi.mocked(getProVehicleLanes).mockResolvedValue([lane] as ProVehicleLane[]);
    vi.mocked(getProDistricts).mockResolvedValue([
      {
        district: "Colombo",
        listing_count: 640,
        avg_price_lkr: 8_400_000,
        median_price_lkr: 8_100_000,
        min_price_lkr: 1_200_000,
        max_price_lkr: 42_000_000,
        source_count: 2,
        top_make: "Toyota",
        top_model: "Aqua",
        latest_seen_at: "2026-05-20T09:30:00Z",
        top_models: [],
        source_mix: [],
        sample_listings: [],
      },
    ] as ProDistrictProfile[]);
    vi.mocked(getProVehicleLaneDetail).mockResolvedValue(detail as ProDetailPayload);
    vi.mocked(getProArbitrageGaps).mockResolvedValue([]);
  });

  it("keeps the panels that loaded when the market snapshot request fails", async () => {
    // Regression: the workspace loader used Promise.all, so a single failing
    // request discarded the lanes and districts that DID load, blanking the
    // whole command center (0 deals / 0 lanes / "Generated pending") even
    // though two of three endpoints were healthy.
    vi.mocked(getProMarketSnapshot).mockRejectedValue(new Error("internal server error"));

    render(
      <AuthProvider>
        <TestRouter>
          <ProDashboard />
        </TestRouter>
      </AuthProvider>,
    );

    // The surviving lane data is still on screen...
    fireEvent.click(await screen.findByRole("tab", { name: /vehicles/i }));
    expect(await screen.findByRole("button", { name: /Toyota Aqua/i })).toBeInTheDocument();

    // ...and it is not reported as a total workspace failure.
    expect(
      screen.queryByText(/Unable to load the Pro workspace/i),
    ).not.toBeInTheDocument();
  }, 10_000);

  it("reports a workspace error when every panel request fails", async () => {
    vi.mocked(getProMarketSnapshot).mockRejectedValue(new Error("boom"));
    vi.mocked(getProVehicleLanes).mockRejectedValue(new Error("boom"));
    vi.mocked(getProDistricts).mockRejectedValue(new Error("boom"));

    render(
      <AuthProvider>
        <TestRouter>
          <ProDashboard />
        </TestRouter>
      </AuthProvider>,
    );

    expect(
      await screen.findByText(/Unable to load the Pro workspace/i),
    ).toBeInTheDocument();
  }, 10_000);

  it("loads Pro data, switches to vehicle intelligence, and opens lane details", async () => {
    render(
      <AuthProvider>
        <TestRouter>
          <ProDashboard />
        </TestRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText(/Pro dashboard\./i)).toBeInTheDocument();
    expect(await screen.findByText(/1.2K/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /vehicles/i }));
    expect(await screen.findByText(/Make and model lanes/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Toyota Aqua/i }));

    await waitFor(() => {
      expect(getProVehicleLaneDetail).toHaveBeenCalledWith({ make: "Toyota", model: "Aqua" });
    });
    expect(await screen.findByText(/2 priced listings tracked/i)).toBeInTheDocument();
    expect(screen.getByText(/sample listings/i)).toBeInTheDocument();
  }, 10_000);

  it("shows arbitrage gaps table in the areas tab when gaps are available", async () => {
    vi.mocked(getProArbitrageGaps).mockResolvedValue([
      {
        buy_district: "Kandy",
        sell_district: "Colombo",
        buy_median_lkr: 6_300_000,
        sell_median_lkr: 7_300_000,
        gap_pct: 15.87,
        buy_listing_count: 8,
        sell_listing_count: 42,
      },
    ]);

    render(
      <AuthProvider>
        <TestRouter>
          <ProDashboard />
        </TestRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText(/Pro dashboard\./i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /areas/i }));

    expect(await screen.findByText(/Arbitrage gaps/i)).toBeInTheDocument();
    expect(await screen.findByText(/Kandy/)).toBeInTheDocument();
    expect(await screen.findByText(/\+15\.9%/)).toBeInTheDocument();
  }, 10_000);

  it("opens the report studio and builds a customized report payload", async () => {
    render(
      <AuthProvider>
        <TestRouter>
          <ProDashboard />
        </TestRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText(/1.2K/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /reports/i }));
    expect(await screen.findByText(/report composer/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /download custom report/i }));

    await waitFor(() => {
      expect(exportProReport).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: "executive-dark",
          sections: expect.arrayContaining(["metrics", "breakdowns", "listings", "disclaimer"]),
          filters: expect.objectContaining({
            scope: "Market summary",
            target: "All tracked market data",
          }),
        }),
        "pdf",
      );
    });
  });
});
