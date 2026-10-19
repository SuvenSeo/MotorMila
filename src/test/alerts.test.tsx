import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppPreferencesProvider } from "@/lib/appPreferences";
import { AuthProvider } from "@/lib/authContext";
import { TestRouter } from "@/test/testUtils";
import type { ServerMarketAlert, AlertMatchResponse } from "@/services/api";

vi.mock("@/hooks/useServerMarketAlerts", () => ({
  useServerMarketAlerts: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  matchAlerts: vi.fn(),
  formatPrice: vi.fn((price: number | null) => (price !== null ? `LKR ${price.toLocaleString()}` : "N/A")),
  getOrCreateAlertToken: vi.fn(() => "test-token-uuid"),
}));

vi.mock("@/lib/marketAlerts", () => ({
  loadMarketAlerts: vi.fn(() => []),
}));

import { useServerMarketAlerts } from "@/hooks/useServerMarketAlerts";
import { matchAlerts, formatPrice } from "@/services/api";
import { loadMarketAlerts } from "@/lib/marketAlerts";
import Alerts from "@/pages/Alerts";

const mockUseServerAlerts = vi.mocked(useServerMarketAlerts);
const mockMatchAlerts = vi.mocked(matchAlerts);
const mockFormatPrice = vi.mocked(formatPrice);
const mockLoadMarketAlerts = vi.mocked(loadMarketAlerts);

const BASE_HOOK_RESULT = {
  alerts: [] as ServerMarketAlert[],
  loading: false,
  error: null,
  token: "test-token-uuid",
  refresh: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
};

const EMPTY_MATCH: AlertMatchResponse = {
  results: [],
  checked_at: new Date().toISOString(),
};

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

function renderAlerts() {
  return render(
    <AuthProvider>
      <AppPreferencesProvider>
        <TestRouter>
          <Alerts />
        </TestRouter>
      </AppPreferencesProvider>
    </AuthProvider>,
  );
}

async function renderAlertsReady() {
  const view = renderAlerts();
  // AlertMatchSection fires matchAlerts on mount — flush before asserts.
  await waitFor(() => {
    expect(mockMatchAlerts).toHaveBeenCalled();
  });
  return view;
}

