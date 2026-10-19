import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SignIn from "@/pages/SignIn";
import { sanitizeSignInRedirect } from "@/lib/signIn";
import { AuthProvider } from "@/lib/authContext";
import { AppPreferencesProvider } from "@/lib/appPreferences";

function installLocalStorage() {
  const store = new Map<string, string>();
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

describe("SignIn preview access", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it("shows the login form and locked preview entry without any baked-in credentials", () => {
    render(
      <AppPreferencesProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={["/sign-in"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/sign-in" element={<SignIn />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </AppPreferencesProvider>,
    );

    expect(screen.getByText(/preview the pro workspace/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /preview pro/i })).toBeInTheDocument();
    // Hardcoded review accounts must never ship in the bundle.
    expect(screen.queryByText(/review accounts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/owner@motormila\.lk/i)).not.toBeInTheDocument();
  });

  it("routes to the public preview without creating a Pro session", () => {
    render(
      <AppPreferencesProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={["/sign-in"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/pro-preview" element={<div>Pro preview teaser</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </AppPreferencesProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /preview pro/i }));

    expect(screen.getByText(/pro preview teaser/i)).toBeInTheDocument();
    expect(localStorage.getItem("motormila.auth_user")).toBeNull();
  });

  it("supports env-provisioned review accounts without exposing passwords in the summary", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO_AUTH", "true");
    vi.stubEnv(
      "VITE_DEMO_USERS",
      JSON.stringify([
        {
          email: "reviewer@example.com",
          password: "review-only-secret",
          name: "Env Reviewer",
          plan: "enterprise",
          subscriptionStatus: "active",
          avatarInitials: "ER",
        },
      ]),
    );
    vi.resetModules();

    const { AuthProvider: FreshAuthProvider, DEMO_ACCOUNT_SUMMARY } = await import("@/lib/authContext");
    const { AppPreferencesProvider: FreshPrefs } = await import("@/lib/appPreferences");
    const FreshSignIn = (await import("@/pages/SignIn")).default;

    expect(DEMO_ACCOUNT_SUMMARY).toHaveLength(1);
    expect(Object.keys(DEMO_ACCOUNT_SUMMARY[0])).not.toContain("password");

    render(
      <FreshPrefs>
        <FreshAuthProvider>
          <MemoryRouter initialEntries={["/sign-in"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/sign-in" element={<FreshSignIn />} />
              <Route path="/pro" element={<div>Full Pro Workspace</div>} />
            </Routes>
          </MemoryRouter>
        </FreshAuthProvider>
      </FreshPrefs>,
    );

    expect(screen.getByText(/review accounts/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Env Reviewer/i }));
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "review-only-secret" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in/i }));

    expect(await screen.findByText(/full pro workspace/i)).toBeInTheDocument();
    expect(localStorage.getItem("motormila.auth_user")).toContain("reviewer@example.com");

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("sanitizes open-redirect candidates to a same-origin relative path", () => {
    expect(sanitizeSignInRedirect("/pro")).toBe("/pro");
    expect(sanitizeSignInRedirect("/dealer?tab=ops")).toBe("/dealer?tab=ops");
    expect(sanitizeSignInRedirect("//evil.example/phish")).toBe("/pro");
    expect(sanitizeSignInRedirect("https://evil.example/phish")).toBe("/pro");
    expect(sanitizeSignInRedirect("evil.example")).toBe("/pro");
    expect(sanitizeSignInRedirect(undefined)).toBe("/pro");
  });

  it("ignores forged absolute from state and lands on /pro after demo login", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO_AUTH", "true");
    vi.stubEnv(
      "VITE_DEMO_USERS",
      JSON.stringify([
        {
          email: "reviewer@example.com",
          password: "review-only-secret",
          name: "Env Reviewer",
          plan: "enterprise",
          subscriptionStatus: "active",
          avatarInitials: "ER",
        },
      ]),
    );
    vi.resetModules();

    const { AuthProvider: FreshAuthProvider } = await import("@/lib/authContext");
    const { AppPreferencesProvider: FreshPrefs } = await import("@/lib/appPreferences");
    const FreshSignIn = (await import("@/pages/SignIn")).default;

    render(
      <FreshPrefs>
        <FreshAuthProvider>
          <MemoryRouter
            initialEntries={[{ pathname: "/sign-in", state: { from: { pathname: "//evil.example/phish" } } }]}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route path="/sign-in" element={<FreshSignIn />} />
              <Route path="/pro" element={<div>Safe Pro Landing</div>} />
              <Route path="*" element={<div>Unexpected redirect</div>} />
            </Routes>
          </MemoryRouter>
        </FreshAuthProvider>
      </FreshPrefs>,
    );

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "reviewer@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "review-only-secret" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in/i }));

    expect(await screen.findByText(/safe pro landing/i)).toBeInTheDocument();
    expect(screen.queryByText(/unexpected redirect/i)).not.toBeInTheDocument();

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
