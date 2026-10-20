import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MobileFilterSheet } from "@/components/MobileFilterSheet";
import type { FilterState } from "@/types/car";

vi.mock("@/services/api", () => ({
  getMakes: vi.fn().mockResolvedValue([
    { make: "Toyota", count: 120 },
    { make: "Honda", count: 80 },
    { make: "Suzuki", count: 60 },
  ]),
  getModels: vi.fn().mockResolvedValue([
    { model: "Aqua", count: 30 },
    { model: "Axio", count: 20 },
    { model: "Prius", count: 15 },
  ]),
}));

vi.mock("@/data/districts", () => ({
  SRI_LANKA_DISTRICTS: ["Colombo", "Gampaha", "Kandy", "Galle"],
}));

function baseFilters(overrides: Partial<FilterState> = {}): FilterState {
  return {
    sort: "newest",
    page: 1,
    ...overrides,
  };
}

function renderSheet(
  props: Partial<{
    open: boolean;
    onOpenChange: (v: boolean) => void;
    filters: FilterState;
    onFiltersChange: (f: FilterState) => void;
  }> = {},
) {
  const defaults = {
    open: true,
    onOpenChange: vi.fn(),
    filters: baseFilters(),
    onFiltersChange: vi.fn(),
  };
  return render(<MobileFilterSheet {...defaults} {...props} />);
}

async function renderSheetReady(
  props: Partial<{
    open: boolean;
    onOpenChange: (v: boolean) => void;
    filters: FilterState;
    onFiltersChange: (f: FilterState) => void;
  }> = {},
) {
  const view = renderSheet(props);
  if (props.open === false) return view;
  // Flush getMakes() so Radix Select updates land inside act().
  await waitFor(() => {
    expect(screen.getByText("Make")).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: "Toyota" })).toBeTruthy();
  });
  return view;
}

describe("MobileFilterSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the sheet title when open", async () => {
    await renderSheetReady();
    expect(screen.getByText("Quick Filters")).toBeInTheDocument();
  });

  it("does not render sheet content when closed", () => {
    renderSheet({ open: false });
    expect(screen.queryByText("Quick Filters")).not.toBeInTheDocument();
  });

  it("renders Make, Price range, and District sections", async () => {
    await renderSheetReady();
    expect(screen.getByText("Make")).toBeInTheDocument();
    expect(screen.getByText("Price range")).toBeInTheDocument();
    expect(screen.getByText("District")).toBeInTheDocument();
  });

  it("renders quick-make pills for Toyota, Suzuki, Honda, Nissan", async () => {
    await renderSheetReady();
    expect(screen.getByRole("button", { name: "Toyota" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suzuki" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Honda" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nissan" })).toBeInTheDocument();
  });

  it("renders price preset pills", async () => {
    await renderSheetReady();
    expect(screen.getByRole("button", { name: "Under 3M" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3M–6M" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "6M–10M" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10M+" })).toBeInTheDocument();
  });

  it("renders Min LKR and Max LKR price inputs", async () => {
    await renderSheetReady();
    expect(screen.getByLabelText("Minimum price")).toBeInTheDocument();
    expect(screen.getByLabelText("Maximum price")).toBeInTheDocument();
  });

  it("shows active filter count badge when filters are set", async () => {
    await renderSheetReady({
      filters: baseFilters({ make: "Toyota", district: "Colombo" }),
    });
    expect(screen.getByLabelText("2 active filters")).toBeInTheDocument();
  });

  it("does not show badge when no filters are active", async () => {
    await renderSheetReady({ filters: baseFilters() });
    expect(screen.queryByLabelText(/active filter/i)).not.toBeInTheDocument();
  });

  it("renders Cancel and Apply buttons", async () => {
    await renderSheetReady();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply filters/i })).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const onOpenChange = vi.fn();
    await renderSheetReady({ onOpenChange });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onFiltersChange and onOpenChange(false) when Apply is clicked", async () => {
    const onFiltersChange = vi.fn();
    const onOpenChange = vi.fn();
    await renderSheetReady({ onFiltersChange, onOpenChange });
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));
    expect(onFiltersChange).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("includes selected make in applied filters", async () => {
    const onFiltersChange = vi.fn();
    await renderSheetReady({ onFiltersChange });

    fireEvent.click(screen.getByRole("button", { name: "Toyota" }));
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ make: "Toyota" }),
    );
  });

  it("deselects a quick-make pill when clicked a second time", async () => {
    const onFiltersChange = vi.fn();
    await renderSheetReady({ onFiltersChange, filters: baseFilters({ make: "Toyota" }) });

    // The Toyota pill is active on open — click to deselect
    fireEvent.click(screen.getByRole("button", { name: "Toyota" }));
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ make: undefined }),
    );
  });

  it("calls onFiltersChange with cleared fields when Clear all is clicked", async () => {
    const onFiltersChange = vi.fn();
    const onOpenChange = vi.fn();
    await renderSheetReady({
      onFiltersChange,
      onOpenChange,
      filters: baseFilters({ make: "Toyota", district: "Colombo", price_min: 3_000_000 }),
    });

    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        make: undefined,
        model: undefined,
        price_min: undefined,
        price_max: undefined,
        district: undefined,
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("applies price preset when a preset pill is clicked", async () => {
    const onFiltersChange = vi.fn();
    await renderSheetReady({ onFiltersChange });

    fireEvent.click(screen.getByRole("button", { name: "Under 3M" }));
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ price_min: 500_000, price_max: 3_000_000 }),
    );
  });

  it("hides price range section when price_availability is unavailable", async () => {
    await renderSheetReady({
      filters: baseFilters({ price_availability: "unavailable" }),
    });
    expect(screen.queryByText("Price range")).not.toBeInTheDocument();
  });

  it("shows Model section after fetching models for selected make", async () => {
    await renderSheetReady({ filters: baseFilters({ make: "Toyota" }) });
    await waitFor(() => {
      expect(screen.getByText("Model")).toBeInTheDocument();
    });
  });

  it("resets price inputs when preset is clicked twice (toggle off)", async () => {
    const onFiltersChange = vi.fn();
    await renderSheetReady({ onFiltersChange });

    const presetBtn = screen.getByRole("button", { name: "3M–6M" });
    fireEvent.click(presetBtn); // select
    fireEvent.click(presetBtn); // deselect
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ price_min: undefined, price_max: undefined }),
    );
  });

  it("min/max price inputs accept numeric input and apply it", async () => {
    const onFiltersChange = vi.fn();
    await renderSheetReady({ onFiltersChange });

    fireEvent.change(screen.getByLabelText("Minimum price"), {
      target: { value: "2000000" },
    });
    fireEvent.change(screen.getByLabelText("Maximum price"), {
      target: { value: "8000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ price_min: 2_000_000, price_max: 8_000_000 }),
    );
  });

  it("preserves existing filters (sort, page) when applying", async () => {
    const onFiltersChange = vi.fn();
    await renderSheetReady({
      onFiltersChange,
      filters: baseFilters({ sort: "price_asc", page: 3 }),
    });

    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "price_asc", page: 1 }),
    );
  });
});