describe("Alerts page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installProAuth();
    mockUseServerAlerts.mockReturnValue({ ...BASE_HOOK_RESULT });
    mockMatchAlerts.mockResolvedValue(EMPTY_MATCH);
    mockFormatPrice.mockImplementation((price: number | null) =>
      price !== null ? `LKR ${price.toLocaleString()}` : "N/A",
    );
    mockLoadMarketAlerts.mockReturnValue([]);
  });

  it("renders the page heading", async () => {
    await renderAlertsReady();
    expect(screen.getByRole("heading", { name: /market alerts/i, level: 1 })).toBeInTheDocument();
  });

  it("renders the page description", async () => {
    await renderAlertsReady();
    expect(screen.getByText(/get notified when vehicles/i)).toBeInTheDocument();
  });

  it("renders the 'New alert' button by default", async () => {
    await renderAlertsReady();
    expect(screen.getByRole("button", { name: /new alert/i })).toBeInTheDocument();
  });

  it("shows empty state when no alerts exist", async () => {
    await renderAlertsReady();
    expect(screen.getByText(/no active alerts/i)).toBeInTheDocument();
  });

  it("renders alert rows when server returns alerts", async () => {
    const alerts: ServerMarketAlert[] = [
      {
        id: 1,
        user_token: "test-token-uuid",
        make: "Toyota",
        model: "Aqua",
        max_price: 5_000_000,
        district: "Colombo",
        active: true,
        created_at: "2026-07-01T10:00:00Z",
      },
      {
        id: 2,
        user_token: "test-token-uuid",
        make: "Honda",
        model: null,
        max_price: null,
        district: null,
        active: true,
        created_at: "2026-07-02T10:00:00Z",
      },
    ];
    mockUseServerAlerts.mockReturnValue({ ...BASE_HOOK_RESULT, alerts });

    await renderAlertsReady();

    const rows = screen.getAllByTestId("alert-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("Toyota Aqua")).toBeInTheDocument();
    expect(screen.getByText("Honda")).toBeInTheDocument();
  });

  it("renders alert district and price details", async () => {
    const alerts: ServerMarketAlert[] = [
      {
        id: 3,
        user_token: "test-token-uuid",
        make: "Nissan",
        model: "Leaf",
        max_price: 8_000_000,
        district: "Gampaha",
        active: true,
        created_at: "2026-07-03T10:00:00Z",
      },
    ];
    mockUseServerAlerts.mockReturnValue({ ...BASE_HOOK_RESULT, alerts });

    await renderAlertsReady();

    expect(screen.getByText("Gampaha")).toBeInTheDocument();
  });

  it("shows loading skeletons while alerts are loading", async () => {
    mockUseServerAlerts.mockReturnValue({ ...BASE_HOOK_RESULT, loading: true });

    await renderAlertsReady();

    expect(screen.getByLabelText(/loading alerts/i)).toBeInTheDocument();
  });

  it("shows error message when server returns an error", async () => {
    mockUseServerAlerts.mockReturnValue({
      ...BASE_HOOK_RESULT,
      error: "Network error",
      alerts: [],
    });

    await renderAlertsReady();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("opens the create alert form when 'New alert' is clicked", async () => {
    await renderAlertsReady();

    fireEvent.click(screen.getByRole("button", { name: /new alert/i }));

    expect(screen.getByRole("form", { name: /create alert form/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/make/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/model/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/district/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max price/i)).toBeInTheDocument();
  });

  it("calls create when the form is submitted with valid data", async () => {
    const createFn = vi.fn().mockResolvedValue(undefined);
    const refreshFn = vi.fn().mockResolvedValue(undefined);
    mockUseServerAlerts.mockReturnValue({
      ...BASE_HOOK_RESULT,
      create: createFn,
      refresh: refreshFn,
    });

    await renderAlertsReady();

    fireEvent.click(screen.getByRole("button", { name: /new alert/i }));

    fireEvent.change(screen.getByLabelText(/make/i), { target: { value: "Toyota" } });
    fireEvent.change(screen.getByLabelText(/model/i), { target: { value: "Prius" } });

    fireEvent.click(screen.getByRole("button", { name: /save alert/i }));

    await waitFor(() => {
      expect(createFn).toHaveBeenCalledWith(
        expect.objectContaining({ make: "Toyota", model: "Prius" }),
      );
    });
  });

  it("shows a validation error when form is submitted with no filters", async () => {
    await renderAlertsReady();

    fireEvent.click(screen.getByRole("button", { name: /new alert/i }));
    fireEvent.click(screen.getByRole("button", { name: /save alert/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/provide at least one filter/i)).toBeInTheDocument();
    });
  });

  it("calls remove when the delete button is clicked", async () => {
    const removeFn = vi.fn().mockResolvedValue(undefined);
    const alerts: ServerMarketAlert[] = [
      {
        id: 5,
        user_token: "test-token-uuid",
        make: "Suzuki",
        model: "Alto",
        max_price: null,
        district: null,
        active: true,
        created_at: "2026-07-04T10:00:00Z",
      },
    ];
    mockUseServerAlerts.mockReturnValue({ ...BASE_HOOK_RESULT, alerts, remove: removeFn });

    await renderAlertsReady();

    const deleteBtn = screen.getByRole("button", { name: /delete alert for suzuki alto/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(removeFn).toHaveBeenCalledWith(5);
    });
  });

  it("renders the Active alerts section heading", async () => {
    await renderAlertsReady();
    expect(screen.getByRole("heading", { name: /active alerts/i, level: 2 })).toBeInTheDocument();
  });

  it("renders the current matches section heading", async () => {
    await renderAlertsReady();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /current matches/i, level: 2 })).toBeInTheDocument();
    });
  });

  it("renders match result listings when matchAlerts returns data", async () => {
    const matchData: AlertMatchResponse = {
      results: [
        {
          alert_id: 1,
          make: "Toyota",
          model: "Aqua",
          district: null,
          max_price: 5_000_000,
          matching_count: 3,
          listings: [
            {
              id: 101,
              title: "Toyota Aqua Gen3",
              make: "Toyota",
              model: "Aqua",
              year: null,
              price_lkr: 4_500_000,
              district: "Colombo",
              deal_score: 7.5,
              thumbnail_url: null,
            },
          ],
        },
      ],
      checked_at: "2026-07-13T12:00:00Z",
    };
    mockMatchAlerts.mockResolvedValue(matchData);

    await renderAlertsReady();

    await waitFor(
      () => {
        expect(screen.getByText(/3 found/)).toBeInTheDocument();
        expect(screen.getByText("Toyota Aqua Gen3")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("shows empty match state when no results are returned", async () => {
    mockMatchAlerts.mockResolvedValue({ results: [], checked_at: new Date().toISOString() });

    await renderAlertsReady();

    await waitFor(() => {
      expect(screen.getByText(/no matching listings for your alerts/i)).toBeInTheDocument();
    });
  });

  it("shows match error when matchAlerts rejects", async () => {
    mockMatchAlerts.mockRejectedValue(new Error("Match API down"));

    await renderAlertsReady();

    await waitFor(() => {
      expect(screen.getByText("Match API down")).toBeInTheDocument();
    });
  });

  it("shows fallback localStorage alerts when server errors and localStorage has data", async () => {
    mockUseServerAlerts.mockReturnValue({
      ...BASE_HOOK_RESULT,
      alerts: [],
      error: "Server unavailable",
    });
    mockLoadMarketAlerts.mockReturnValue([
      {
        id: "local-alert-1",
        label: "Toyota Vitz / Colombo",
        filters: { make: "Toyota", model: "Vitz" },
        created_at: "2026-07-01T10:00:00Z",
      },
    ]);

    await renderAlertsReady();

    expect(screen.getByText(/locally saved/i)).toBeInTheDocument();
    expect(screen.getByText("Toyota Vitz / Colombo")).toBeInTheDocument();
  });

  it("has a link from each alert row to browse matching listings", async () => {
    const alerts: ServerMarketAlert[] = [
      {
        id: 10,
        user_token: "test-token-uuid",
        make: "Honda",
        model: "Fit",
        max_price: 3_000_000,
        district: null,
        active: true,
        created_at: "2026-07-05T10:00:00Z",
      },
    ];
    mockUseServerAlerts.mockReturnValue({ ...BASE_HOOK_RESULT, alerts });

    await renderAlertsReady();

    const browseLinks = screen.getAllByRole("link", { name: /browse/i });
    expect(browseLinks.length).toBeGreaterThan(0);
  });
});
