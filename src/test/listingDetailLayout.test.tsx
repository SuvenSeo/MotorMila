import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import type { CarListing } from "@/types/car";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  const reject = () => Promise.reject(new Error("offline in test"));
  return {
    ...actual,
    getListing: vi.fn(),
    getSimilarListings: vi.fn(() => Promise.resolve([])),
    getListingPriceHistory: vi.fn(reject),
    getListingFmv: vi.fn(),
    getListingSafetyResearch: vi.fn(reject),
    getListingGeo: vi.fn(reject),
    getListingHistoryReport: vi.fn(reject),
  };
});

import { loadWatchlistIds, saveWatchlistIds } from "@/lib/watchlist";
import { loadPinned } from "@/lib/compareTray";
import ListingDetail from "@/pages/ListingDetail";
import * as api from "@/services/api";
import { AuthProvider } from "@/lib/authContext";
import { TestRouter } from "@/test/testUtils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function listing(overrides: Partial<CarListing> = {}): CarListing {
  return {
    id: 501,
    source: "ikman",
    source_id: "ik-501",
    make: "Toyota",
    model: "Aqua",
    year: 2017,
    condition: "used",
    mileage_km: 82000,
    transmission: "automatic",
    fuel_type: "hybrid",
    body_type: "hatchback",
    price_lkr: 7_580_000,
    deal_score: 5,
    market_median_lkr: 8_000_000,
    district: "Colombo",
    province: "Western",
    is_dealer: false,
    title: "Toyota Aqua 2017",
    detail_url: "https://ikman.lk/en/ad/toyota-aqua-2017-colombo-501",
    scraped_at: new Date().toISOString(),
    first_seen_at: new Date().toISOString(),
    ...overrides,
  };
}

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
    <AuthProvider>
      <TestRouter initialEntries={["/listing/501"]}>
        <Routes>
          <Route path="/listing/:id" element={<ListingDetail />} />
        </Routes>
      </TestRouter>
    </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("ListingDetail layout", () => {
  beforeEach(() => {
    localStorage.clear();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    vi.mocked(api.getListingFmv).mockResolvedValue({
      listing_id: 501,
      asking_lkr: 7_580_000,
      fmv_lkr: 8_000_000,
      deal_score: 5,
      delta_pct: -5.25,
      band: "below",
      label: null,
      method: "ols_comps",
      sample_count: 42,
      sample_size: 42,
      confidence: "high",
      comps_median_lkr: 8_000_000,
      updated_at: new Date().toISOString(),
    });
  });

  it("orders price before key specs, keeps one CTA per layout and drops the old pill row", async () => {
    vi.mocked(api.getListing).mockResolvedValue(listing());
    renderDetail();
    await screen.findByRole("heading", { level: 1, name: /toyota aqua/i });

    const sticky = screen.getByRole("region", { name: /price and contact/i });
    expect(within(sticky).getByRole("link", { name: /view on ikman/i })).toHaveAttribute("target", "_blank");
    // Mobile layout: the sticky bar is the one CTA (the desktop sidebar isn't rendered),
    // never the old header/seller duplicates.
    expect(screen.getAllByRole("link", { name: /view on ikman|contact seller/i })).toHaveLength(1);

    const priceHeadings = screen.getAllByText("Asking price");
    // Key specs mount just after the hero (DeferredSection), so wait for them.
    const specs = await screen.findByRole("heading", { name: /key specs/i });
    // eslint-disable-next-line no-bitwise
    expect(priceHeadings[0].compareDocumentPosition(specs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Safety strip links to the transfer guide.
    expect(screen.getAllByRole("link", { name: /safe transfer checklist/i })[0]).toHaveAttribute("href", "/safe-transfer");
  });

  it("saves a listing, reflects changes from search, and persists comparison selection", async () => {
    vi.mocked(api.getListing).mockResolvedValue(listing());
    renderDetail();
    await screen.findByRole("heading", { level: 1, name: /toyota aqua/i });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(loadWatchlistIds()).toEqual([501]);
    expect(screen.getByRole("button", { name: /saved/i })).toHaveAttribute("aria-pressed", "true");
    act(() => { saveWatchlistIds([]); });
    expect(screen.getByRole("button", { name: /^save$/i })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: /add to compare/i }));
    expect(loadPinned()).toEqual([expect.objectContaining({ id: 501, make: "Toyota", model: "Aqua" })]);
    expect(screen.getByRole("button", { name: /pinned/i })).toBeInTheDocument();
  });

  describe("on desktop (min-width: 1024px)", () => {
    const original = window.matchMedia;
    beforeEach(() => {
      window.matchMedia = ((query: string) => ({
        ...original(query),
        matches: /\(min-width:\s*(\d+)px\)/.test(query) && Number(/(\d+)px/.exec(query)?.[1]) <= 1440,
      })) as typeof window.matchMedia;
    });
    afterEach(() => {
      window.matchMedia = original;
    });

    it("renders the sidebar: sticky bar + sidebar = two CTAs", async () => {
      vi.mocked(api.getListing).mockResolvedValue(listing());
      renderDetail();
      await screen.findByRole("heading", { level: 1, name: /toyota aqua/i });

      const sticky = screen.getByRole("region", { name: /price and contact/i });
      expect(within(sticky).getByRole("link", { name: /view on ikman/i })).toHaveAttribute("target", "_blank");
      // Sticky bar (mobile) + sidebar (desktop) = two CTAs total, never the old header/seller duplicates.
      expect(screen.getAllByRole("link", { name: /view on ikman|contact seller/i })).toHaveLength(2);
      const sidebar = document.querySelector("aside");
      expect(sidebar).not.toBeNull();
      expect(within(sidebar as HTMLElement).getByRole("link", { name: /view on ikman/i })).toHaveAttribute("target", "_blank");

      // The mobile price block isn't rendered on desktop: one "Asking price" heading, in the sidebar.
      expect(within(sidebar as HTMLElement).getAllByText("Asking price").length).toBeGreaterThan(0);
      expect(await screen.findByRole("heading", { name: /key specs/i })).toBeInTheDocument();
    });
  });

  it("labels lease takeovers and gives no deal rating or finance estimate", async () => {
    vi.mocked(api.getListing).mockResolvedValue(
      listing({ price_lkr: 2_175_000, description: "Lease takeover. Leasing 199,000*59 balance installments." }),
    );
    renderDetail();
    await screen.findByRole("heading", { level: 1, name: /toyota aqua/i });
    await waitFor(() => expect(screen.getAllByText(/lease takeover — price shown isn't full price/i).length).toBeGreaterThan(0));
    expect(screen.queryByText(/below typical/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/est\. \/mo/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/59 instalments of Rs 199,000/i).length).toBeGreaterThan(0);
  });
});
