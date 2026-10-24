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
    expect(card.className).toContain("bg-surface-1");
    expect(card.className).toContain("rounded-card");
    expect(cardLink).toHaveAttribute("href", "/listing/11");
    expect(card.querySelector("button")).not.toBeInTheDocument();
  });

  it("hides Unknown / N/A pills when fields are missing", () => {
    const listing = buildListing({
      year: 0,
      mileage_km: Number.NaN,
      district: "",
      thumbnail_url: undefined,
      images: [],
    });

    renderCard(<ListingCard listing={listing} />);

    expect(screen.queryByText(/N\/A/)).not.toBeInTheDocument();
    expect(screen.queryByText(/unknown/i)).not.toBeInTheDocument();
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

    expect(screen.getByText(/typical rs/i)).toBeInTheDocument();
    expect(screen.getByText(/% below fmv/i)).toBeInTheDocument();
    // Rupee gap badge: 9.5M - 8.9M = Rs 0.6 Mn.
    expect(screen.getByText("Rs 0.6 Mn below typical")).toBeInTheDocument();
  });

  it("paints very cheap outliers amber, never green", () => {
    renderCard(<ListingCard listing={buildListing({ market_median_lkr: 9_000_000, price_lkr: 4_000_000, deal_score: 55 })} />);
    const badge = screen.getByText(/unusually low/i).closest("[data-deal-kind]");
    expect(badge).toHaveAttribute("data-deal-kind", "verify");
    expect(badge?.className).not.toMatch(/emerald|green/);
  });

  it("labels lease takeovers and gives them no deal score or monthly estimate", () => {
    renderCard(
      <ListingCard
        listing={buildListing({ market_median_lkr: 9_000_000, price_lkr: 2_175_000, description: "Leasing 199,000*59 takeover" })}
      />,
    );
    expect(screen.getByText(/lease takeover — price shown isn't full price/i)).toBeInTheDocument();
    expect(screen.queryByText(/below typical/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/est\. \/mo/i)).not.toBeInTheDocument();
  });

  it("shows a small monthly estimate and an on-N-sites chip only when data exists", () => {
    const { rerender } = renderCard(<ListingCard listing={buildListing({ year: 2017 })} />);
    expect(screen.getByText(/est\. \/mo/i)).toBeInTheDocument();
    expect(screen.queryByText(/on \d+ sites/i)).not.toBeInTheDocument();
    rerender(
      <AuthProvider>
        <TestRouter><ListingCard listing={buildListing({ year: 2017 })} seenOnSites={3} /></TestRouter>
      </AuthProvider>,
    );
    expect(screen.getByText("On 3 sites")).toBeInTheDocument();
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
    expect(img).toHaveAttribute("fetchpriority", "high");
    // `sizes` only ships with a srcset (resizable hosts such as ikman).
    if (img.getAttribute("srcset")) expect(img).toHaveAttribute("sizes", "(max-width: 768px) 100vw, 33vw");
    else expect(img).not.toHaveAttribute("sizes");
  });
});
