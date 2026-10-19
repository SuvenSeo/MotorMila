import { TestRouter } from "@/test/testUtils";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/lib/authContext";

vi.mock("@/services/api", () => ({
  getListings: vi.fn(),
  getPriceDrops: vi.fn().mockResolvedValue([]),
  getListingThumbnailProxyUrl: vi.fn().mockReturnValue("https://example.com/thumb.jpg"),
  formatPrice: (value: number | null) => (value == null ? "N/A" : `Rs. ${(Number(value) / 1_000_000).toFixed(2)}M`),
}));

import BestPicks from "@/pages/BestPicks";
import * as api from "@/services/api";
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

function renderBestPicks() {
  return render(
    <AuthProvider>
      <TestRouter>
        <BestPicks />
      </TestRouter>
    </AuthProvider>,
  );
}

function makeListing(id: number, make: string, model: string, priceLkr: number, dealScore: number) {
  return {
    id,
    make,
    model,
    year: 2018,
    district: "Colombo",
    source: "ikman",
    price_lkr: priceLkr,
    deal_score: dealScore,
    detail_url: `https://example.com/listing/${id}`,
    external_url: `https://example.com/listing/${id}`,
    thumbnail_url: null,
    images: [],
  } as CarListing;
}

describe("BestPicks price guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installProAuth();

    vi.mocked(api.getListings).mockImplementation(async () => ({
      listings: [
        makeListing(1, "Zero", "Price", 0, 13),
        makeListing(2, "Tiny", "Price", 42_000, 16),
        makeListing(3, "Toyota", "Corolla", 8_700_000, 11),
        makeListing(4, "Honda", "Fit", 6_000_000, 10),
        makeListing(5, "BMW", "X5", 18_000_000, 15),
      ],
      total: 5,
    }));
  });

  it("excludes zero and tiny malformed prices from best picks", async () => {
    renderBestPicks();

    await screen.findByText(/Toyota Corolla/i);

    expect(screen.queryByText(/Zero Price/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tiny Price/i)).not.toBeInTheDocument();
    expect(screen.getByText(/vehicles scored/i)).toBeInTheDocument();
    expect(screen.getByText(/ranked by deal strength/i)).toBeInTheDocument();
  });

  it("re-ranks high deal_score listings by affordability cash down", async () => {
    renderBestPicks();

    await screen.findByText(/BMW X5/i);
    // Default deal_score mode: highest score featured first.
    expect(screen.getByRole("heading", { name: /BMW X5/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Affordability/i }));

    expect(await screen.findByText(/ranked by min cash down/i)).toBeInTheDocument();
    // Lowest ask among gate survivors (Honda Fit) should feature under
    // affordability. The page-level "Biggest cuts this week" heading is not a
    // pick — assert on pick headings only.
    const pickHeadings = screen
      .getAllByRole("heading", { level: 2 })
      .filter((h) => !/biggest cuts/i.test(h.textContent || ""));
    expect(pickHeadings[0]).toHaveTextContent(/Honda Fit/i);
    expect(screen.getByText(/Lowest cash down/i)).toBeInTheDocument();
  });
});
