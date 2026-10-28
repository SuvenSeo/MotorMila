/**
 * Session bookkeeping for the Motormila admin console (`/motormila/admin`).
 *
 * The only way in is backend auth (`VITE_ENABLE_BACKEND_AUTH=true`): the
 * entered credentials are exchanged for a real session at `POST /auth/login`,
 * and the console only unlocks when the server reports `role: "admin"`. Every
 * admin API call carries that admin's bearer token and is enforced server-side
 * by `require_admin_access`, so the server — not this file — is the gate.
 *
 * There is deliberately NO client-side credential check: anything compiled
 * into the bundle (a password digest, demo accounts) is public. Builds without
 * backend auth cannot open the console.
 *
 * Signed-in admins (including platform owners, whom the server elevates via
 * OWNER_EMAILS) skip the form: the live session from `/auth/me` unlocks it.
 * A console session expires on its own after a short TTL.
 */

export const ADMIN_SESSION_KEY = "motormila.admin_session";

/** A console session is short-lived on purpose; re-auth is one password entry. */
const SESSION_TTL_MS = 45 * 60 * 1000;
const DEFAULT_SESSION_LABEL = "admin";

export interface AdminSession {
  username: string;
  unlockedAt: number;
  expiresAt: number;
}

export function readAdminSession(): AdminSession | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    const expiresAt = Number(parsed?.expiresAt) || 0;
    if (!expiresAt || expiresAt <= Date.now()) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }
    return {
      username: String(parsed?.username || DEFAULT_SESSION_LABEL),
      unlockedAt: Number(parsed?.unlockedAt) || Date.now(),
      expiresAt,
    };
  } catch {
    return null;
  }
}

export function writeAdminSession(username: string): AdminSession {
  const session: AdminSession = {
    username: username.trim() || DEFAULT_SESSION_LABEL,
    unlockedAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  try {
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage failures — the caller can still hold the session in state.
  }
  return session;
}

export function clearAdminSession(): void {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // nothing to clear
  }
}

/** Minutes left on an active console session, for the ongoing-session chip. */
export function adminSessionMinutesLeft(session: AdminSession | null): number {
  if (!session) return 0;
  return Math.max(0, Math.round((session.expiresAt - Date.now()) / 60_000));
}

/**
 * True when the signed-in session itself proves admin rights, so the console
 * can open without the password gate. Only trusted with backend auth on: the
 * role then comes from the server (`/auth/me`), not forgeable local state, and
 * every admin API call is still enforced server-side.
 */
export function shouldAutoUnlockAdminConsole(input: {
  backendAuthEnabled: boolean;
  authReady: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
}): boolean {
  return Boolean(input.backendAuthEnabled && input.authReady && input.isAuthenticated && input.isAdmin);
}
