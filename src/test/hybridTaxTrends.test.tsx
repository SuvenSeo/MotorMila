import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Trends from "@/pages/Trends";
import * as api from "@/services/api";
import { AppPreferencesProvider } from "@/lib/appPreferences";
import { AuthProvider } from "@/lib/authContext";
import {
  getExciseRatePerCc,
  getHybridExciseCliffInsight,
  HYBRID_EXCISE_CLIFF_CC,
} from "@/lib/importTaxModel";
import type { HybridBandsData } from "@/types/car";

// ─── Unit tests for the tax model helper functions ───────────────────────────

describe("getExciseRatePerCc (hybrid band logic)", () => {
  it("returns the ≤1500 cc band rate at the cliff", () => {
    expect(getExciseRatePerCc("hybrid", 1500)).toBe(3_850);
  });

  it("returns a higher rate for one cc above the cliff", () => {
    expect(getExciseRatePerCc("hybrid", 1501)).toBe(4_700);
  });

  it("the mid band (1501–2000) rate is higher than the low band", () => {
    const low = getExciseRatePerCc("hybrid", 1500);
    const mid = getExciseRatePerCc("hybrid", 1800);
    expect(mid).toBeGreaterThan(low);
  });

  it("the high band (>2000) rate is higher than the mid band", () => {
    const mid = getExciseRatePerCc("hybrid", 2000);
    const high = getExciseRatePerCc("hybrid", 2200);
    expect(high).toBeGreaterThan(mid);
  });

  it("HYBRID_EXCISE_CLIFF_CC equals 1500", () => {
    expect(HYBRID_EXCISE_CLIFF_CC).toBe(1500);
  });
});

describe("getHybridExciseCliffInsight", () => {
  it("cliff is at 1500 cc", () => {
    const insight = getHybridExciseCliffInsight();
    expect(insight.cliffCc).toBe(1500);
  });

  it("rateAtOrBelowCliff is 3850", () => {
    const insight = getHybridExciseCliffInsight();
    expect(insight.rateAtOrBelowCliff).toBe(3_850);
  });

  it("rateAboveCliff is 4700", () => {
    const insight = getHybridExciseCliffInsight();
    expect(insight.rateAboveCliff).toBe(4_700);
  });

  it("exciseStepUp equals (1501 × 4700) − (1500 × 3850)", () => {
    const insight = getHybridExciseCliffInsight();
    const expected = 1501 * 4_700 - 1500 * 3_850;
    expect(insight.exciseStepUp).toBe(expected);
  });

  it("exciseSavingVsPetrolAtCliff reflects hybrid vs petrol difference at 1500 cc", () => {
    const insight = getHybridExciseCliffInsight();
    // petrol at 1500 = 4450 LKR/cc, hybrid at 1500 = 3850 LKR/cc
    const expected = 1500 * (4_450 - 3_850);
    expect(insight.exciseSavingVsPetrolAtCliff).toBe(expected);
  });

  it("exciseAtCliff equals 1500 × rateAtOrBelowCliff", () => {
    const insight = getHybridExciseCliffInsight();
    expect(insight.exciseAtCliff).toBe(1500 * insight.rateAtOrBelowCliff);
  });

  it("step-up is positive (crossing cliff always costs more)", () => {
    const insight = getHybridExciseCliffInsight();
    expect(insight.exciseStepUp).toBeGreaterThan(0);
  });

  it("hybrid saving vs petrol at cliff is positive (hybrids cost less to import)", () => {
    const insight = getHybridExciseCliffInsight();
    expect(insight.exciseSavingVsPetrolAtCliff).toBeGreaterThan(0);
  });
});

// ─── UI tests for the HybridTaxArbitrageSection ──────────────────────────────

const MOCK_HYBRID_BANDS: HybridBandsData = {
  total_hybrids: 2_050,
  generated_at: "2026-07-01T00:00:00Z",
  bands: [
    { label: "≤ 1500 cc", cc_max: 1500, count: 1_450, median_price_lkr: 5_200_000 },
    { label: "1501–2000 cc", cc_max: 2000, count: 450, median_price_lkr: 8_100_000 },
    { label: "> 2000 cc", cc_max: null, count: 150, median_price_lkr: 13_500_000 },
  ],
};

const ROUTER_FLAGS = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock("@/services/api", () => ({
  getMakes: vi.fn().mockResolvedValue([{ make: "Toyota", count: 10 }]),
  getModels: vi.fn().mockResolvedValue([{ model: "Aqua", count: 5 }]),
  getPriceTrendSeries: vi.fn().mockResolvedValue({ points: [], coverage_note: null }),
  getHybridBands: vi.fn(),
  getImportEraSplit: vi.fn().mockResolvedValue({
    makes: [],
    freeze_boundary_year: 2025,
    generated_at: "2026-07-14T00:00:00Z",
  }),
  formatPrice: (v: number | null) => (v == null ? "N/A" : `Rs. ${(v / 1_000_000).toFixed(1)}M`),
}));

