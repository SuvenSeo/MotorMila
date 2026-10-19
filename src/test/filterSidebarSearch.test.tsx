import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterSidebar } from "@/components/FilterSidebar";
import type { FilterState } from "@/types/car";
import * as api from "@/services/api";

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
  getModels: vi.fn().mockResolvedValue([
    { model: "Aqua", count: 30 },
    { model: "Axio", count: 20 },
    { model: "Vitz", count: 40 },
  ]),
  formatPrice: (value: number | null) => (value == null ? "N/A" : `LKR ${value}`),
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

describe("FilterSidebar searchable model input", () => {
  it("commits keyword searches into filter state", async () => {
    const onFiltersChange = vi.fn();
    render(<FilterSidebar filters={createFilters()} onFiltersChange={onFiltersChange} />);

    const keyword = await screen.findByLabelText(/Search listings/i);
    fireEvent.change(keyword, { target: { value: "Toyota Axio" } });
    fireEvent.keyDown(keyword, { key: "Enter" });

    // Known make + model resolve to structured filters (alias map).
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        make: "Toyota",
        model: "Axio",
        page: 1,
      }),
    );

    fireEvent.change(keyword, { target: { value: "kdh  van" } });
    fireEvent.keyDown(keyword, { key: "Enter" });
    expect(onFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({ q: "kdh van", page: 1 }));
  });

  it("shows a model select when make is selected", async () => {
    render(<FilterSidebar filters={createFilters({ make: "Toyota" })} onFiltersChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("All models")).toBeInTheDocument();
    });
  });

  it("shows model search when many models are available", async () => {
    vi.mocked(api.getModels).mockResolvedValueOnce(
      Array.from({ length: 9 }, (_, index) => ({ model: `Model ${index + 1}`, count: 10 })),
    );

    render(<FilterSidebar filters={createFilters({ make: "Toyota" })} onFiltersChange={vi.fn()} />);

    expect(await screen.findByPlaceholderText("Find model…")).toBeInTheDocument();
  });
});

describe("FilterSidebar Singlish search tolerance", () => {
  it("maps a misspelt model to make + model filters", async () => {
    const onFiltersChange = vi.fn();
    render(<FilterSidebar filters={createFilters()} onFiltersChange={onFiltersChange} />);
    const keyword = await screen.findByLabelText(/Search listings/i);
    fireEvent.change(keyword, { target: { value: "akwa 2015" } });
    fireEvent.keyDown(keyword, { key: "Enter" });
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ make: "Toyota", model: "Aqua", q: "2015", page: 1 }),
    );
  });

  it("does not render quick-make pills next to the make picker (no duplicate Make filter)", async () => {
    render(<FilterSidebar filters={createFilters()} onFiltersChange={vi.fn()} />);
    await screen.findByLabelText(/Search listings/i);
    expect(screen.queryByRole("button", { name: /^Suzuki$/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/sort listings/i)).not.toBeInTheDocument();
  });
});
