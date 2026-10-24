import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { API_BASE, resolveFetchCredentials } from "@/services/api";
import { getStoredAuthToken, storeAuthToken } from "@/lib/authToken";

export interface AuthUser {
  email: string;
  name: string;
  plan: "free" | "pro" | "enterprise" | "dealer";
  subscriptionStatus: "none" | "trialing" | "active" | "past_due";
  role: "user" | "admin";
  avatarInitials: string;
  trialEndsAt?: string | null;
  trialDaysLeft?: number | null;
}

/**
 * Why an auth call failed, so pages can show translated copy (i18n key
 * `auth.error.<code>`) instead of raw backend text such as
 * "Database temporarily unavailable" while the API is degraded.
 */
export type AuthErrorCode = "invalid" | "unavailable" | "network" | "rate_limited";
export type AuthResult = { success: boolean; error?: string; code?: AuthErrorCode };

export class AuthError extends Error {
  code?: AuthErrorCode;
  constructor(message: string, code?: AuthErrorCode) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

const AUTH_MESSAGES: Record<AuthErrorCode, string> = {
  invalid: "Invalid email or password.",
  unavailable: "Sign-in is temporarily unavailable. Please try again in a few minutes.",
  network: "We couldn't reach Motormila. Check your connection and try again.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
};

/** POST JSON to an auth endpoint; network failures become AuthError("network"). */
async function authPost(path: string, body: unknown): Promise<Response> {
  try {
    return await fetch(new URL(`${API_BASE}${path}`, window.location.origin).toString(), {
      method: "POST",
      // Cross-origin HF Spaces: omit cookies — preflight lacks Allow-Credentials.
      credentials: resolveFetchCredentials(API_BASE),
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError(AUTH_MESSAGES.network, "network");
  }
}

/** Turn a failed auth response into an AuthError (5xx/429 get a code; 4xx keep the API's detail). */
async function authFailure(response: Response, fallback: string): Promise<AuthError> {
  if (response.status >= 500) return new AuthError(AUTH_MESSAGES.unavailable, "unavailable");
  if (response.status === 429) return new AuthError(AUTH_MESSAGES.rate_limited, "rate_limited");
  let detail = fallback;
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") detail = body.detail;
  } catch {
    // keep fallback
  }
  return new AuthError(detail);
}

function toAuthResult(error: unknown, fallback: string): AuthResult {
  if (error instanceof AuthError) return { success: false, error: error.message, code: error.code };
  return { success: false, error: error instanceof Error ? error.message : fallback };
}

interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthResult>;
  signup: (input: { token: string; name: string; password: string }) => Promise<AuthResult>;
  selfSignup: (input: { email: string; name: string; password: string }) => Promise<AuthResult>;
  logout: () => void;
  isAuthenticated: boolean;
  hasProAccess: boolean;
  isAdmin: boolean;
  authReady: boolean;
  previewAccessEnabled: boolean;
}

const STORAGE_KEY = "motormila.auth_user";
const DEMO_USERS_ENV = "VITE_DEMO_USERS";
/**
 * When true the API is the source of truth for identity (login, session
 * restore, Pro gates). When false the app runs in preview mode and the Pro
 * workspace is readable without a session.
 */
export const BACKEND_AUTH_ENABLED = import.meta.env.VITE_ENABLE_BACKEND_AUTH === "true";

/**
 * When true, Pro export actions require an authenticated Pro/Enterprise session.
 * Enabled explicitly via VITE_PRO_ACCESS_ENFORCED=true, or automatically in
 * production builds (import.meta.env.PROD), matching the backend PRO_ACCESS_ENFORCED flag.
 */
export const PRO_EXPORTS_ENFORCED: boolean =
  import.meta.env.VITE_PRO_ACCESS_ENFORCED === "true" || import.meta.env.PROD === true;

type DemoAccountRecord = AuthUser & { password: string };
type LoginResponse = { user?: Partial<AuthUser> & { trialEndsAt?: string | null; trialDaysLeft?: number | null }; token?: string };

// No accounts are ever baked into the shipped bundle. Demo/review accounts
// exist only when a build explicitly opts in via VITE_ENABLE_DEMO_AUTH=true
// and provides them through VITE_DEMO_USERS.
function normalizePlan(value: unknown): AuthUser["plan"] {
  const plan = String(value || "").trim().toLowerCase();
  if (plan === "free" || plan === "pro" || plan === "enterprise" || plan === "dealer") {
    return plan;
  }
  return "free";
}

function parseDemoUsers(): Record<string, DemoAccountRecord> {
  const users: Record<string, DemoAccountRecord> = {};

  if (import.meta.env.VITE_ENABLE_DEMO_AUTH !== "true") return users;

  const raw = String(import.meta.env[DEMO_USERS_ENV] || "").trim();
  if (!raw) return users;

  try {
    const parsed = JSON.parse(raw) as DemoAccountRecord[];
    if (!Array.isArray(parsed)) return users;

    return parsed.reduce<Record<string, DemoAccountRecord>>((acc, item) => {
      const email = String(item?.email || "").trim().toLowerCase();
      const password = String(item?.password || "");
      const plan = normalizePlan(item?.plan);
      // Demo JSON must set an explicit allowed plan; skip junk rows.
      if (!email || !password || !item?.name) return acc;
      if (!["free", "pro", "enterprise", "dealer"].includes(String(item?.plan || "").toLowerCase())) {
        return acc;
      }

      acc[email] = {
        email,
        password,
        name: String(item.name),
        plan,
        role: item?.role === "admin" ? "admin" : "user",
        subscriptionStatus:
          item.subscriptionStatus === "active" || item.subscriptionStatus === "trialing" || item.subscriptionStatus === "past_due"
            ? item.subscriptionStatus
            : plan === "free"
              ? "none"
              : "active",
        avatarInitials: String(item.avatarInitials || email.slice(0, 2)).slice(0, 3).toUpperCase(),
      };
      return acc;
    }, users);
  } catch {
    return users;
  }
}

const DEMO_USERS = parseDemoUsers();
export const DEMO_AUTH_ENABLED = Object.keys(DEMO_USERS).length > 0;
const PREVIEW_AUTH_ENABLED = !BACKEND_AUTH_ENABLED;
// Passwords are intentionally NOT exported: the sign-in page may list which
// review accounts exist, but secrets never leave this module.
export const DEMO_ACCOUNT_SUMMARY = Object.values(DEMO_USERS).map(({ email, name, plan, subscriptionStatus, role, avatarInitials }) => ({
  email,
  name,
  plan,
  subscriptionStatus,
  role,
  avatarInitials,
}));

const AuthContext = createContext<AuthContextType | null>(null);

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    return normalizeServerUser(parsed, parsed?.email || "");
  } catch {
    return null;
  }
}

