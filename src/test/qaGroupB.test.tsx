import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppPreferencesProvider } from "@/lib/appPreferences";
import { AuthProvider } from "@/lib/authContext";
import { authErrorText } from "@/lib/authErrorText";
import { friendlyApiError } from "@/lib/apiErrorText";
import { MoneyApiError, getPayhereOrder } from "@/lib/moneyApi";
import { leadCopy } from "@/lib/leadConsent";
import CheckoutReturn from "@/pages/CheckoutReturn";
import SignUp from "@/pages/SignUp";
import { RouteMeta } from "@/components/RouteMeta";
import { API_BASE, resolveFetchCredentials } from "@/services/api";

const future = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("auth error copy", () => {
  it("maps codes to friendly sentences instead of raw API text", () => {
    expect(authErrorText({ code: "unavailable", error: "Database temporarily unavailable." }, "Login failed")).toMatch(/temporarily unavailable/i);
    expect(authErrorText({ code: "unavailable" }, "x")).not.toMatch(/database/i);
    expect(authErrorText({ code: "invalid" }, "x")).toBe("Invalid email or password.");
    expect(authErrorText({ code: "network" }, "x")).toMatch(/couldn't reach/i);
    expect(authErrorText({ error: "Email already registered." }, "x")).toBe("Email already registered.");
    expect(authErrorText({}, "Sign-up failed")).toBe("Sign-up failed");
  });

  it("uses the translator when one is given", () => {
    const t = (key: string, fallback?: string) => (key === "auth.error.unavailable" ? "SI-unavailable" : fallback ?? key);
    expect(authErrorText({ code: "unavailable" }, "x", t)).toBe("SI-unavailable");
  });
});

describe("money API client", () => {
  it("sends cookies only same-origin (CORS has no Allow-Credentials) and keeps the HTTP status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ detail: "Database temporarily unavailable." }, 503));
    vi.stubGlobal("fetch", fetchMock);
    const err = await getPayhereOrder("MM-1").catch((e) => e);
    expect(err).toBeInstanceOf(MoneyApiError);
    expect(err.status).toBe(503);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    // Same rule as every other API call: cookies only when the API is same-origin
    // (the test env uses /api/v1, so "include"); cross-origin resolves to "omit".
    expect(init.credentials).toBe(resolveFetchCredentials(API_BASE));
    expect(resolveFetchCredentials("https://example.hf.space/api/v1")).toBe("omit");
    // 5xx becomes the translated "servers are busy" line, never the raw detail.
    expect(friendlyApiError(err, "fallback")).toMatch(/busy/i);
  });

  it("keeps a 4xx detail the user can act on", () => {
    expect(friendlyApiError(new MoneyApiError("Please check the highlighted fields.", 422), "fallback")).toBe("Please check the highlighted fields.");
  });
});

describe("CheckoutReturn", () => {
  it("stops the confirming spinner and offers a retry when the order lookup fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "db down" }, 503)));
    render(
      <AppPreferencesProvider>
        <MemoryRouter initialEntries={["/checkout/return?order_id=MM-42"]} future={future}>
          <Routes>
            <Route path="/checkout/return" element={<CheckoutReturn />} />
          </Routes>
        </MemoryRouter>
      </AppPreferencesProvider>,
    );
    expect(await screen.findByRole("button", { name: /check again/i })).toBeInTheDocument();
    expect(screen.queryByText(/confirming your payment/i)).not.toBeInTheDocument();
    // A failed lookup is not a failed payment.
    expect(screen.queryByText(/payment not completed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/db down/i)).not.toBeInTheDocument();
  });

  it("shows a neutral state with no order id", () => {
    render(
      <AppPreferencesProvider>
        <MemoryRouter initialEntries={["/checkout/return"]} future={future}>
          <CheckoutReturn />
        </MemoryRouter>
      </AppPreferencesProvider>,
    );
    expect(screen.getAllByText(/no payment to confirm/i).length).toBeGreaterThan(0);
  });
});

describe("SignUp invite lookup", () => {
  it("says the invite couldn't be verified (not 'not found') when the API is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Database temporarily unavailable.", code: "db_unavailable" }, 503)));
    render(
      <AppPreferencesProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={["/sign-up?token=abcdefghijklmnopqrstuvwx"]} future={future}>
            <Routes>
              <Route path="/sign-up" element={<SignUp />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </AppPreferencesProvider>,
    );
    expect(await screen.findByText(/could not verify invite/i)).toBeInTheDocument();
    expect(screen.queryByText(/invite not found/i)).not.toBeInTheDocument();
  });
});

describe("lead copy", () => {
  it("translates the visible lead copy", () => {
    const t = (key: string, fallback?: string) => (key.startsWith("tools.lead.copy.finance") ? `T:${key}` : fallback ?? key);
    expect(leadCopy("finance", t).title).toBe("T:tools.lead.copy.finance.title");
    expect(leadCopy("insurance", (_k, f) => f ?? "").cta).toBe("Request insurance quote");
  });
});

describe("RouteMeta", () => {
  it.each([
    ["/cookies", "Cookie Notice"],
    ["/removal", "Request Data Removal"],
    ["/delete-account", "Delete Your Account"],
    ["/finance", "Vehicle Finance"],
    ["/inspection", "Vehicle Inspection"],
    ["/insurance", "Vehicle Insurance"],
    ["/safe-transfer", "Safe Vehicle Transfer Kit"],
    ["/checkout/return", "Checkout"],
  ])("gives %s its own title", async (path, title) => {
    render(
      <AppPreferencesProvider>
        <MemoryRouter initialEntries={[path]} future={future}>
          <RouteMeta />
        </MemoryRouter>
      </AppPreferencesProvider>,
    );
    await waitFor(() => expect(document.title).toMatch(new RegExp(`^${title} — `)));
    const robots = document.head.querySelector('meta[name="robots"]')?.getAttribute("content");
    const noindex = ["/cookies", "/removal", "/delete-account", "/checkout/return"].includes(path);
    expect(robots).toBe(noindex ? "noindex, nofollow" : "index, follow");
  });
});
