import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterSidebar } from "@/components/FilterSidebar";
import type { FilterState } from "@/types/car";
import * as api from "@/services/api";

vi.mock("@/services/api", () => ({
  getListingSources: vi.fn().mockResolvedValue([]),
  getMakes: vi.fn().mockResolvedValue([{ make: "Toyota", count: 120 }]),
  getModels: vi.fn().mockResolvedValue([
    { model: "Aqua", count: 30 },
    { model: "Axio", count: 20 },
    { model: "Vitz", count: 40 },
  ]),
  formatPrice: (value: number | null) => (value == null ? "N/A" : `LKR ${value}`),
}));

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

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "Toyota Axio",
        page: 1,
      }),
    );
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
