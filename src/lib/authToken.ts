// Shared bearer-token storage, kept outside authContext so the API layer can
// attach Authorization headers without importing React context (no cycle).

const TOKEN_STORAGE_KEY = "motormila.auth_token";

export function getStoredAuthToken(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeAuthToken(token: string | null): void {
  try {
    if (typeof window === "undefined") return;
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Storage can be unavailable (privacy mode); auth then lasts one page view.
  }
}

export function authHeaders(): Record<string, string> {
  const token = getStoredAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
