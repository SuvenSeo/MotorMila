import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AuthProvider } from "@/lib/authContext";
import { AppPreferencesProvider } from "@/lib/appPreferences";

function installLocalStorage(seed?: Record<string, unknown>, token?: string) {
  const store = new Map<string, string>();
  if (seed) {
    store.set("motormila.auth_user", JSON.stringify(seed));
  }
  if (token) {
    store.set("motormila.auth_token", token);
  }

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

function renderProtected() {
  render(
    <AppPreferencesProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={["/pro"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/sign-in" element={<div>Sign in page</div>} />
            <Route path="/pro-preview" element={<div>Preview page</div>} />
            <Route
              path="/pro"
              element={(
                <ProtectedRoute>
                  <div>Full Pro Dashboard</div>
                </ProtectedRoute>
              )}
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </AppPreferencesProvider>,
  );
}

describe("Pro access gate", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it("blocks signed-in free users from the Pro dashboard", () => {
    installLocalStorage({
      email: "free@motormila.lk",
      name: "Free User",
      plan: "free",
      subscriptionStatus: "none",
      avatarInitials: "FU",
    });

    renderProtected();

    expect(screen.getByText(/subscription required/i)).toBeInTheDocument();
    expect(screen.getByText(/pro is locked/i)).toBeInTheDocument();
    expect(screen.queryByText(/full pro dashboard/i)).not.toBeInTheDocument();
  });

  it("allows active Pro subscribers into the dashboard", () => {
    installLocalStorage({
      email: "owner@motormila.lk",
      name: "Motormila Owner",
      plan: "enterprise",
      subscriptionStatus: "active",
      avatarInitials: "AO",
    });

    renderProtected();

    expect(screen.getByText(/full pro dashboard/i)).toBeInTheDocument();
    expect(screen.queryByText(/subscription required/i)).not.toBeInTheDocument();
  });

  it("rejects forged Pro localStorage without a bearer token when backend auth is enabled", async () => {
    vi.stubEnv("VITE_ENABLE_BACKEND_AUTH", "true");
    vi.resetModules();

    const { AuthProvider: FreshAuthProvider } = await import("@/lib/authContext");
    const { AppPreferencesProvider: FreshPrefs } = await import("@/lib/appPreferences");
    const { ProtectedRoute: FreshProtectedRoute } = await import("@/components/ProtectedRoute");

    installLocalStorage({
      email: "forged@example.com",
      name: "Forged Pro",
      plan: "pro",
      subscriptionStatus: "active",
      avatarInitials: "FP",
    });

    render(
      <FreshPrefs>
        <FreshAuthProvider>
          <MemoryRouter initialEntries={["/pro"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/sign-in" element={<div>Sign in page</div>} />
              <Route path="/pro-preview" element={<div>Preview page</div>} />
              <Route
                path="/pro"
                element={(
                  <FreshProtectedRoute>
                    <div>Full Pro Dashboard</div>
                  </FreshProtectedRoute>
                )}
              />
            </Routes>
          </MemoryRouter>
        </FreshAuthProvider>
      </FreshPrefs>,
    );

    expect(screen.getByText(/subscription required/i)).toBeInTheDocument();
    expect(screen.queryByText(/full pro dashboard/i)).not.toBeInTheDocument();

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("allows Pro access when backend auth is enabled and a bearer token is present", async () => {
    vi.stubEnv("VITE_ENABLE_BACKEND_AUTH", "true");
    vi.resetModules();

    const { AuthProvider: FreshAuthProvider } = await import("@/lib/authContext");
    const { AppPreferencesProvider: FreshPrefs } = await import("@/lib/appPreferences");
    const { ProtectedRoute: FreshProtectedRoute } = await import("@/components/ProtectedRoute");

    installLocalStorage(
      {
        email: "owner@motormila.lk",
        name: "Motormila Owner",
        plan: "enterprise",
        subscriptionStatus: "active",
        avatarInitials: "AO",
      },
      "test-bearer-token",
    );

    render(
      <FreshPrefs>
        <FreshAuthProvider>
          <MemoryRouter initialEntries={["/pro"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/sign-in" element={<div>Sign in page</div>} />
              <Route path="/pro-preview" element={<div>Preview page</div>} />
              <Route
                path="/pro"
                element={(
                  <FreshProtectedRoute>
                    <div>Full Pro Dashboard</div>
                  </FreshProtectedRoute>
                )}
              />
            </Routes>
          </MemoryRouter>
        </FreshAuthProvider>
      </FreshPrefs>,
    );

    expect(screen.getByText(/full pro dashboard/i)).toBeInTheDocument();
    expect(screen.queryByText(/subscription required/i)).not.toBeInTheDocument();

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
