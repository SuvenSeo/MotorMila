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

const TABS: Array<[RegExp, string]> = [
  [/^buy$/i, "/"],
  [/^prices$/i, "/trends"],
  [/^tools$/i, "/calculator"],
  [/^sell$/i, "/sell"],
  [/^saved$/i, "/alerts"],
];

describe("MobileBottomNav", () => {
  it("renders a nav landmark with the five primary destinations", () => {
    renderNav();
    expect(screen.getByRole("navigation", { name: /mobile bottom navigation/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("links each destination to its route", () => {
    renderNav();
    for (const [name, href] of TABS) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("has no Pro tab", () => {
    renderNav();
    expect(screen.queryByRole("link", { name: /pro/i })).not.toBeInTheDocument();
  });

  it.each([
    ["/", /^buy$/i],
    ["/listing/12", /^buy$/i],
    ["/cars/toyota/aqua", /^buy$/i],
    ["/best-picks", /^buy$/i],
    ["/trends", /^prices$/i],
    ["/estimate", /^prices$/i],
    ["/calculator", /^tools$/i],
    ["/afford", /^tools$/i],
    ["/sell", /^sell$/i],
    ["/alerts", /^saved$/i],
  ])("marks the right tab active on %s", (path, name) => {
    renderNav(path);
    const link = screen.getByRole("link", { name });
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveAttribute("data-active", "true");
    const others = screen.getAllByRole("link").filter((l) => l !== link);
    others.forEach((l) => expect(l).not.toHaveAttribute("aria-current"));
  });

  it("keeps whole-word labels (no ellipsis) and equal tab widths so si/ta words never collide", () => {
    renderNav();
    const label = screen.getByText(/^prices$/i);
    expect(label.className).toContain("bottom-nav-label");
    expect(label.className).not.toContain("truncate");
    const link = screen.getByRole("link", { name: /^prices$/i });
    expect(link.className).toContain("min-w-[3.5rem]");
  });

  it("only shows on mobile and floats above the home indicator", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: /mobile bottom navigation/i });
    expect(nav.className).toContain("md:hidden");
    expect(nav.className).toContain("fixed");
    expect(nav.className).toContain("bottom-3");
    expect(nav.className).toContain("z-bottom-nav");
    expect(nav).toHaveStyle({ marginBottom: "env(safe-area-inset-bottom)" });
  });
});
