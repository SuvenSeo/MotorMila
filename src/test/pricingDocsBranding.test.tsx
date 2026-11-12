import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
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

  it("shows only Free + an honest Pro (coming soon, notify me); dealers tucked away", () => {
    wrap(<Pricing />);
    expect(screen.getByRole("heading", { name: /free while we're in beta/i })).toBeInTheDocument();
    expect(screen.queryByText(/funds the pipeline/i)).toBeNull();
    // Plan grid: Free and Pro only
    expect(screen.getByRole("heading", { name: /two plans/i })).toBeInTheDocument();
    expect(screen.queryByText(/^Custom$/)).toBeNull();
    expect(screen.queryByText(/SLA/i)).toBeNull();
    expect(screen.getAllByText(/coming soon/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /notify me/i }).length).toBeGreaterThan(0);
    // One Pro voice
    expect(screen.queryByText(/join the waitlist|upgrade to pro/i)).toBeNull();
    expect(screen.getAllByText(/free during beta/i).length).toBeGreaterThan(0);
    // Dealer plans still reachable, inside "For dealers"
    expect(screen.getByText(/^for dealers$/i)).toBeInTheDocument();
    expect(screen.getAllByText("LKR 2,990").length).toBeGreaterThan(0);
    expect(PRICING_COMING_SOON).toBe(true);
    expect(screen.queryByText(/stripe/i)).toBeNull();
    expect(screen.getAllByRole("link", { name: /Message us/i })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:"),
    );
  });
});
