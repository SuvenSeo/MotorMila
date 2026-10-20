import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketTicker, describeMovement } from "@/components/MarketTicker";

// Regression: prod home crashed with "Cannot read properties of null
// (reading 'toFixed')" when insights came from the catalog snapshot
// (movement_pct: null) because the backend DB was down.
describe("MarketTicker null-safety", () => {
  it("renders rows whose movement_pct / avg price are null without throwing", () => {
    render(
      <MarketTicker
        rows={[
          { make: "Toyota", model: "Aqua", avg_price_lkr: 6_500_000, movement_pct: null, listing_count: 40 },
          { make: "Honda", model: "Fit", avg_price_lkr: 5_900_000, movement_pct: -2.345, listing_count: 30 },
          // Defensive: bad upstream data typed loosely at runtime.
          { make: "Suzuki", model: "Alto", avg_price_lkr: null as unknown as number, movement_pct: Number.NaN, listing_count: 3 },
        ]}
      />,
    );
    expect(screen.getAllByText("TOYOTA AQUA").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-2.35%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("\u2014").length).toBeGreaterThan(0);
  });

  it("describes missing movement for screen readers", () => {
    expect(describeMovement(null)).toBe("no recent change data");
    expect(describeMovement(undefined)).toBe("no recent change data");
    expect(describeMovement(1.25)).toBe("up 1.3 percent");
    expect(describeMovement(-4)).toBe("down 4.0 percent");
  });
});
