import { StrictMode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppPreferencesProvider } from "@/lib/appPreferences";
import VerifyEmail from "@/pages/VerifyEmail";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";

const future = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderAt(path: string, route: string, element: JSX.Element) {
  return render(
    <StrictMode>
      <AppPreferencesProvider>
        <MemoryRouter initialEntries={[path]} future={future}>
          <Routes>
            <Route path={route} element={element} />
          </Routes>
        </MemoryRouter>
      </AppPreferencesProvider>
    </StrictMode>,
  );
}

function bodyOf(call: unknown[]) {
  return JSON.parse(String((call[1] as RequestInit).body));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VerifyEmail page", () => {
  it("redeems the token exactly once (even under StrictMode) and shows success", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ ok: true, email: "a@example.com" }));
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/verify-email?token=tok-once-0123456789abcdef", "/verify-email", <VerifyEmail />);

    expect(await screen.findByText(/email verified/i)).toBeInTheDocument();
    const calls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/auth/verify-email"));
    expect(calls).toHaveLength(1);
    expect(bodyOf(calls[0])).toEqual({ token: "tok-once-0123456789abcdef" });
  });

  it("explains an expired link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ detail: { code: "token_expired", message: "expired" } }, 400)),
    );
    renderAt("/verify-email?token=tok-expired-0123456789abcd", "/verify-email", <VerifyEmail />);
    expect(await screen.findByText(/has expired/i)).toBeInTheDocument();
  });

  it("does not call the API without a token", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/verify-email", "/verify-email", <VerifyEmail />);
    expect(screen.getByText(/link is incomplete/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ForgotPassword page", () => {
  it("submits the email and shows the same neutral confirmation for any address", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/forgot-password", "/forgot-password", <ForgotPassword />);

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: " User@Example.com " } });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText(/if an account matches that address/i)).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/auth/forgot-password");
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ email: "user@example.com" });
  });
});

describe("ResetPassword page", () => {
  it("validates locally, then posts token + password and confirms", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/reset-password?token=reset-tok-0123456789abcdef", "/reset-password", <ResetPassword />);

    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: "brand-new-pass-9" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "brand-new-pass-9" } });
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ token: "reset-tok-0123456789abcdef", password: "brand-new-pass-9" });
  });

  it("offers a new link when the token was already used", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ detail: { code: "invalid_token", message: "used" } }, 400)),
    );
    renderAt("/reset-password?token=reset-tok-0123456789abcdef", "/reset-password", <ResetPassword />);
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: "brand-new-pass-9" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "brand-new-pass-9" } });
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/invalid or has already been used/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /request a new link/i })).toHaveAttribute("href", "/forgot-password");
  });
});

describe("SignUp self-serve", () => {
  it("shows 'check your inbox' with a resend option instead of signing in", async () => {
    vi.stubEnv("VITE_ENABLE_BACKEND_AUTH", "true");
    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/self-signup/status")) return json({ enabled: true, trialDays: 7, plan: "pro" });
      if (url.includes("/auth/self-signup")) {
        return json({ ok: true, verificationRequired: true, email: "new@example.com" });
      }
      return json({ detail: "Invalid or expired token." }, 401);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();

    const { AuthProvider } = await import("@/lib/authContext");
    const { AppPreferencesProvider: FreshPrefs } = await import("@/lib/appPreferences");
    const SignUp = (await import("@/pages/SignUp")).default;

    render(
      <FreshPrefs>
        <AuthProvider>
          <MemoryRouter initialEntries={["/sign-up"]} future={future}>
            <Routes>
              <Route path="/sign-up" element={<SignUp />} />
              <Route path="/" element={<div>Home page</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </FreshPrefs>,
    );

    fireEvent.change(await screen.findByLabelText(/^email$/i), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "New User" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "a-long-password-1" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "a-long-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: /start .*trial/i }));

    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend verification email/i })).toBeInTheDocument();
    expect(screen.queryByText(/home page/i)).not.toBeInTheDocument();
    expect(localStorage.getItem("motormila.auth_user")).toBeNull();

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
