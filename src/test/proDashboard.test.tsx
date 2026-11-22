import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import { TestRouter } from "@/test/testUtils";
import { AuthProvider } from "@/lib/authContext";
import ProDashboard from "@/pages/ProDashboard";
import type {
  ProArbitrageGap,
  ProDetailPayload,
  ProDistrictProfile,
  ProMarketPulse,
  ProMarketSnapshot,
  ProVehicleLane,
} from "@/types/pro";

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
  getProMarketPulse: vi.fn(),
  getProPriceIndex: vi.fn(),
  getDistrictVelocity: vi.fn(),
  getImportEraSplit: vi.fn(),
  getSourceQuality: vi.fn(),
}));

import {
  getDistrictVelocity,
  getImportEraSplit,
  getProArbitrageGaps,
  getProDistricts,
  getProMarketPulse,
  getProMarketSnapshot,
  getProPriceIndex,
  getProVehicleLaneDetail,
  getProVehicleLanes,
  getSourceQuality,
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
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
}

const snapshot: ProMarketSnapshot = {
  generated_at: "2026-11-20T10:00:00Z",
  total_listings: 1200,
  avg_price_lkr: 8_400_000,
  median_price_lkr: 8_100_000,
  min_price_lkr: 1_200_000,
  max_price_lkr: 42_000_000,
  new_listings_7d: 82,
  districts_covered: 18,
  source_count: 2,
  hot_deal_count: 31,
  last_updated: "2026-11-20T09:30:00Z",
  source_coverage: [
    { label: "Ikman", count: 700, share_pct: 58.3, avg_price_lkr: 8_200_000, latest_seen_at: "2026-11-20T09:30:00Z" },
    { label: "Riyasewana", count: 500, share_pct: 41.7, avg_price_lkr: 8_600_000, latest_seen_at: "2026-11-20T09:10:00Z" },
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
      first_seen_at: "2026-11-18T09:00:00Z",
      last_seen_at: "2026-11-20T09:30:00Z",
    },
  ],
};

const lane: ProVehicleLane = {
  make: "Toyota",
  model: "Aqua",
  listing_count: 12,
  avg_price_lkr: 7_700_000,
  median_price_lkr: 7_650_000,
  min_price_lkr: 6_100_000,
  max_price_lkr: 9_800_000,
  avg_deal_score: 11.2,
  district_count: 2,
  source_count: 2,
  top_district: "Colombo",
  top_source: "Ikman",
  latest_seen_at: "2026-11-20T09:30:00Z",
  change_90d_pct: -4.2,
  new_7d_count: 3,
  spark_6m: [
    { month: "2026-06", median_price_lkr: 7_950_000, listing_count: 9 },
    { month: "2026-09", median_price_lkr: 7_800_000, listing_count: 11 },
    { month: "2026-11", median_price_lkr: 7_650_000, listing_count: 12 },
  ],
};

const district: ProDistrictProfile = {
  district: "Colombo",
  listing_count: 640,
  avg_price_lkr: 8_400_000,
  median_price_lkr: 8_100_000,
  min_price_lkr: 1_200_000,
  max_price_lkr: 42_000_000,
  source_count: 2,
  top_make: "Toyota",
  top_model: "Aqua",
  latest_seen_at: "2026-11-20T09:30:00Z",
  top_models: [],
  source_mix: [{ label: "Ikman", count: 480, share_pct: 75, avg_price_lkr: 8_200_000 }],
  sample_listings: [],
};

