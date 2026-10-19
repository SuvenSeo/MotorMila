import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { TestRouter } from "@/test/testUtils";
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

const sampleListing: CarListing = {
  id: 11,
  source: "ikman",
  source_id: "ikman-11",
  make: "Toyota",
  model: "Aqua",
  year: 2017,
  condition: "reconditioned",
  mileage_km: 74000,
  transmission: "automatic",
  fuel_type: "hybrid",
  engine_cc: 1496,
  body_type: "hatchback",
  price_lkr: 7850000,
  deal_score: 12,
  district: "Colombo",
  province: "Western",
  is_dealer: true,
  title: "Toyota Aqua",
  detail_url: "https://example.com/listing/11",
  first_seen_at: new Date().toISOString(),
  scraped_at: new Date().toISOString(),
};

function renderCard(ui: ReactElement) {
  return render(
    <AuthProvider>
      <TestRouter>{ui}</TestRouter>
    </AuthProvider>,
  );
}

describe("ListingCard footer metadata", () => {
  beforeEach(() => installProAuth());

  it("shows real days-on-market instead of a fabricated integrity score", () => {
    renderCard(<ListingCard listing={sampleListing} />);

    // first_seen_at is now, so the card reports it was listed today.
    expect(screen.getByText(/listed today/i)).toBeInTheDocument();
    expect(screen.queryByText(/\/100/i)).not.toBeInTheDocument();
    expect(screen.getByText(/1,?496\s*cc/i)).toBeInTheDocument();
  });

  it("reports day counts for older listings", () => {
    const listedTenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    renderCard(
      <ListingCard
        listing={{ ...sampleListing, id: 12, first_seen_at: listedTenDaysAgo, scraped_at: listedTenDaysAgo }}
      />,
    );

    expect(screen.getByText(/listed 10 days/i)).toBeInTheDocument();
  });
});
