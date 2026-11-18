import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppPreferencesProvider } from "@/lib/appPreferences";
import { TestRouter } from "@/test/testUtils";
import * as api from "@/services/api";
import type { MakeInsight } from "@/types/car";
import MakeHub from "@/pages/MakeHub";

vi.mock("@/services/api", async () => {
  const actual = await vi.importActual<typeof import("@/services/api")>("@/services/api");
  return {
    ...actual,
    getMakeInsight: vi.fn(),
    getListings: vi.fn(),
  };
});

const INSIGHT: MakeInsight = {
  make: "Toyota",
  total: 120,
  avg_price_lkr: 6_500_000,
  median_price_lkr: 5_900_000,
  top_models: [
    { model: "Aqua", count: 40, avg_price_lkr: 5_200_000 },
    { model: "Prius", count: 25, avg_price_lkr: 8_100_000 },
  ],
  top_districts: [{ district: "Colombo", count: 55, avg_price_lkr: 6_800_000 }],
};

function renderHub() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <AppPreferencesProvider>
      <QueryClientProvider client={queryClient}>
        <TestRouter initialEntries={["/cars/toyota"]}>
          <Routes>
            <Route path="/cars/:make" element={<MakeHub />} />
          </Routes>
        </TestRouter>
      </QueryClientProvider>
    </AppPreferencesProvider>,
  );
}

describe("MakeHub", () => {
  beforeEach(() => {
    vi.mocked(api.getMakeInsight).mockResolvedValue(INSIGHT);
    vi.mocked(api.getListings).mockResolvedValue({
      listings: [],
      total: 0,
      page: 1,
      page_size: 20,
      total_pages: 0,
    } as never);
  });

  it("renders make insight and model links", async () => {
    renderHub();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Toyota" })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Aqua/i })).toHaveAttribute(
      "href",
      "/cars/toyota/aqua",
    );
    expect(screen.getByRole("link", { name: /Colombo/i })).toHaveAttribute(
      "href",
      "/locations/colombo",
    );
  });
});
