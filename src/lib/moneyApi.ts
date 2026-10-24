/**
 * Client for the money/legal endpoints (PayHere, leads, legal requests).
 * Kept separate from services/api.ts so the overhaul branches merge cleanly.
 */
import { API_BASE, resolveFetchCredentials } from "@/services/api";
import { authHeaders } from "@/lib/authToken";
import type { LeadKind } from "@/lib/leadConsent";

/** Error with the HTTP status, so friendlyApiError() can turn 5xx/429 into translated copy. */
export class MoneyApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "MoneyApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    },
    // Cookies only work same-origin: a cross-origin "include" call to the HF API is
    // blocked by CORS (no Allow-Credentials), which broke /pricing, leads and removal.
    credentials: resolveFetchCredentials(API_BASE),
  });
  if (!res.ok) {
    let detail = "Something went wrong. Please try again.";
    try {
      const data = (await res.json()) as { detail?: unknown };
      if (typeof data.detail === "string") detail = data.detail;
      else if (Array.isArray(data.detail)) detail = "Please check the highlighted fields.";
    } catch {
      /* non-JSON error */
    }
    if (res.status === 429) detail = "Too many requests from this connection. Please wait a few minutes.";
    throw new MoneyApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

// ── Leads ──────────────────────────────────────────────────────────────────

export type LeadPayload = {
  kind: LeadKind;
  name: string;
  phone: string;
  email?: string;
  district?: string;
  vehicle?: string;
  listing_id?: number;
  budget_lkr?: number;
  down_payment_lkr?: number;
  preferred_date?: string;
  notes?: string;
  source_page?: string;
  consent: boolean;
  consent_version: string;
  website?: string;
};

export type LeadReceipt = { ok: boolean; reference: string; routedTo: string[]; message: string };
export type LeadPartner = { id: string; name: string; licence?: string | null; privacyUrl?: string | null };

export const submitLead = (body: LeadPayload) =>
  request<LeadReceipt>("/leads", { method: "POST", body: JSON.stringify(body) });

export const getLeadPartners = (kind: LeadKind) =>
  request<{ kind: LeadKind; partners: LeadPartner[] }>(`/leads/partners?kind=${encodeURIComponent(kind)}`);

// ── Legal requests ─────────────────────────────────────────────────────────

export type LegalReceipt = { ok: boolean; reference: string; dueAt: string; message: string };

export type RemovalPayload = {
  listing_url: string;
  reason: "my_listing" | "personal_data" | "copyright" | "sold_or_outdated" | "inaccurate" | "other";
  requester_role?: "seller" | "rights_holder" | "pictured_person" | "other";
  details?: string;
  name?: string;
  email: string;
  phone?: string;
  confirm_accurate: boolean;
  website?: string;
};

export const submitRemovalRequest = (body: RemovalPayload) =>
  request<LegalReceipt>("/legal/removal", { method: "POST", body: JSON.stringify(body) });

export const submitAccountDeletion = (body: { email: string; name?: string; details?: string; confirm: boolean; website?: string }) =>
  request<LegalReceipt>("/legal/account-deletion", { method: "POST", body: JSON.stringify(body) });

// ── PayHere ────────────────────────────────────────────────────────────────

export type PayherePlanCode = "pro" | "dealer_starter" | "dealer_pro" | "dealer_yard";

export type PayhereConfig = {
  enabled: boolean;
  sandbox: boolean;
  currency: "LKR";
  proFreeDuringBeta: boolean;
  recurringAvailable?: boolean;
  plans: { code: PayherePlanCode; label: string; monthlyLkr: number; yearlyLkr: number; stockLimit: number | null; checkoutOpen: boolean }[];
};

export type PayhereCheckout = {
  action_url: string;
  method: "POST";
  sandbox: boolean;
  order_id: string;
  fields: Record<string, string>;
};

export const getPayhereConfig = () => request<PayhereConfig>("/payhere/config");

export const createPayhereCheckout = (body: {
  plan_code: PayherePlanCode;
  period: "monthly" | "yearly";
  recurring?: boolean;
  phone: string;
}) => request<PayhereCheckout>("/payhere/checkout", { method: "POST", body: JSON.stringify(body) });

export const getPayhereOrder = (orderId: string) =>
  request<{ orderId: string; status: string; planCode: string; period: string; amount: string; currency: string }>(
    `/payhere/orders/${encodeURIComponent(orderId)}`,
  );

/** Build and submit the PayHere HTML form (full-page redirect to PayHere). */
export function submitPayhereForm(checkout: PayhereCheckout): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = checkout.action_url;
  form.style.display = "none";
  for (const [name, value] of Object.entries(checkout.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