const detail: ProDetailPayload = {
  kind: "vehicle_lane",
  title: "Toyota Aqua",
  summary: "12 priced listings tracked for this lane across Motormila sources.",
  generated_at: "2026-11-20T10:00:00Z",
  metrics: [
    { label: "Listings", value: "12", detail: "Priced, non-outlier inventory" },
    { label: "Median price", value: "Rs. 7,650,000" },
  ],
  source_mix: [{ label: "Ikman", count: 12, share_pct: 100, avg_price_lkr: 7_650_000 }],
  district_mix: [{ label: "Colombo", count: 8, share_pct: 66.7, avg_price_lkr: 7_600_000 }],
  trend_points: [
    { month: "2026-06", median_price_lkr: 7_950_000, avg_price_lkr: 8_050_000, listing_count: 9 },
    { month: "2026-08", median_price_lkr: 7_800_000, avg_price_lkr: 7_900_000, listing_count: 11 },
    { month: "2026-11", median_price_lkr: 7_650_000, avg_price_lkr: 7_700_000, listing_count: 12 },
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

const pulse: ProMarketPulse = {
  generated_at: "2026-11-20T10:00:00Z",
  new_24h: 12,
  new_7d: 82,
  daily_supply: Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`, count: 5 + (i % 7) })),
  price_deciles: Array.from({ length: 10 }, (_, i) => ({ label: `D${i + 1}`, low_lkr: i * 1_000_000, high_lkr: (i + 1) * 1_000_000, count: 100 })),
  deal_score_bands: [
    { label: "<0", count: 200, share_pct: 20 },
    { label: "0-5", count: 300, share_pct: 30 },
    { label: "5-10", count: 300, share_pct: 30 },
    { label: "10-15", count: 150, share_pct: 15 },
    { label: ">=15", count: 50, share_pct: 5 },
  ],
  days_to_clear: { median_days: 21, p25_days: 12, p75_days: 34, sample_size: 240 },
  price_cut_share: { cut_count: 180, tracked_count: 1200, share_pct: 15 },
};

const gap: ProArbitrageGap = {
  buy_district: "Kandy",
  sell_district: "Colombo",
  buy_median_lkr: 6_800_000,
  sell_median_lkr: 7_900_000,
  gap_pct: 16.2,
  buy_listing_count: 5,
  sell_listing_count: 9,
  make: "Toyota",
  model: "Aqua",
};

function renderDesk(path = "/pro") {
  return render(
    <TestRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/pro/:mode?" element={<ProDashboard />} />
        </Routes>
      </AuthProvider>
    </TestRouter>,
  );
}

describe("ProDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installLocalStorage();
    localStorage.setItem(
      "motormila.auth_user",
      JSON.stringify({ email: "pro@example.com", name: "Pro User", plan: "pro", avatarInitials: "PU" }),
    );
    vi.mocked(getProMarketSnapshot).mockResolvedValue(snapshot);
    vi.mocked(getProVehicleLanes).mockResolvedValue([lane]);
    vi.mocked(getProDistricts).mockResolvedValue([district]);
    vi.mocked(getProVehicleLaneDetail).mockResolvedValue(detail);
    vi.mocked(getProArbitrageGaps).mockResolvedValue([gap]);
    vi.mocked(getProMarketPulse).mockResolvedValue(pulse);
    vi.mocked(getProPriceIndex).mockResolvedValue({
      base_period: "2025-11",
      points: [
        { period: "2026-09", index_value: 101.2, mom_change_pct: 0.4, median_price_lkr: 8_000_000, sample_size: 900 },
        { period: "2026-10", index_value: 102.8, mom_change_pct: 1.6, median_price_lkr: 8_050_000, sample_size: 950 },
        { period: "2026-11", index_value: 104.1, mom_change_pct: 1.3, median_price_lkr: 8_100_000, sample_size: 980 },
      ],
      segments: {
        Toyota: [
          { period: "2026-10", index_value: 103.5, mom_change_pct: 1.1 },
          { period: "2026-11", index_value: 106.4, mom_change_pct: 2.8 },
        ],
      },
    });
    vi.mocked(getDistrictVelocity).mockResolvedValue({
      generated_at: "2026-11-20T10:00:00Z",
      points: [{ district: "Colombo", lat: 6.9, lng: 79.8, listing_count: 640, new_7d_count: 40, velocity_score: 6.3 }],
    });
    vi.mocked(getImportEraSplit).mockResolvedValue({
      makes: [],
      generated_at: "2026-11-20T10:00:00Z",
    } as never);
    vi.mocked(getSourceQuality).mockResolvedValue({
      generated_at: "2026-11-20T10:00:00Z",
      sources: [
        { source: "ikman", listing_count: 700, price_fill_rate: 0.94, fresh_24h_pct: 0.88, outlier_rate: 0.02, duplicate_rate: 0.03 },
      ],
    });
  });

  it("opens on the market desk with the index and the opportunity gap", async () => {
    renderDesk();
    expect(await screen.findByText(/median asking price/i)).toBeInTheDocument();
    expect(await screen.findByText(/the index, not the average/i)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Toyota Aqua/i })).toBeInTheDocument();
    // The gap column is the point of the desk: the listing sits under its lane median.
    expect(screen.getAllByText(/−0\.7%|0\.7%/).length).toBeGreaterThan(0);
  });

  it("keeps the panels that loaded when the market snapshot request fails", async () => {
    vi.mocked(getProMarketSnapshot).mockRejectedValue(new Error("internal server error"));
    renderDesk("/pro/lanes");
    expect(await screen.findByText("Toyota Aqua")).toBeInTheDocument();
    expect(screen.queryByText(/did not answer/i)).not.toBeInTheDocument();
  });

  it("reports a workspace error only when every core request fails", async () => {
    vi.mocked(getProMarketSnapshot).mockRejectedValue(new Error("down"));
    vi.mocked(getProVehicleLanes).mockRejectedValue(new Error("down"));
    vi.mocked(getProDistricts).mockRejectedValue(new Error("down"));
    renderDesk();
    expect(await screen.findByText(/did not answer/i)).toBeInTheDocument();
  });

  it("switches to the lane table and opens a lane without leaving the desk", async () => {
    renderDesk("/pro/lanes");
    expect(await screen.findByText("Toyota Aqua")).toBeInTheDocument();
    expect(await screen.findByText(/4\.2%/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Toyota Aqua/i }));
    await waitFor(() => expect(getProVehicleLaneDetail).toHaveBeenCalledWith({ make: "Toyota", model: "Aqua" }));
    expect(await screen.findByText(/12 priced listings tracked/i)).toBeInTheDocument();
  });

  it("scans the whole market for arbitrage when no lane is chosen", async () => {
    renderDesk("/pro/geographies");
    expect(await screen.findByText(/Kandy/)).toBeInTheDocument();
    expect(await screen.findByText(/\+16\.2%/)).toBeInTheDocument();
    await waitFor(() => expect(getProArbitrageGaps).toHaveBeenCalledWith(undefined, undefined, 12));
  });

  it("builds a custom report from the studio drawer", async () => {
    renderDesk();
    fireEvent.click(await screen.findByRole("button", { name: /reports/i }));
    expect(await screen.findByText(/report studio/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /download report/i }));
    await waitFor(() =>
      expect(exportProReport).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Motormila Pro Market Summary",
          filters: expect.objectContaining({ scope: "Market summary", target: "Full market" }),
        }),
        "pdf",
      ),
    );
  });

  it("shows the trust page with pipeline rates", async () => {
    renderDesk("/pro/sources");
    expect(await screen.findByText(/source quality/i)).toBeInTheDocument();
    expect((await screen.findAllByText("Ikman")).length).toBeGreaterThan(0);
  });
});
