import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterSidebar } from "@/components/FilterSidebar";
import type { FilterState } from "@/types/car";

vi.mock("@/services/api", () => ({
  getListingSources: vi.fn().mockResolvedValue([]),
  getMakes: vi.fn().mockResolvedValue([{ make: "Toyota", count: 120 }]),
  getListings: vi.fn().mockResolvedValue({ listings: [], total: 42 }),
  getListingPriceSample: vi.fn().mockResolvedValue({ prices: [], total: 0 }),
  APIError: class APIError extends Error {
    status = 500;
  },
  createAlert: vi.fn(),
  deleteAlert: vi.fn(),
  updateAlertChannels: vi.fn(),
  getOrCreateAlertToken: vi.fn().mockReturnValue("t"),
  getModels: vi.fn().mockResolvedValue([{ model: "Vitz", count: 40 }]),
  formatPrice: (value: number | null) => (value == null ? "N/A" : `Rs. ${value}`),
}));

function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function createFilters(overrides: Partial<FilterState> = {}): FilterState {
  return {
    sort: "newest",
    page: 1,
    ...overrides,
  };
}

describe("FilterSidebar price availability controls", () => {
  it("shows a priced-vs-unavailable inventory toggle", async () => {
    render(<FilterSidebar filters={createFilters()} onFiltersChange={vi.fn()} />);

    expect(await screen.findByRole("button", { name: /With price/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /No price/i })).toBeInTheDocument();
  }, 10_000);

  it("shows direct min and max price inputs", async () => {
    render(<FilterSidebar filters={createFilters()} onFiltersChange={vi.fn()} />);

    expect(await screen.findByLabelText(/^minimum price$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^maximum price$/i)).toBeInTheDocument();
  });

  it("switches to the unavailable-price inventory mode", async () => {
    const onFiltersChange = vi.fn();

    render(
      <FilterSidebar
        filters={createFilters({ price_min: 1_000_000, price_max: 8_000_000, sort: "price_desc" })}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /No price/i }));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        price_availability: "unavailable",
        price_min: undefined,
        price_max: undefined,
        sort: "best_match",
        page: 1,
      }),
    );
  });
});

describe("FilterSidebar price input parsing", () => {
  it("accepts lakh shorthand in the price box", async () => {
    const onFiltersChange = vi.fn();
    render(<FilterSidebar filters={createFilters()} onFiltersChange={onFiltersChange} />);
    const max = await screen.findByLabelText(/^maximum price$/i);
    fireEvent.change(max, { target: { value: "85L" } });
    fireEvent.keyDown(max, { key: "Enter" });
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ price_max: 8_500_000, page: 1 }));
  });

  it("shows thousands separators while typing a plain number", async () => {
    render(<FilterSidebar filters={createFilters()} onFiltersChange={vi.fn()} />);
    const min = await screen.findByLabelText(/^minimum price$/i);
    fireEvent.change(min, { target: { value: "7250000" } });
    expect(min).toHaveValue("7,250,000");
  });
});
