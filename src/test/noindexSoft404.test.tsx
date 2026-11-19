import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Link, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CarListing } from "@/types/car";

const apiMocks = vi.hoisted(() => ({ getListing: vi.fn() }));

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  const offline = () => Promise.reject(new Error("offline in test"));
  return {
    ...actual,
    getListing: apiMocks.getListing,
    getSimilarListings: vi.fn(() => Promise.resolve([])),
    getListingPriceHistory: vi.fn(offline),
    getListingFmv: vi.fn(offline),
    getListingSafetyResearch: vi.fn(offline),
    getListingGeo: vi.fn(offline),
    getListingHistoryReport: vi.fn(offline),
  };
});

import ListingDetail from "@/pages/ListingDetail";
import { RouteMeta } from "@/components/RouteMeta";
import { AuthProvider } from "@/lib/authContext";
import { AppPreferencesProvider } from "@/lib/appPreferences";
import { TestRouter } from "@/test/testUtils";

const LIVE_ID = "767110";

function listing(): CarListing {
  return {
    id: Number(LIVE_ID),
    source: "ikman",
    source_id: "ik-767110",
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
  };
}

function notFound() {
  // Same shape the API client throws, and the one listingHandoff.ts turns into
  // an empty bundle (the not-found branch).
  return Object.assign(new Error("Listing not found"), { status: 404 });
}

function robots(): string | null {
  return document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;
}

function renderTree(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppPreferencesProvider>
        <AuthProvider>
          <TestRouter initialEntries={[entry]}>
            <RouteMeta />
            <Routes>
              <Route path="/listing/:id" element={<ListingDetail />} />
            </Routes>
            <Link to={`/listing/${LIVE_ID}`}>open a live listing</Link>
          </TestRouter>
        </AuthProvider>
      </AppPreferencesProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  document.head.querySelector('meta[name="robots"]')?.remove();
  apiMocks.getListing.mockReset();
});

describe("soft-404 noindex", () => {
  it("noindexes a dead listing id and clears it when a live listing takes over", async () => {
    apiMocks.getListing.mockImplementation((id: string | number) =>
      String(id) === LIVE_ID ? Promise.resolve(listing()) : Promise.reject(notFound()),
    );

    renderTree("/listing/999999999");
    expect(await screen.findByRole("heading", { name: /listing not found/i })).toBeInTheDocument();
    await waitFor(() => expect(robots()).toBe("noindex, follow"));

    // Client-side navigation to a listing that does exist must clear it.
    fireEvent.click(screen.getByRole("link", { name: /open a live listing/i }));
    expect(await screen.findByRole("heading", { level: 1, name: /toyota aqua/i })).toBeInTheDocument();
    await waitFor(() => expect(robots()).toBe("index, follow"));
  });

  it("keeps index,follow while a dead id is still loading and on an API failure", async () => {
    apiMocks.getListing.mockRejectedValue(Object.assign(new Error("Service unavailable"), { status: 503 }));

    renderTree("/listing/999999999");
    expect(await screen.findByText(/this listing couldn't load/i)).toBeInTheDocument();
    // An error is not proof the listing is gone: the page stays indexable.
    await waitFor(() => expect(robots()).toBe("index, follow"));
  });
});
