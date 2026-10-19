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

  it("renders pricing tiers and ICP personas", () => {
    wrap(<Pricing />);
    expect(screen.getByRole("heading", { name: /Pricing that funds the pipeline/i })).toBeInTheDocument();
    // Live LKR prices are shown; Pro is labelled free during beta, Dealer from LKR 2,990.
    expect(screen.getByText("LKR 999")).toBeInTheDocument();
    expect(screen.getAllByText("LKR 2,990").length).toBeGreaterThan(0);
    expect(screen.getByText("LKR 6,990")).toBeInTheDocument();
    expect(screen.getByText("LKR 14,990")).toBeInTheDocument();
    if (PRICING_COMING_SOON) {
      expect(screen.getAllByText(/free during beta/i).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText(/stripe/i)).toBeNull();
    expect(screen.getByText("Dealers")).toBeInTheDocument();
    if (PRICING_COMING_SOON) {
      // Trial CTA is an honest waitlist form while paid plans are coming soon
      // (not a link to invite-gated signup that would error).
      expect(screen.getAllByPlaceholderText(/email for launch invite/i).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("button", { name: /notify me/i }).length).toBeGreaterThan(0);
    } else {
      expect(screen.getAllByRole("link", { name: /join the waitlist/i })[0]).toHaveAttribute(
        "href",
        "#get-started",
      );
    }
    expect(screen.getAllByRole("link", { name: /Message us/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Message us/i })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:"),
    );
  });
});
