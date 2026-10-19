import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileFilterSheet } from "@/components/MobileFilterSheet";
import type { FilterState } from "@/types/car";
import * as api from "@/services/api";

vi.mock("@/services/api", () => ({
  getMakes: vi.fn().mockResolvedValue([
    { make: "Toyota", count: 120 },
    { make: "Honda", count: 80 },
  ]),
  getModels: vi.fn().mockResolvedValue([{ model: "Aqua", count: 30 }]),
  getListingSources: vi.fn().mockResolvedValue([]),
  getListings: vi.fn().mockResolvedValue({ listings: [], total: 1284 }),
  getListingPriceSample: vi.fn().mockResolvedValue({ prices: [], total: 0 }),
  APIError: class APIError extends Error {
    status = 500;
  },
  createAlert: vi.fn(),
  deleteAlert: vi.fn(),
  updateAlertChannels: vi.fn(),
  getOrCreateAlertToken: vi.fn().mockReturnValue("t"),
}));

function baseFilters(overrides: Partial<FilterState> = {}): FilterState {
  return { sort: "best_match", page: 1, vehicle_category: "cars", ...overrides };
}

function renderSheet(
  props: Partial<{
    open: boolean;
    onOpenChange: (v: boolean) => void;
    filters: FilterState;
    onFiltersChange: (f: FilterState) => void;
  }> = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const defaults = { open: true, onOpenChange: vi.fn(), filters: baseFilters(), onFiltersChange: vi.fn() };
  const merged = { ...defaults, ...props };
  render(
    <QueryClientProvider client={client}>
      <MobileFilterSheet {...merged} />
    </QueryClientProvider>,
  );
  return merged;
}

describe("MobileFilterSheet (filter drawer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getListings).mockResolvedValue({ listings: [], total: 1284 });
  });

  it("renders the full filter set when open", async () => {
    renderSheet();
    expect(await screen.findByLabelText(/Search listings/i)).toBeInTheDocument();
    expect(screen.getAllByText("Make").length).toBeGreaterThan(0);
    expect(screen.getAllByText("District").length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/^minimum price$/i)).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    renderSheet({ open: false });
    expect(screen.queryByLabelText(/Search listings/i)).not.toBeInTheDocument();
  });

  it("shows a sticky 'Show N results' button with the live count", async () => {
    renderSheet();
    expect(await screen.findByRole("button", { name: /show 1,284 results/i })).toBeInTheDocument();
  });

  it("edits a draft and applies it once (one history step)", async () => {
    const props = renderSheet();
    await screen.findByLabelText(/Search listings/i);

    fireEvent.click(screen.getByRole("button", { name: "Diesel" }));
    expect(props.onFiltersChange).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(api.getListings).toHaveBeenCalledWith(expect.objectContaining({ fuel_type: "diesel", page: 1 }));
    });

    fireEvent.click(await screen.findByRole("button", { name: /show .* results/i }));
    expect(props.onFiltersChange).toHaveBeenCalledTimes(1);
    expect(props.onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ fuel_type: "diesel", page: 1 }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("clear all resets the draft without closing", async () => {
    const props = renderSheet({ filters: baseFilters({ make: "Toyota", district: "Colombo" }) });
    await screen.findByLabelText(/Search listings/i);
    fireEvent.click(screen.getByRole("button", { name: /clear all filters/i }));
    expect(props.onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: /show .* results/i }));
    expect(props.onFiltersChange).toHaveBeenCalledWith({ sort: "best_match", page: 1, vehicle_category: "cars" });
  });
});
