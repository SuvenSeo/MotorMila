import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Navbar } from "@/components/Navbar";
import { AppPreferencesProvider } from "@/lib/appPreferences";
import { AuthProvider } from "@/lib/authContext";

vi.mock("@/services/api", () => ({
  getPipelineStatus: vi.fn().mockResolvedValue({ overall_status: "ok", jobs: [] }),
}));

describe("Navbar accessibility active-state", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 0 });
  });

  it("shows the five primary destinations in the header", async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <AppPreferencesProvider>
            <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Navbar />
            </MemoryRouter>
          </AppPreferencesProvider>
        </AuthProvider>,
      );
    });
    const primary = screen.getByRole("navigation", { name: /primary navigation/i });
    for (const name of ["Buy", "Prices", "Tools", "Sell", "Saved"]) {
      expect(primary.querySelector(`a[href]`)).not.toBeNull();
      expect(screen.getAllByRole("link", { name: new RegExp(`^${name}$`, "i") }).length).toBeGreaterThan(0);
    }
  });

  it("marks the active section link with aria-current on dashboard route", async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <AppPreferencesProvider>
            <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Navbar />
            </MemoryRouter>
          </AppPreferencesProvider>
        </AuthProvider>,
      );
    });

    const buyLinks = screen.getAllByRole("link", { name: /^buy$/i });
    expect(buyLinks.some((link) => link.getAttribute("aria-current") === "page")).toBe(true);
    expect(buyLinks.some((link) => link.getAttribute("data-active") === "true")).toBe(true);
  });

  it("marks trends link as current on trends route", async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <AppPreferencesProvider>
            <MemoryRouter initialEntries={["/trends"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Navbar />
            </MemoryRouter>
          </AppPreferencesProvider>
        </AuthProvider>,
      );
    });

    const pricesLinks = screen.getAllByRole("link", { name: /^prices$/i });
    expect(pricesLinks.some((link) => link.getAttribute("aria-current") === "page")).toBe(true);
    // The unlabeled "Delayed" pill is gone; nothing renders while data is fresh.
    expect(screen.queryByText(/^delayed$/i)).not.toBeInTheDocument();
  });

  it("stays compact after leaving the top and restores only at the top", async () => {
    let queuedFrame: FrameRequestCallback | null = null;
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      queuedFrame = callback;
      return 1;
    });

    await act(async () => {
      render(
        <AuthProvider>
          <AppPreferencesProvider>
            <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Navbar />
            </MemoryRouter>
          </AppPreferencesProvider>
        </AuthProvider>,
      );
    });

    const primaryNav = screen.getByRole("navigation", { name: /primary navigation/i });
    const header = primaryNav.closest("header");
    expect(header).toHaveAttribute("data-scrolled", "false");
    expect(header).toHaveAttribute("data-nav-mode", "full");

    act(() => {
      window.scrollY = 120;
      fireEvent.scroll(window);
      queuedFrame?.(0);
      queuedFrame = null;
    });
    expect(header).toHaveAttribute("data-scrolled", "true");
    expect(header).toHaveAttribute("data-nav-mode", "compact");

    act(() => {
      window.scrollY = 110;
      fireEvent.scroll(window);
      queuedFrame?.(0);
    });
    expect(header).toHaveAttribute("data-scrolled", "true");
    expect(header).toHaveAttribute("data-nav-mode", "compact");

    act(() => {
      window.scrollY = 0;
      fireEvent.scroll(window);
      queuedFrame?.(0);
    });
    expect(header).toHaveAttribute("data-scrolled", "false");
    expect(header).toHaveAttribute("data-nav-mode", "full");
    requestAnimationFrameSpy.mockRestore();
  });

  it("opens the sign-in portal shell with every entry action", async () => {    
    await act(async () => {
      render(
        <AuthProvider>
          <AppPreferencesProvider>
            <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Navbar />
            </MemoryRouter>
          </AppPreferencesProvider>
        </AuthProvider>,
      );
    });

    const signInButton = screen.getAllByRole("button", { name: /sign in/i })[0];
    fireEvent.click(signInButton);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in with email and password/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep browsing without signing in/i })).toBeInTheDocument();
  });

  it("opens a compact More menu holding only routes the destinations do not reach", async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <AppPreferencesProvider>
            <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Navbar />
            </MemoryRouter>
          </AppPreferencesProvider>
        </AuthProvider>,
      );
    });

    const trigger = screen.getByRole("button", { name: /^more$/i });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    act(() => {
      trigger.focus();
      fireEvent.keyDown(trigger, { key: "Enter" });
    });

    const menu = await screen.findByRole("menu");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((el) => el.textContent ?? "");
    expect(items.some((text) => /pricing/i.test(text))).toBe(true);
    expect(items.some((text) => /how it works/i.test(text))).toBe(true);
    // No repeats of the five destinations' own sections.
    expect(items.some((text) => /price trends|import tax calculator|sell your vehicle|browse all vehicles/i.test(text))).toBe(false);

    act(() => {
      fireEvent.keyDown(menu, { key: "Escape" });
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
