import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, domAnimation } from "motion/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppPreferencesProvider, readSavedThemeMode, useAppPreferences } from "@/lib/appPreferences";
import { AuthProvider } from "@/lib/authContext";
import { TestRouter } from "@/test/testUtils";
import * as api from "@/services/api";
import BestPicks from "@/pages/BestPicks";
import SellYourCar from "@/pages/SellYourCar";
import { SystemView } from "@/pages/admin/SystemView";
import type { CarListing } from "@/types/car";

const MOCK_LISTING: CarListing = {
  id: 88,
  source: "ikman",
  source_id: "ik-88",
  make: "Suzuki",
  model: "Alto",
  year: 2016,
  condition: "used",
  mileage_km: 52000,
  transmission: "manual",
  fuel_type: "petrol",
  body_type: "hatchback",
  price_lkr: 3_450_000,
  deal_score: 0,
  market_median_lkr: 3_750_000,
  district: "Colombo",
  province: "Western",
  is_dealer: false,
  title: "2016 Suzuki Alto",
  detail_url: "https://ikman.lk/en/ad/88",
  scraped_at: "2026-11-18T00:00:00Z",
  first_seen_at: "2026-11-18T00:00:00Z",
};

function wrap(ui: React.ReactNode, initialEntries: string[] = ["/"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <LazyMotion features={domAnimation}>
      <AppPreferencesProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <TestRouter initialEntries={initialEntries}>{ui}</TestRouter>
          </QueryClientProvider>
        </AuthProvider>
      </AppPreferencesProvider>
    </LazyMotion>,
  );
}

