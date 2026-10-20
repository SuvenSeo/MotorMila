import { TestRouter } from "@/test/testUtils";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { AuthProvider } from "@/lib/authContext";
import { ListingCard } from "@/components/ListingCard";
import type { CarListing } from "@/types/car";

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

function buildListing(overrides: Partial<CarListing> = {}): CarListing {
  return {
    id: 11,
    source: "ikman",
    source_id: "ik-11",
    make: "Toyota",
    model: "Aqua",
    year: 2018,
    condition: "used",
    mileage_km: 65000,
    transmission: "automatic",
    fuel_type: "hybrid",
    body_type: "hatchback",
    price_lkr: 8900000,
    deal_score: 3,
    district: "Colombo",
    province: "Western",
    is_dealer: false,
    title: "Toyota Aqua 2018",
    detail_url: "https://example.com/listing/11",
    scraped_at: new Date().toISOString(),
    first_seen_at: new Date().toISOString(),
    ...overrides,
  };
}

function renderCard(ui: ReactElement) {
  return render(
    <AuthProvider>
      <TestRouter>{ui}</TestRouter>
    </AuthProvider>,
  );
}

describe("ListingCard render states and interactions", () => {
  beforeEach(() => installProAuth());

  it("uses compact layout classes for denser market cards", () => {
    const listing = buildListing();

    renderCard(<ListingCard listing={listing} />);

    const card = screen.getByRole("article", { name: /Toyota Aqua listing card/i });
    const cardLink = screen.getByRole("link", { name: /Open Toyota Aqua/i });

    // Surface now routes through the semantic token (theme-adaptive) rather
    // than the old hardcoded dark-glass fill.
    expect(card.className).toContain("liquid-panel");
    expect(card.className).toContain("rounded-3xl");
    expect(cardLink).toHaveAttribute("href", "/listing/11");
    expect(card.querySelector("button")).not.toBeInTheDocument();
  });

  it("renders fallback metadata when fields are missing", () => {
    const listing = buildListing({
      year: 0,
      mileage_km: Number.NaN,
      district: "",
      thumbnail_url: undefined,
      images: [],
    });

    renderCard(<ListingCard listing={listing} />);

    expect(screen.getByText("District N/A")).toBeInTheDocument();
    expect(screen.getByText("Mileage N/A")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Toyota Aqua" })).toHaveAttribute("loading", "lazy");
  });

  it("renders an unavailable price badge when listing price is not positive", () => {
    const listing = buildListing({
      price_lkr: null,
    });

    renderCard(<ListingCard listing={listing} />);

    expect(screen.getByText("Price unavailable")).toBeInTheDocument();
  });

  it("shows a truthful market-position signal when below the median", () => {
    const listing = buildListing({
      market_median_lkr: 9_500_000,
      price_lkr: 8_900_000,
      deal_score: 12,
      year: 2024,
      mileage_km: 1200,
      condition: "brand_new",
      is_dealer: true,
    });

    renderCard(<ListingCard listing={listing} />);

    expect(screen.getByText(/fair market value/i)).toBeInTheDocument();
    expect(screen.getByText(/% below fmv/i)).toBeInTheDocument();
  });

  it("keeps compare and watchlist actions compatible", () => {
    const listing = buildListing();
    const onCompareToggle = vi.fn();
    const onWatchlistToggle = vi.fn();

    renderCard(
      <ListingCard
        listing={listing}
        onCompareToggle={onCompareToggle}
        onWatchlistToggle={onWatchlistToggle}
        isComparing={false}
        isWatchlisted={false}
      />,
    );

    fireEvent.click(screen.getByLabelText("Add to watchlist"));
    fireEvent.click(screen.getByLabelText("Add to comparison"));

    expect(onWatchlistToggle).toHaveBeenCalledTimes(1);
    expect(onWatchlistToggle).toHaveBeenCalledWith(listing);
    expect(onCompareToggle).toHaveBeenCalledTimes(1);
    expect(onCompareToggle).toHaveBeenCalledWith(listing);
  });

  it("eager-loads the first-screen thumbnail when priority is set", () => {
    renderCard(<ListingCard listing={buildListing()} priority />);
    const img = screen.getByRole("img", { name: "Toyota Aqua" });
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("sizes", "(max-width: 768px) 100vw, 33vw");
  });
});
