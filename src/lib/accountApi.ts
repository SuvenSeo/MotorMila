/**
 * Self-service account deletion: DELETE /api/v1/auth/me (backend auth.py).
 * Auth = bearer token (stored at sign-in) and/or the mm_session cookie; the
 * optional password re-check is sent when the user types one.
 */
import { API_BASE, resolveFetchCredentials } from "@/services/api";
import { authHeaders } from "@/lib/authToken";

export type DeleteAccountErrorCode =
  | "unauthenticated"
  | "wrong_password"
  | "managed_account"
  | "not_found"
  | "rate_limited"
  | "unavailable"
  | "network"
  | "unknown";

export class DeleteAccountError extends Error {
  code: DeleteAccountErrorCode;
  status: number;
  constructor(code: DeleteAccountErrorCode, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface DeleteAccountResult {
  ok: boolean;
  deleted: boolean;
  email?: string;
}

function codeFor(status: number): DeleteAccountErrorCode {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "wrong_password";
  if (status === 404) return "not_found";
  if (status === 409) return "managed_account";
  if (status === 429) return "rate_limited";
  if (status === 503 || status === 502 || status === 504) return "unavailable";
  return "unknown";
}

export async function deleteMyAccount(password?: string): Promise<DeleteAccountResult> {
  const url = new URL(`${API_BASE}/auth/me`, window.location.origin).toString();
  const body = password ? JSON.stringify({ password }) : undefined;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "DELETE",
      credentials: resolveFetchCredentials(API_BASE),
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...authHeaders(),
      },
      body,
    });
  } catch {
    throw new DeleteAccountError("network", 0, "Network error");
  }
  if (!res.ok) {
    let detail = "";
    try {
      const data = (await res.json()) as { detail?: unknown };
      if (typeof data.detail === "string") detail = data.detail;
    } catch {
      /* non-JSON */
    }
    throw new DeleteAccountError(codeFor(res.status), res.status, detail || `HTTP ${res.status}`);
  }
  const data = (await res.json().catch(() => ({}))) as Partial<DeleteAccountResult>;
  return { ok: data.ok !== false, deleted: data.deleted !== false, email: data.email };
}