describe("P2/P3 frontend regressions", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("synchronously resolves light theme on first render, migrates legacy key, and rejects invalid values", () => {
    localStorage.setItem("autolens_theme_mode", "light");

    const seenOnFirstRender: Array<{ themeMode: string; resolvedTheme: string }> = [];
    function Probe() {
      const { themeMode, resolvedTheme } = useAppPreferences();
      seenOnFirstRender.push({ themeMode, resolvedTheme });
      return <span data-testid="theme">{`${themeMode}:${resolvedTheme}`}</span>;
    }

    render(
      <AppPreferencesProvider>
        <Probe />
      </AppPreferencesProvider>,
    );

    expect(seenOnFirstRender[0]).toEqual({ themeMode: "light", resolvedTheme: "light" });
    expect(screen.getByTestId("theme")).toHaveTextContent("light:light");
    expect(document.documentElement.classList.contains("theme-light")).toBe(true);
    expect(localStorage.getItem("motormila_theme_mode")).toBe("light");

    localStorage.removeItem("autolens_theme_mode");
    localStorage.setItem("motormila_theme_mode", "neon");
    expect(readSavedThemeMode()).toBe("dark");
  });

  it("keeps the browser-chrome theme colour and follows a theme picked in another tab", async () => {
    const meta = document.createElement("meta");
    meta.id = "theme-color-meta";
    meta.setAttribute("content", "#0c0a09");
    document.head.appendChild(meta);

    function Probe() {
      const { themeMode } = useAppPreferences();
      return <span data-testid="mode">{themeMode}</span>;
    }

    render(
      <AppPreferencesProvider>
        <Probe />
      </AppPreferencesProvider>,
    );

    expect(meta.getAttribute("content")).toBe("#0c0a09");

    localStorage.setItem("motormila_theme_mode", "light");
    window.dispatchEvent(new StorageEvent("storage", { key: "motormila_theme_mode", newValue: "light" }));

    await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("light"));
    expect(document.documentElement.classList.contains("theme-light")).toBe(true);
    expect(meta.getAttribute("content")).toBe("#f8f4ee");
    meta.remove();
  });

  it("locks Deal score sorting on BestPicks for free-tier users", async () => {
    const getListingsSpy = vi.spyOn(api, "getListings").mockResolvedValue({
      listings: [MOCK_LISTING],
      total: 1,
    });
    vi.spyOn(api, "getPriceDrops").mockResolvedValue([]);

    wrap(<BestPicks />);

    await waitFor(() => expect(getListingsSpy).toHaveBeenCalled());
    expect(getListingsSpy).toHaveBeenCalledWith(expect.objectContaining({ sort: "newest" }));

    const dealScoreBtn = await screen.findByRole("button", { name: /Deal score/i });
    const affordabilityBtn = screen.getByRole("button", { name: /Affordability/i });

    expect(dealScoreBtn).toBeDisabled();
    expect(dealScoreBtn).toHaveAttribute("title", "Deal score sorting unlocks with Pro");
    expect(affordabilityBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("shows actionable publish blockers and step-jump buttons on SellYourCar Review step", () => {
    wrap(<SellYourCar />, ["/sell"]);

    fireEvent.click(screen.getByRole("button", { name: /Review/i }));

    expect(screen.getByText("Complete these before publishing:")).toBeInTheDocument();
    expect(screen.getByText("Sign in to your account to publish.")).toBeInTheDocument();
    expect(screen.getByText("Choose a make and enter the model.")).toBeInTheDocument();
    expect(screen.getByText("Add a contact phone number.")).toBeInTheDocument();

    const vehicleBlocker = screen.getByText("Choose a make and enter the model.").closest("li");
    expect(vehicleBlocker).not.toBeNull();
    fireEvent.click(within(vehicleBlocker!).getByRole("button", { name: "Edit" }));

    const vehicleStepBtn = screen.getByRole("button", { name: /Vehicle/i });
    expect(vehicleStepBtn).toHaveAttribute("aria-current", "step");
  });

  it("surfaces alert flags, per-key stats cache clear, and enrichment endpoints in SystemView", async () => {
    const requests: Array<{ url: string; method: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      requests.push({ url, method });

      if (url.includes("/admin/system")) {
        return new Response(
          JSON.stringify({
            databaseOk: true,
            flags: {
              appAccessEnforced: true,
              proAccessEnforced: true,
              adminApiKeyConfigured: true,
              billingWebhookConfigured: false,
              b2bKeysConfigured: false,
              resendConfigured: true,
              emailAlertConfigured: true,
              twilioConfigured: false,
              telegramConfigured: true,
              publicAppOrigin: "https://motormila.pages.dev",
            },
            statsCacheKeys: ["stats:summary", "stats:district_prices"],
            providers: [
              {
                id: "openchargemap",
                label: "OpenChargeMap EV Stations",
                enabled: true,
                configured: true,
                lastRun: null,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/admin/cache") && method === "DELETE") {
        return new Response(JSON.stringify({ ok: true, deleted: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/admin/enrichment/")) {
        return new Response(
          JSON.stringify({ ok: true, status: "ok", rows: 12, attempted: 100, matched: 40 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    wrap(<SystemView />);

    expect(await screen.findByText("Email alerts (SMTP/Resend)")).toBeInTheDocument();
    expect(screen.getByText("Telegram alerts")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear cache key stats:summary" }));
    await waitFor(() =>
      expect(
        requests.some((r) => r.method === "DELETE" && r.url.includes("/admin/cache?key=stats%3Asummary")),
      ).toBe(true),
    );

    fireEvent.click(screen.getByRole("button", { name: /Refresh EV chargers/i }));
    await waitFor(() =>
      expect(
        requests.some((r) => r.method === "POST" && r.url.endsWith("/admin/enrichment/openchargemap")),
      ).toBe(true),
    );

    fireEvent.click(screen.getByRole("button", { name: /Run Geoapify 100-listing sample/i }));
    await waitFor(() =>
      expect(
        requests.some((r) => r.method === "POST" && r.url.endsWith("/admin/enrichment/geoapify?limit=100")),
      ).toBe(true),
    );

    fireEvent.click(screen.getByRole("button", { name: /Refresh ProblemsByVin/i }));
    await waitFor(() =>
      expect(
        requests.some((r) => r.method === "POST" && r.url.endsWith("/admin/enrichment/problemsbyvin")),
      ).toBe(true),
    );
  });
});
