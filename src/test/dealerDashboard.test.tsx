import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DealerDashboard from "@/pages/DealerDashboard";
import {
  buildDealerNotifications,
  buildDistrictDemandRows,
  buildDistrictPriceGaps,
  buildTurnoverSeries,
} from "@/lib/dealerDashboardData";

vi.mock("@/services/api", () => ({
  getStats: vi.fn(),
  getDashboardInsights: vi.fn(),
  getDistrictPrices: vi.fn(),
  getProMarketSnapshot: vi.fn(),
  benchmarkDealerUrls: vi.fn(),
  claimDealerProfile: vi.fn(),
  getDealerProfile: vi.fn(),
  getStoredDealerClaimToken: vi.fn(() => null),
  storeDealerClaimToken: vi.fn(),
  formatPrice: (value: number | null) => (value == null ? "N/A" : `Rs. ${value.toLocaleString()}`),
}));

vi.mock("@/lib/authToken", () => ({
  getStoredAuthToken: vi.fn(() => null),
}));

import {
  getDashboardInsights,
  getDistrictPrices,
  getProMarketSnapshot,
  getStats,
} from "@/services/api";
import { AppPreferencesProvider } from "@/lib/appPreferences";
import { AuthProvider } from "@/lib/authContext";

function installLocalStorage(seed?: Record<string, unknown>) {
  const store = new Map<string, string>();
  if (seed) store.set("motormila.auth_user", JSON.stringify(seed));
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

function renderDealerDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <AppPreferencesProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <DealerDashboard />
          </MemoryRouter>
        </QueryClientProvider>
      </AuthProvider>
    </AppPreferencesProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  installLocalStorage({
    email: "dealer@example.com",
    name: "Dealer Pro",
    plan: "pro",
    subscriptionStatus: "active",
    role: "user",
    avatarInitials: "DP",
  });
  vi.mocked(getStats).mockResolvedValue({
    total_listings: 1200,
    avg_price_lkr: 8_400_000,
    listings_this_week: 82,
    price_change_mom: 1.2,
    top_makes: [],
    district_count: 18,
    good_deals_count: 14,
    source_count: 4,
    last_updated: "2026-05-20T09:30:00Z",
  });
  vi.mocked(getDashboardInsights).mockResolvedValue({
    new_listings_24h: 27,
    segment_performance: [],
    trending_models: [
      {
        make: "Toyota",
        model: "Aqua",
        listing_count: 141,
        avg_price_lkr: 7_800_000,
        movement_pct: 3.2,
        thumbnail_url: null,
      },
    ],
    hot_deals: [
      {
        id: 1,
        make: "Toyota",
        model: "Aqua",
        year: 2016,
        district: "Colombo",
        source: "ikman",
        price_lkr: 7_800_000,
        deal_score: 11,
        thumbnail_url: null,
      },
    ],
  });
  vi.mocked(getDistrictPrices).mockResolvedValue([
    {
      district: "Colombo",
      avg_price: 8_000_000,
      listing_count: 120,
      lat: 6.9,
      lng: 79.8,
      top_make: "Toyota",
      top_model: "Aqua",
    },
    {
      district: "Gampaha",
      avg_price: 8_512_000,
      listing_count: 90,
      lat: 7.0,
      lng: 79.9,
      top_make: "Suzuki",
      top_model: "Wagon R",
    },
  ]);
  vi.mocked(getProMarketSnapshot).mockRejectedValue(new Error("auth required"));
});

describe("DealerDashboard helpers", () => {
  it("builds turnover series from trending models", () => {
    const rows = buildTurnoverSeries({
      new_listings_24h: 1,
      segment_performance: [],
      trending_models: [
        {
          make: "Toyota",
          model: "Aqua",
          listing_count: 100,
          avg_price_lkr: 7_000_000,
          movement_pct: 2,
          thumbnail_url: null,
        },
      ],
      hot_deals: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ week: "Aqua", leads: 100 });
  });

  it("builds district price gaps from median spread", () => {
    const gaps = buildDistrictPriceGaps([
      { district: "Colombo", avg_price: 8_000_000, listing_count: 100, lat: 1, lng: 1 },
      { district: "Gampaha", avg_price: 9_000_000, listing_count: 80, lat: 2, lng: 2 },
    ]);

    expect(gaps).toHaveLength(2);
    expect(gaps[0]?.district).toBe("Colombo");
    expect(gaps[0]?.gapPct).toBeGreaterThan(0);
  });

  it("builds district demand rows with normalized scores", () => {
    const rows = buildDistrictDemandRows([
      {
        district: "Colombo",
        avg_price: 8_000_000,
        listing_count: 100,
        lat: 1,
        lng: 1,
        top_make: "Toyota",
        top_model: "Aqua",
      },
    ]);

    expect(rows[0]).toMatchObject({
      district: "Colombo",
      demandScore: 100,
      topModel: "Toyota Aqua",
      avgPrice: 8_000_000,
    });
  });

  it("builds notifications from hot deals and stats", () => {
    const notes = buildDealerNotifications(
      {
        new_listings_24h: 5,
        segment_performance: [],
        trending_models: [],
        hot_deals: [
          {
            id: 1,
            make: "Honda",
            model: "Vezel",
            year: 2017,
            district: "Kandy",
            source: "ikman",
            price_lkr: 9_800_000,
            deal_score: 10,
            thumbnail_url: null,
          },
        ],
      },
      {
        total_listings: 100,
        avg_price_lkr: 1,
        listings_this_week: 12,
        price_change_mom: 0,
        top_makes: [],
        district_count: 4,
        good_deals_count: 2,
        source_count: 2,
        last_updated: null,
      },
    );

    expect(notes.some((note) => note.includes("Honda Vezel"))).toBe(true);
    expect(notes.some((note) => note.includes("12 new listings this week"))).toBe(true);
  });
});

describe("DealerDashboard", () => {
  it("renders key dealer intelligence widgets", async () => {
    renderDealerDashboard();

    expect(screen.getByRole("heading", { name: /dealer command center/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Inventory Turnover" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Price Gaps" })).toBeInTheDocument();
  });

  it("renders API-backed metric values after load", async () => {
    renderDealerDashboard();

    await waitFor(() => {
      expect(screen.getByText("27")).toBeInTheDocument();
    });
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText(/Hot deal: Toyota Aqua 2016 in Colombo/i)).toBeInTheDocument();
  });
});
