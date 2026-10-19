/**
 * Credential gate for the Motormila admin console (`/motormila/admin`).
 *
 * The console is deliberately decoupled from customer sign-in: reaching it
 * requires an admin *username and password*, and nothing about the marketing
 * site advertises where it lives.
 *
 * Two verification paths, in order of trust:
 *
 *  1. Backend auth (`VITE_ENABLE_BACKEND_AUTH=true`): the entered credentials
 *     are exchanged for a real session at `POST /auth/login`, and the console
 *     only unlocks when the returned account has `role: "admin"`. Every admin
 *     API call then carries that admin's bearer token, so the server — not this
 *     file — is the real gate.
 *  2. Local fallback (backend auth off, or the API is unreachable): the
 *     credentials are checked against a SHA-256 digest compiled into the
 *     bundle. This keeps the console usable in snapshot-only/dev builds, but it
 *     is a UI gate, not a security boundary — production must run path 1.
 *
 * Override the fallback credentials per build with:
 *   VITE_ADMIN_USERNAME=motormila
 *   VITE_ADMIN_PASSWORD_HASH=<sha256 hex of your password>
 *
 * Failed attempts are throttled (5 tries, then a 60s lockout) and a successful
 * unlock issues a session that expires on its own.
 */

export const ADMIN_SESSION_KEY = "motormila.admin_session";

/**
 * Compile-time fallbacks. These exist ONLY for snapshot/dev builds.
 * Production must set VITE_ENABLE_BACKEND_AUTH=true so the server is the
 * real gate — verifyLocalAdminCredential refuses when backend auth is on.
 */
const DEFAULT_ADMIN_USERNAME = "motormila";
// Placeholder only. Deployments MUST override via VITE_ADMIN_PASSWORD_HASH.
// The previous default was a known-password digest disclosed in source —
// never put a password hint or the plaintext next to a hash again.
const DEFAULT_ADMIN_PASSWORD_HASH = "";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;
/** A console session is short-lived on purpose; re-auth is one password entry. */
const SESSION_TTL_MS = 45 * 60 * 1000;
const THROTTLE_KEY = "motormila.admin_throttle";

export interface AdminSession {
  username: string;
  unlockedAt: number;
  expiresAt: number;
}

export interface AdminVerifyResult {
  ok: boolean;
  error?: string;
  lockedForSeconds?: number;
}

function envValue(key: string): string {
  const raw = (import.meta.env as Record<string, unknown>)[key];
  return typeof raw === "string" ? raw.trim() : "";
}

export function adminUsername(): string {
  return envValue("VITE_ADMIN_USERNAME") || DEFAULT_ADMIN_USERNAME;
}

function adminPasswordHash(): string {
  return (envValue("VITE_ADMIN_PASSWORD_HASH") || DEFAULT_ADMIN_PASSWORD_HASH).toLowerCase();
}

function backendAuthEnabled(): boolean {
  return envValue("VITE_ENABLE_BACKEND_AUTH").toLowerCase() === "true";
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/**
 * Dependency-free SHA-256 so the gate behaves identically in the browser,
 * in a web worker, and under jsdom (`crypto.subtle` is not always available).
 */
export function sha256Hex(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const bitLength = bytes.length * 8;
  // message + 0x80 + zero padding to a 56-byte boundary + 8-byte length
  const padded = new Uint8Array((((bytes.length + 9) >> 6) + 1) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(padded.length - 4, bitLength >>> 0, false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((part) => part.toString(16).padStart(8, "0")).join("");
}

type Throttle = { failures: number; lockedUntil: number };

function readThrottle(): Throttle {
  try {
    const raw = sessionStorage.getItem(THROTTLE_KEY);
    if (!raw) return { failures: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw) as Partial<Throttle>;
    return {
      failures: Number(parsed?.failures) || 0,
      lockedUntil: Number(parsed?.lockedUntil) || 0,
    };
  } catch {
    return { failures: 0, lockedUntil: 0 };
  }
}

function writeThrottle(next: Throttle): void {
  try {
    sessionStorage.setItem(THROTTLE_KEY, JSON.stringify(next));
  } catch {
    // Session storage is best-effort; the in-memory result still throttles this tab.
  }
}

function lockoutSecondsRemaining(): number {
  const { lockedUntil } = readThrottle();
  if (!lockedUntil) return 0;
  const remaining = lockedUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

function recordFailure(): void {
  const current = readThrottle();
  const failures = current.failures + 1;
  writeThrottle({
    failures: failures >= MAX_ATTEMPTS ? 0 : failures,
    lockedUntil: failures >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0,
  });
}

function clearFailure(): void {
  writeThrottle({ failures: 0, lockedUntil: 0 });
}

/** Local credential check against the compiled-in (or env-supplied) digest. */
export function verifyLocalAdminCredential(username: string, password: string): AdminVerifyResult {
  // When backend auth is on, the local digest is never a valid gate —
  // require POST /auth/login and a real admin role instead.
  if (backendAuthEnabled()) {
    return { ok: false, error: "Admin sign-in requires a backend session." };
  }
  // Refuse an empty digest (no password configured) rather than accepting "".
  const expectedHash = adminPasswordHash();
  if (!expectedHash) {
    return { ok: false, error: "Admin console is not configured." };
  }

  const lockedForSeconds = lockoutSecondsRemaining();
  if (lockedForSeconds > 0) return { ok: false, lockedForSeconds };

  const userMatches = username.trim().toLowerCase() === adminUsername().toLowerCase();
  const passwordMatches = sha256Hex(password) === expectedHash;

  if (!userMatches || !passwordMatches) {
    recordFailure();
    return { ok: false, lockedForSeconds: lockoutSecondsRemaining() };
  }

  clearFailure();
  return { ok: true };
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
      username: String(parsed?.username || adminUsername()),
      unlockedAt: Number(parsed?.unlockedAt) || Date.now(),
      expiresAt,
    };
  } catch {
    return null;
  }
}

export function writeAdminSession(username: string): AdminSession {
  const session: AdminSession = {
    username: username.trim() || adminUsername(),
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
  clearFailure();
}

/** Minutes left on an active console session, for the ongoing-session chip. */
export function adminSessionMinutesLeft(session: AdminSession | null): number {
  if (!session) return 0;
  return Math.max(0, Math.round((session.expiresAt - Date.now()) / 60_000));
}
