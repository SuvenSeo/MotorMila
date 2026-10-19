import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketTicker } from "@/components/MarketTicker";
import { AppPreferencesProvider } from "@/lib/appPreferences";

const rows = [
  { make: "Suzuki", model: "Alto", avg_price_lkr: 4_045_488.37, movement_pct: -4.8, listing_count: 40 },
  { make: "Toyota", model: "Aqua", avg_price_lkr: 7_930_000, movement_pct: 2.3, listing_count: 90 },
  { make: "Honda", model: "Vezel", avg_price_lkr: 11_200_000.5, movement_pct: 0.4, listing_count: 50 },
];

describe("MarketTicker", () => {
  it("shows mixed up/down/stable tones and whole-rupee prices (no cents)", () => {
    const { container } = render(
      <AppPreferencesProvider>
        <MarketTicker rows={rows} />
      </AppPreferencesProvider>,
    );
    expect(screen.getByRole("button", { name: /Suzuki Alto.*down 4\.8 percent/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Toyota Aqua.*up 2\.3 percent/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Honda Vezel.*stable/i })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d\.\d{2}(?!%)\b/); // no ".37"-style cents
    expect(container.textContent).toMatch(/4,045,488/);
  });
});
