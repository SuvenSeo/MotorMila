import { describe, expect, it } from "vitest";
import { shouldAutoUnlockAdminConsole } from "@/lib/adminAuth";

const base = { backendAuthEnabled: true, authReady: true, isAuthenticated: true, isAdmin: true };

describe("shouldAutoUnlockAdminConsole", () => {
  it("unlocks for a server-verified admin session", () => {
    expect(shouldAutoUnlockAdminConsole(base)).toBe(true);
  });

  it("stays locked for a signed-in non-admin", () => {
    expect(shouldAutoUnlockAdminConsole({ ...base, isAdmin: false })).toBe(false);
  });

  it("stays locked while signed out or before /auth/me has confirmed the session", () => {
    expect(shouldAutoUnlockAdminConsole({ ...base, isAuthenticated: false })).toBe(false);
    expect(shouldAutoUnlockAdminConsole({ ...base, authReady: false })).toBe(false);
  });

  it("never trusts a local-only (backend auth off) admin role — password gate applies", () => {
    expect(shouldAutoUnlockAdminConsole({ ...base, backendAuthEnabled: false })).toBe(false);
  });
});
