import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/RequireAuth";
import { AuthProvider } from "@/lib/authContext";
import { AppPreferencesProvider } from "@/lib/appPreferences";
import { FreePlanBanner } from "@/components/FreePlanBanner";
import { ProFeatureLock } from "@/components/ProFeatureLock";

function installLocalStorage(seed?: Record<string, unknown>, token?: string) {
  const store = new Map<string, string>();
  if (seed) store.set("motormila.auth_user", JSON.stringify(seed));
  if (token) store.set("motormila.auth_token", token);

  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };

  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
}

describe("RequireAuth + free plan locks", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it("redirects anonymous visitors to sign-in", () => {
    render(
      <AppPreferencesProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/sign-in" element={<div>Sign in page</div>} />
              <Route
                path="/"
                element={(
                  <RequireAuth>
                    <div>Private home</div>
                  </RequireAuth>
                )}
              />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </AppPreferencesProvider>,
    );

    expect(screen.getByText(/sign in page/i)).toBeInTheDocument();
    expect(screen.queryByText(/private home/i)).not.toBeInTheDocument();
  });

  it("shows free-plan banner and blurs locked content for free users", () => {
    installLocalStorage({
      email: "free@example.com",
      name: "Free User",
      plan: "free",
      subscriptionStatus: "none",
      role: "user",
      avatarInitials: "FU",
    });

    render(
      <AppPreferencesProvider>
        <AuthProvider>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <FreePlanBanner />
            <ProFeatureLock label="Lane intelligence">
              <div>Secret analytics</div>
            </ProFeatureLock>
          </MemoryRouter>
        </AuthProvider>
      </AppPreferencesProvider>,
    );

    // B1/B2 copy: en.ts freeBanner.body + FreePlanBanner Upgrade CTA + ProFeatureLock trial lock.
    expect(screen.getByText(/you're on the free plan/i)).toBeInTheDocument();
    expect(screen.getAllByText(/lane intelligence/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /^upgrade$/i })).toHaveAttribute("href", "/pricing");
    expect(screen.getAllByText(/join the waitlist/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /join the waitlist/i })).toHaveAttribute(
      "href",
      "/pricing",
    );
  });

  it("does not blur content for pro users", () => {
    installLocalStorage({
      email: "pro@example.com",
      name: "Pro User",
      plan: "pro",
      subscriptionStatus: "active",
      role: "user",
      avatarInitials: "PU",
    });

    render(
      <AppPreferencesProvider>
        <AuthProvider>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <FreePlanBanner />
            <ProFeatureLock label="Lane intelligence">
              <div>Secret analytics</div>
            </ProFeatureLock>
          </MemoryRouter>
        </AuthProvider>
      </AppPreferencesProvider>,
    );

    expect(screen.queryByText(/you're on the/i)).not.toBeInTheDocument();
    expect(screen.getByText(/secret analytics/i)).toBeInTheDocument();
    expect(screen.queryByText(/lane intelligence/i)).not.toBeInTheDocument();
  });
});
