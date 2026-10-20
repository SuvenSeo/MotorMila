import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppPreferencesProvider } from "@/lib/appPreferences";
import { MobileBottomNav } from "@/components/MobileBottomNav";

const ROUTER_FLAGS = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

function renderNav(initialPath = "/") {
  return render(
    <AppPreferencesProvider>
      <MemoryRouter initialEntries={[initialPath]} future={ROUTER_FLAGS}>
        <MobileBottomNav />
      </MemoryRouter>
    </AppPreferencesProvider>,
  );
}

describe("MobileBottomNav", () => {
  it("renders a nav landmark with 6 tabs", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: /mobile bottom navigation/i });
    expect(nav).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(6);
  });

  it("renders the expected tab labels", () => {
    renderNav();
    expect(screen.getByRole("link", { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /market/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /alerts/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /trends/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /best picks/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pro/i })).toBeInTheDocument();
  });

  it("links point to the correct routes", () => {
    renderNav();
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /market/i })).toHaveAttribute("href", "/#market");
    expect(screen.getByRole("link", { name: /alerts/i })).toHaveAttribute("href", "/alerts");
    expect(screen.getByRole("link", { name: /trends/i })).toHaveAttribute("href", "/trends");
    expect(screen.getByRole("link", { name: /best picks/i })).toHaveAttribute("href", "/best-picks");
    expect(screen.getByRole("link", { name: /pro/i })).toHaveAttribute("href", "/pro");
  });

  it("marks the Home tab as active on the root route", () => {
    renderNav("/");
    const homeLink = screen.getByRole("link", { name: /home/i });
    expect(homeLink).toHaveAttribute("aria-current", "page");
    expect(homeLink).toHaveAttribute("data-active", "true");
  });

  it("does not mark non-active tabs as current on root route", () => {
    renderNav("/");
    const trendsLink = screen.getByRole("link", { name: /trends/i });
    expect(trendsLink).not.toHaveAttribute("aria-current");
    expect(trendsLink).toHaveAttribute("data-active", "false");
  });

  it("marks the Trends tab as active on /trends route", () => {
    renderNav("/trends");
    const trendsLink = screen.getByRole("link", { name: /trends/i });
    expect(trendsLink).toHaveAttribute("aria-current", "page");
    expect(trendsLink).toHaveAttribute("data-active", "true");
  });

  it("marks the Best Picks tab as active on /best-picks route", () => {
    renderNav("/best-picks");
    const bestPicksLink = screen.getByRole("link", { name: /best picks/i });
    expect(bestPicksLink).toHaveAttribute("aria-current", "page");
    expect(bestPicksLink).toHaveAttribute("data-active", "true");
  });

  it("marks the Pro tab as active on /pro route", () => {
    renderNav("/pro");
    const proLink = screen.getByRole("link", { name: /pro/i });
    expect(proLink).toHaveAttribute("aria-current", "page");
    expect(proLink).toHaveAttribute("data-active", "true");
  });

  it("marks the Alerts tab as active on /alerts route", () => {
    renderNav("/alerts");
    const alertsLink = screen.getByRole("link", { name: /alerts/i });
    expect(alertsLink).toHaveAttribute("aria-current", "page");
    expect(alertsLink).toHaveAttribute("data-active", "true");
  });

  it("has md:hidden class to show only on mobile screens", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: /mobile bottom navigation/i });
    expect(nav.className).toContain("md:hidden");
  });

  it("floats as a liquid-glass capsule above the home indicator", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: /mobile bottom navigation/i });
    expect(nav.className).toContain("fixed");
    expect(nav.className).toContain("bottom-3");
    expect(nav.className).toContain("inset-x-3");
  });

  it("applies safe-area-inset-bottom padding via inline style", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: /mobile bottom navigation/i });
    expect(nav).toHaveStyle({ paddingBottom: "env(safe-area-inset-bottom)" });
  });

  it("Home tab is not marked active when on /trends route", () => {
    renderNav("/trends");
    const homeLink = screen.getByRole("link", { name: /home/i });
    expect(homeLink).not.toHaveAttribute("aria-current");
    expect(homeLink).toHaveAttribute("data-active", "false");
  });
});
