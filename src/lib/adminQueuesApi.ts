/**
 * Admin work queues (ui/features): user-listing moderation, leads, and
 * removal / account-deletion requests. Every endpoint is admin-gated on the
 * server (require_admin_access); the console's bearer token is attached.
 *
 *   GET  /admin/listings/moderation?status=   POST /admin/listings/{id}/approve|reject
 *   GET  /leads/admin?status=&kind=           PATCH /leads/admin/{id} {status}
 *   GET  /legal/admin/requests?kind=&status=  PATCH /legal/admin/requests/{id} {status,note}
 */
import { API_BASE, resolveFetchCredentials } from "@/services/api";
import { authHeaders } from "@/lib/authToken";

async function adminRequest<T>(path: string, init: RequestInit = {}, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  Object.entries(params ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), {
    ...init,
    credentials: resolveFetchCredentials(API_BASE),
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
    },
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { detail?: unknown };
      if (typeof data.detail === "string") detail = data.detail;
    } catch {
      /* non-JSON */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

// ── Moderation ───────────────────────────────────────────────────────────────
export interface ModerationItem {
  id: number;
  title: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  priceLkr: number | null;
  district: string | null;
  status: string | null;
  isActive: boolean;
  contactName: string | null;
  description: string | null;
  images: string[] | null;
  createdAt: string | null;
  updatedAt: string | null;
}
export type ModerationStatus = "pending" | "published" | "draft" | "removed" | "all";

export const getModerationQueue = (status: ModerationStatus = "pending", limit = 100) =>
  adminRequest<{ items: ModerationItem[]; count: number }>("/admin/listings/moderation", {}, { status, limit });
export const approveListing = (id: number) =>
  adminRequest<ModerationItem>(`/admin/listings/${id}/approve`, { method: "POST" });
export const rejectListing = (id: number, reason?: string) =>
  adminRequest<ModerationItem>(`/admin/listings/${id}/reject`, { method: "POST", body: JSON.stringify({ reason: reason || null }) });

// ── Leads ────────────────────────────────────────────────────────────────────
export type LeadStatus = "new" | "contacted" | "closed" | "withdrawn";
export interface AdminLead {
  id: number;
  created_at: string | null;
  kind: string;
  status: LeadStatus | string;
  name: string | null;
  phone: string | null;
  email: string | null;
  district: string | null;
  vehicle: string | null;
  listing_id: number | null;
  budget_lkr: number | null;
  notes: string | null;
  source_page: string | null;
  routed_to: string | null;
  delivery_status: string | null;
}
export const getAdminLeads = (params: { status?: string; kind?: string; limit?: number } = {}) =>
  adminRequest<{ items: AdminLead[]; count: number }>("/leads/admin", {}, { limit: 200, ...params });
export const updateLeadStatus = (id: number, status: LeadStatus) =>
  adminRequest<AdminLead>(`/leads/admin/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });

// ── Removal / account-deletion requests ─────────────────────────────────────
export type LegalStatus = "open" | "actioned" | "rejected";
export interface AdminLegalRequest {
  id: number;
  kind: "removal" | "account_deletion" | string;
  reference: string;
  listingUrl: string | null;
  reason: string | null;
  requesterRole: string | null;
  details: string | null;
  name: string | null;
  email: string | null;
  status: LegalStatus | string;
  dueAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string | null;
}
export const getLegalRequests = (params: { kind?: "removal" | "account_deletion"; status?: LegalStatus } = {}) =>
  adminRequest<{ items: AdminLegalRequest[]; count: number }>("/legal/admin/requests", {}, { limit: 200, ...params });
export const resolveLegalRequest = (id: number, status: LegalStatus, note?: string) =>
  adminRequest<AdminLegalRequest>(`/legal/admin/requests/${id}`, { method: "PATCH", body: JSON.stringify({ status, note: note || null }) });