/**
 * Read the session that `login`/`signup` stored, without waiting for a context
 * re-render. Used by the admin gate to verify the `role` of the account it just
 * authenticated.
 */
export function readStoredAuthUser(): AuthUser | null {
  return loadUser();
}

function normalizeServerUser(raw: Partial<AuthUser> | undefined, email: string): AuthUser | null {
  if (!raw?.email && !email) return null;
  const normalizedEmail = String(raw?.email || email).trim().toLowerCase();
  const name = String(raw?.name || normalizedEmail.split("@")[0] || "Motormila User").trim();
  const plan = normalizePlan(raw?.plan);
  const subscriptionStatus =
    raw?.subscriptionStatus === "active" || raw?.subscriptionStatus === "trialing" || raw?.subscriptionStatus === "past_due"
      ? raw.subscriptionStatus
      : plan === "free"
        ? "none"
        : "active";
  // Trial plumbing (B2-A): prefer embedded trialEndsAt/trialDaysLeft so the
  // shell banner needs no extra fetch; supports snake_case legacy rows.
  const rawRecord = (raw ?? {}) as Record<string, unknown>;
  const trialEndsAt =
    typeof rawRecord.trialEndsAt === "string" && rawRecord.trialEndsAt
      ? (rawRecord.trialEndsAt as string)
      : typeof rawRecord.trial_ends_at === "string" && rawRecord.trial_ends_at
        ? (rawRecord.trial_ends_at as string)
        : null;
  const trialDaysLeft =
    typeof rawRecord.trialDaysLeft === "number" && Number.isFinite(rawRecord.trialDaysLeft)
      ? (rawRecord.trialDaysLeft as number)
      : null;

  return {
    email: normalizedEmail,
    name,
    plan,
    subscriptionStatus,
    role: raw?.role === "admin" ? "admin" : "user",
    avatarInitials: String(raw?.avatarInitials || name.split(/\s+/).map((part) => part[0]).join("") || "AU")
      .slice(0, 3)
      .toUpperCase(),
    trialEndsAt,
    trialDaysLeft,
  };
}

async function loginWithBackend(email: string, password: string): Promise<AuthUser | null> {
  if (!BACKEND_AUTH_ENABLED) return null;

  const response = await authPost("/auth/login", { email, password });

  if (!response.ok) {
    if (response.status === 401) throw new AuthError(AUTH_MESSAGES.invalid, "invalid");
    if (response.status === 429) throw new AuthError(AUTH_MESSAGES.rate_limited, "rate_limited");
    throw new AuthError(AUTH_MESSAGES.unavailable, "unavailable");
  }

  const data = (await response.json().catch(() => ({}))) as LoginResponse;
  // Bearer remains for CSRF-safe Pro writes; HttpOnly cookie is also set by the API.
  storeAuthToken(data.token || null);
  return normalizeServerUser(data.user, email);
}

async function selfSignupWithBackend(input: {
  email: string;
  name: string;
  password: string;
}): Promise<AuthUser | null> {
  if (!BACKEND_AUTH_ENABLED) {
    throw new Error("Backend auth is required for self-serve signup.");
  }

  const response = await authPost("/auth/self-signup", input);

  if (!response.ok) throw await authFailure(response, "Self-serve signup failed.");

  const data = (await response.json().catch(() => ({}))) as LoginResponse;
  storeAuthToken(data.token || null);
  return normalizeServerUser(data.user, data.user?.email || input.email);
}

