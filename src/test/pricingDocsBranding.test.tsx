import type { ReactElement } from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Docs from "@/pages/Docs";
import Pricing from "@/pages/Pricing";
import { AppPreferencesProvider } from "@/lib/appPreferences";
import { AuthProvider } from "@/lib/authContext";
import { PRICING_COMING_SOON } from "@/lib/pricingContent";

function wrap(ui: ReactElement) {
  return render(
    <AppPreferencesProvider>
      <AuthProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{ui}</MemoryRouter>
      </AuthProvider>
    </AppPreferencesProvider>,
  );
}

describe("Docs and Pricing pages", () => {
  it("renders platform docs with section anchors", () => {
    wrap(<Docs />);
    expect(screen.getByRole("heading", { name: /Platform docs/i })).toBeInTheDocument();
    expect(document.getElementById("official-pulse")).toBeTruthy();
    expect(document.getElementById("dealer-workspace")).toBeTruthy();
  });

  it("shows Free, Pro and Dealer while keeping Pro on a waitlist and dealer checkout separate", () => {
    wrap(<Pricing />);
    expect(screen.getByRole("heading", { name: /free while we're in beta/i })).toBeInTheDocument();
    expect(screen.queryByText(/funds the pipeline/i)).toBeNull();
    const plans = within(screen.getByRole("region", { name: "Plans for buyers and dealers" }));
    expect(plans.getByRole("heading", { name: /^Free$/ })).toBeInTheDocument();
    expect(plans.getByRole("heading", { name: /^Pro$/ })).toBeInTheDocument();
    expect(plans.getByRole("heading", { name: /^Dealer$/ })).toBeInTheDocument();
    expect(plans.getByRole("link", { name: "See dealer plans" })).toHaveAttribute("href", "#dealer-plans");
    expect(screen.queryByText(/^Custom$/)).toBeNull();
    expect(screen.queryByText(/SLA/i)).toBeNull();
    expect(screen.getAllByText(/coming soon/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /notify me/i }).length).toBeGreaterThan(0);
    // One Pro voice
    expect(screen.queryByText(/join the waitlist|upgrade to pro/i)).toBeNull();
    expect(screen.getAllByText(/free during beta/i).length).toBeGreaterThan(0);
    // Checkout is still inside the collapsed dealer section.
    expect(screen.getByRole("button", { name: /^for dealers/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByText("LKR 2,990").length).toBeGreaterThan(0);
    expect(PRICING_COMING_SOON).toBe(true);
    expect(screen.queryByText(/stripe/i)).toBeNull();
    expect(screen.getAllByRole("link", { name: /Message us/i })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:"),
    );
  });
});
