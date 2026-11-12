import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImportEraPublicSection, importEraPremiumPct } from "@/components/ImportEraPublicSection";

vi.mock("@/services/api", () => ({
  getImportEraSplit: vi.fn(),
  formatPrice: (value: number | null) => (value == null ? "—" : `Rs. ${value.toLocaleString()}`),
}));

import { getImportEraSplit } from "@/services/api";

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ImportEraPublicSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ImportEraPublicSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders era cohort cards from the public API", async () => {
    vi.mocked(getImportEraSplit).mockResolvedValue({
      makes: [
        {
          make: "Toyota",
          pre_freeze: { era: "pre_freeze", label: "Pre", count: 100, median_price_lkr: 8_000_000 },
          post_freeze: { era: "post_freeze", label: "Post", count: 40, median_price_lkr: 11_000_000 },
        },
      ],
      freeze_boundary_year: 2025,
      generated_at: "2026-07-14T00:00:00Z",
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getByText("Toyota")).toBeInTheDocument();
    });
    expect(screen.getByText(/Pre-freeze vs post-freeze/i)).toBeInTheDocument();
    expect(screen.getByText(/Open Pro lanes/i)).toBeInTheDocument();
    expect(screen.getByText(/\+37\.5%/)).toBeInTheDocument();
  });
});

describe("importEraPremiumPct", () => {
  it("returns the premium for like-for-like cohorts", () => {
    expect(importEraPremiumPct(8_000_000, 11_000_000)).toBe(37.5);
    expect(importEraPremiumPct(7_650_000, 13_650_000)).toBe(78.4);
  });
  it("hides mixed-type cohorts (bikes before, cars after) and missing medians", () => {
    expect(importEraPremiumPct(545_000, 13_350_000)).toBeNull();
    expect(importEraPremiumPct(10_000_000, 4_000_000)).toBeNull();
    expect(importEraPremiumPct(null, 5_000_000)).toBeNull();
    expect(importEraPremiumPct(0, 5_000_000)).toBeNull();
  });
});