async function signupWithBackend(input: {
  token: string;
  name: string;
  password: string;
}): Promise<AuthUser | null> {
  if (!BACKEND_AUTH_ENABLED) {
    throw new Error("Backend auth is required to accept invites.");
  }

  const response = await authPost("/auth/signup", input);

  if (!response.ok) throw await authFailure(response, "Invite signup failed.");

  const data = (await response.json().catch(() => ({}))) as LoginResponse;
  storeAuthToken(data.token || null);
  return normalizeServerUser(data.user, data.user?.email || "");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadUser);
  const [authReady, setAuthReady] = useState(!BACKEND_AUTH_ENABLED);
  // Plan/status from localStorage alone is forgeable. When backend auth is on,
  // Pro routes also require a bearer token issued by /auth/login.
  const planAllowsPro = Boolean(
    user &&
      (user.plan === "pro" || user.plan === "enterprise" || user.plan === "dealer") &&
      (user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing"),
  );
  const hasProAccess = BACKEND_AUTH_ENABLED
    ? planAllowsPro && Boolean(getStoredAuthToken())
    : planAllowsPro;
  const isAdmin = Boolean(user?.role === "admin");

  useEffect(() => {
    if (!BACKEND_AUTH_ENABLED) {
      setAuthReady(true);
      return;
    }

    // No bearer token and a cross-origin API that never receives our cookies:
    // /auth/me can only answer 401 (console noise on every signed-out page
    // view). Skip the round trip and drop any stale token-less local user,
    // exactly as the 401 branch below would.
    if (!getStoredAuthToken() && resolveFetchCredentials(API_BASE) === "omit") {
      if (localStorage.getItem(STORAGE_KEY)) {
        setUser(null);
        localStorage.removeItem(STORAGE_KEY);
      }
      setAuthReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const headers: Record<string, string> = { Accept: "application/json" };
        const token = getStoredAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        const credentials = resolveFetchCredentials(API_BASE);

        const response = await fetch(new URL(`${API_BASE}/auth/me`, window.location.origin).toString(), {
          credentials,
          headers,
        });
        if (cancelled) return;

        if (!response.ok) {
          // Cookie/Bearer expired — clear forgeable local session so Pro gates stay honest.
          if (response.status === 401) {
            setUser(null);
            localStorage.removeItem(STORAGE_KEY);
            storeAuthToken(null);
          }
          return;
        }

        const data = (await response.json().catch(() => ({}))) as Partial<AuthUser>;
        const restored = normalizeServerUser(data, data.email || "");
        if (!restored) return;
        setUser(restored);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
      } catch {
        // Soft-fail: keep local session for offline / cold-start flakiness.
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.toLowerCase().trim();

    try {
      const serverUser = await loginWithBackend(normalizedEmail, password);
      if (serverUser) {
        setUser(serverUser);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serverUser));
        setAuthReady(true);
        return { success: true };
      }
    } catch (error) {
      return toAuthResult(error, "Authentication failed.");
    }

    const record = DEMO_USERS[normalizedEmail];
    if (!record || record.password !== password) {
      if (DEMO_AUTH_ENABLED) return { success: false, error: AUTH_MESSAGES.invalid, code: "invalid" as const };
      return { success: false, error: "Pro sign-in is not configured for this build." };
    }

    const demoUser = normalizeServerUser(record, normalizedEmail);
    if (!demoUser) return { success: false, error: "Demo account is misconfigured." };

    setUser(demoUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(demoUser));
    setAuthReady(true);
    return { success: true };
  }, []);

  const signup = useCallback(async (input: { token: string; name: string; password: string }) => {
    try {
      const serverUser = await signupWithBackend(input);
      if (!serverUser) return { success: false, error: "Sign-up failed." };
      setUser(serverUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serverUser));
      setAuthReady(true);
      return { success: true };
    } catch (error) {
      return toAuthResult(error, "Sign-up failed.");
    }
  }, []);

  const selfSignup = useCallback(async (input: { email: string; name: string; password: string }) => {
    try {
      const serverUser = await selfSignupWithBackend(input);
      if (!serverUser) return { success: false, error: "Sign-up failed." };
      setUser(serverUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serverUser));
      setAuthReady(true);
      return { success: true };
    } catch (error) {
      return toAuthResult(error, "Sign-up failed.");
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    storeAuthToken(null);
    if (BACKEND_AUTH_ENABLED) {
      void fetch(new URL(`${API_BASE}/auth/logout`, window.location.origin).toString(), {
        method: "POST",
        credentials: resolveFetchCredentials(API_BASE),
        headers: { Accept: "application/json" },
      }).catch(() => {
        // Cookie clear is best-effort — local state is already wiped.
      });
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        signup,
        selfSignup,
        logout,
        isAuthenticated: user !== null,
        hasProAccess,
        isAdmin,
        authReady,
        previewAccessEnabled: PREVIEW_AUTH_ENABLED,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