vi.mock("@/data/districts", () => ({
  SRI_LANKA_DISTRICTS: ["Colombo", "Gampaha"],
}));

function installProAuth() {
  const store = new Map<string, string>();
  store.set(
    "motormila.auth_user",
    JSON.stringify({
      email: "pro@example.com",
      name: "Pro User",
      plan: "pro",
      subscriptionStatus: "active",
      role: "user",
      avatarInitials: "PU",
    }),
  );
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

async function renderTrends() {
  installProAuth();
  const result = render(
    <AppPreferencesProvider>
      <AuthProvider>
        <MemoryRouter future={ROUTER_FLAGS}>
          <Trends />
        </MemoryRouter>
      </AuthProvider>
    </AppPreferencesProvider>,
  );
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: /make/i })).toHaveTextContent("Toyota");
  });
  return result;
}

describe("Trends page — hybrid tax arbitrage section (UI)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getMakes).mockResolvedValue([{ make: "Toyota", count: 10 }]);
    vi.mocked(api.getModels).mockResolvedValue([{ model: "Aqua", count: 5 }]);
    vi.mocked(api.getPriceTrendSeries).mockResolvedValue({
      points: [],
      coverage_scope: "none",
      coverage_note: null,
    });
    vi.mocked(api.getHybridBands).mockResolvedValue(MOCK_HYBRID_BANDS);
  });

  it("renders the hybrid tax arbitrage section heading", async () => {
    await renderTrends();
    await waitFor(() => {
      expect(screen.getByText("Hybrid tax arbitrage bands")).toBeInTheDocument();
    });
  });

  it("shows the 1500 cc cliff callout", async () => {
    await renderTrends();
    await waitFor(() => {
      expect(screen.getByText(/1,500 cc excise cliff/i)).toBeInTheDocument();
    });
  });

  it("renders all three band rows", async () => {
    await renderTrends();
    await waitFor(() => {
      expect(screen.getByRole("listitem", { name: /≤ 1500 cc hybrid band/i })).toBeInTheDocument();
      expect(screen.getByRole("listitem", { name: /1501.2000 cc hybrid band/i })).toBeInTheDocument();
      expect(screen.getByRole("listitem", { name: /> 2000 cc hybrid band/i })).toBeInTheDocument();
    });
  });

  it("shows listing counts for each band", async () => {
    await renderTrends();
    await waitFor(() => {
      expect(screen.getByText("1,450 listings")).toBeInTheDocument();
      expect(screen.getByText("450 listings")).toBeInTheDocument();
      expect(screen.getByText("150 listings")).toBeInTheDocument();
    });
  });

  it("marks the ≤1500 cc band as the Tax cliff band", async () => {
    await renderTrends();
    await waitFor(() => {
      expect(screen.getByText("Tax cliff ↓")).toBeInTheDocument();
    });
  });

  it("shows lowest hybrid rate text for ≤1500 cc band", async () => {
    await renderTrends();
    await waitFor(() => {
      expect(screen.getByText(/lowest hybrid rate/i)).toBeInTheDocument();
    });
  });

  it("renders bar progress elements for each band", async () => {
    await renderTrends();
    await waitFor(() => {
      const bars = screen.getAllByRole("img", { name: /median price bar/i });
      expect(bars.length).toBe(3);
    });
  });

  it("the ≤1500 cc band bar is narrower than the >2000 cc bar", async () => {
    await renderTrends();
    await waitFor(() => {
      const bars = screen.getAllByRole("img", { name: /median price bar/i });
      const widths = bars.map((el) => {
        const style = (el as HTMLElement).style.width;
        return parseFloat(style);
      });
      // lowest-price band should have a smaller bar than the highest-price band
      expect(widths[0]).toBeLessThan(widths[2]);
    });
  });

  it("shows loading skeleton while hybrid data is being fetched", async () => {
    let resolve!: (v: HybridBandsData) => void;
    const pending = new Promise<HybridBandsData>((res) => { resolve = res; });

    vi.mocked(api.getHybridBands).mockReturnValue(pending);

    await renderTrends();
    expect(screen.getByLabelText("Loading hybrid band data")).toBeInTheDocument();

    resolve(MOCK_HYBRID_BANDS);
    await waitFor(() => {
      expect(screen.queryByLabelText("Loading hybrid band data")).not.toBeInTheDocument();
    });
  });

  it("shows error message when getHybridBands rejects", async () => {
    vi.mocked(api.getHybridBands).mockRejectedValue(new Error("network"));

    await renderTrends();
    await waitFor(() => {
      expect(
        screen.getByText("Hybrid band data temporarily unavailable."),
      ).toBeInTheDocument();
    });
  });

  it("cliff insight mentions excise step-up amount", async () => {
    await renderTrends();
    const insight = getHybridExciseCliffInsight();
    const stepUpStr = insight.exciseStepUp.toLocaleString();

    await waitFor(() => {
      expect(screen.getByText(new RegExp(stepUpStr.replace(",", ",?")))).toBeInTheDocument();
    });
  });
});
