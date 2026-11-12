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

  it("ignores legacy VITE_DEMO_USERS: no client-side credentials can sign anyone in", async () => {
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
        },
      ]),
    );
    vi.resetModules();

    const authModule = await import("@/lib/authContext");
    const { AppPreferencesProvider: FreshPrefs } = await import("@/lib/appPreferences");
    const FreshSignIn = (await import("@/pages/SignIn")).default;
    expect(Object.keys(authModule)).not.toContain("DEMO_ACCOUNT_SUMMARY");

    render(
      <FreshPrefs>
        <authModule.AuthProvider>
          <MemoryRouter initialEntries={["/sign-in"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/sign-in" element={<FreshSignIn />} />
              <Route path="/pro" element={<div>Full Pro Workspace</div>} />
            </Routes>
          </MemoryRouter>
        </authModule.AuthProvider>
      </FreshPrefs>,
    );

    expect(screen.queryByText(/review accounts/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "reviewer@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "review-only-secret" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not configured/i);
    expect(screen.queryByText(/full pro workspace/i)).not.toBeInTheDocument();
    expect(localStorage.getItem("motormila.auth_user")).toBeNull();

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("links to the self-serve password reset page", () => {
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
    expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute("href", "/forgot-password");
  });

  it("sanitizes open-redirect candidates to a same-origin relative path", () => {
    expect(sanitizeSignInRedirect("/pro")).toBe("/pro");
    expect(sanitizeSignInRedirect("/dealer?tab=ops")).toBe("/dealer?tab=ops");
    expect(sanitizeSignInRedirect("//evil.example/phish")).toBe("/pro");
    expect(sanitizeSignInRedirect("https://evil.example/phish")).toBe("/pro");
    expect(sanitizeSignInRedirect("evil.example")).toBe("/pro");
    expect(sanitizeSignInRedirect(undefined)).toBe("/pro");
  });

  it("ignores forged absolute from state and lands on /pro after backend login", async () => {
    vi.stubEnv("VITE_ENABLE_BACKEND_AUTH", "true");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/auth/login")) {
          return new Response(
            JSON.stringify({
              token: "tok",
              user: { email: "reviewer@example.com", name: "Env Reviewer", plan: "enterprise", subscriptionStatus: "active" },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ detail: "Invalid or expired token." }), { status: 401 });
      }),
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

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("offers to resend the verification email when the account is unverified", async () => {
    vi.stubEnv("VITE_ENABLE_BACKEND_AUTH", "true");
    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/login")) {
        return new Response(
          JSON.stringify({ detail: { code: "email_unverified", message: "Verify your email address before signing in." } }),
          { status: 403 },
        );
      }
      if (url.includes("/auth/resend-verification")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ detail: "Invalid or expired token." }), { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();

    const { AuthProvider: FreshAuthProvider } = await import("@/lib/authContext");
    const { AppPreferencesProvider: FreshPrefs } = await import("@/lib/appPreferences");
    const FreshSignIn = (await import("@/pages/SignIn")).default;

    render(
      <FreshPrefs>
        <FreshAuthProvider>
          <MemoryRouter initialEntries={["/sign-in"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/sign-in" element={<FreshSignIn />} />
            </Routes>
          </MemoryRouter>
        </FreshAuthProvider>
      </FreshPrefs>,
    );

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "Trial@Example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "a-long-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in/i }));

    expect(await screen.findByText(/verify your email address before signing in/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /resend verification email/i }));
    expect(await screen.findByText(/new link sent/i)).toBeInTheDocument();

    const resendCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/auth/resend-verification"));
    expect(resendCall).toBeDefined();
    expect(JSON.parse(String((resendCall![1] as RequestInit).body))).toEqual({ email: "trial@example.com" });
    expect(localStorage.getItem("motormila.auth_user")).toBeNull();

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
