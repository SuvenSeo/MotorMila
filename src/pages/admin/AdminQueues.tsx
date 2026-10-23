import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  approveListing,
  getAdminLeads,
  getLegalRequests,
  getModerationQueue,
  rejectListing,
  resolveLegalRequest,
  updateLeadStatus,
  type LeadStatus,
  type LegalStatus,
  type ModerationStatus,
} from "@/lib/adminQueuesApi";
import { safeExternalUrl } from "@/lib/safeExternalUrl";

/**
 * Admin work queues (ui/features). Staff-only, rendered inside the existing
 * credential-gated console (AdminDashboard tabs); the server enforces
 * require_admin_access on every call. English-only like the rest of the console.
 */

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" });
}

function lkr(n: number | null | undefined): string {
  return n != null && Number.isFinite(Number(n)) ? `Rs ${Math.round(Number(n)).toLocaleString("en-LK")}` : "—";
}

function Panel({ title, hint, children, onRefresh, filters }: { title: string; hint: string; children: React.ReactNode; onRefresh: () => void; filters?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-body font-semibold text-foreground">{title}</h2>
          <p className="text-caption text-muted-foreground">{hint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filters}
          <button type="button" onClick={onRefresh} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-caption font-semibold text-foreground hover:border-primary/40">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh
          </button>
        </div>
      </div>
      {children}
    </section>
  );
}

function FilterSelect<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[NoInfer<T>, string]>; onChange: (v: NoInfer<T>) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-caption font-semibold text-muted-foreground">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="h-9 rounded-full border border-border bg-surface px-3 text-caption text-foreground">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function StateBlock({ loading, error, empty }: { loading: boolean; error: unknown; empty: boolean }) {
  if (loading) return <div className="space-y-2"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /></div>;
  if (error) return <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-footnote text-destructive">{error instanceof Error ? error.message : "Failed to load."}</p>;
  if (empty) return <p className="rounded-xl border border-dashed border-border p-6 text-center text-footnote text-muted-foreground">Nothing here. Queue is clear.</p>;
  return null;
}

const actionBtn = "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-caption font-semibold disabled:opacity-40";

// ── Moderation queue ────────────────────────────────────────────────────────
export function ModerationQueuePanel() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<ModerationStatus>("pending");
  const q = useQuery({ queryKey: ["admin", "moderation", status], queryFn: () => getModerationQueue(status), staleTime: 15_000 });
  const done = () => void qc.invalidateQueries({ queryKey: ["admin", "moderation"] });
  const approve = useMutation({ mutationFn: approveListing, onSuccess: () => { toast.success("Listing published"); done(); }, onError: (e: Error) => toast.error(e.message) });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => rejectListing(id, reason),
    onSuccess: () => { toast.success("Listing sent back to the owner as draft"); done(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const items = q.data?.items ?? [];

  return (
    <Panel
      title="Moderation queue"
      hint="Ads posted on MotorMila by users. Approve to publish, reject to return to the owner as a draft."
      onRefresh={() => void q.refetch()}
      filters={<FilterSelect label="Status" value={status} onChange={setStatus} options={[["pending", "Pending"], ["published", "Published"], ["draft", "Draft"], ["removed", "Removed"], ["all", "All"]]} />}
    >
      <StateBlock loading={q.isLoading} error={q.error} empty={!q.isLoading && !q.error && items.length === 0} />
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id} className="rounded-xl border border-border bg-surface/60 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold text-foreground">
                  {it.title || [it.year, it.make, it.model].filter(Boolean).join(" ") || `Listing #${it.id}`}
                </p>
                <p className="text-caption text-muted-foreground">
                  #{it.id} · {lkr(it.priceLkr)} · {it.district || "—"} · {it.status || "—"} · submitted {fmtDate(it.createdAt)}
                  {it.contactName ? ` · by ${it.contactName}` : ""}
                </p>
                {it.description ? <p className="mt-1 line-clamp-3 text-caption text-foreground/80">{it.description}</p> : null}
                {Array.isArray(it.images) && it.images.length > 0 ? (
                  <div className="mt-2 flex gap-1.5 overflow-x-auto">
                    {it.images.slice(0, 4).map((src) => (
                      <img key={src} src={src} alt="" loading="lazy" className="h-14 w-20 shrink-0 rounded-md border border-border object-cover" />
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={approve.isPending || it.status === "published" || it.status === "removed"}
                  onClick={() => approve.mutate(it.id)}
                  className={cn(actionBtn, "bg-deal-good text-white hover:bg-deal-good/90")}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden /> Approve
                </button>
                <button
                  type="button"
                  disabled={reject.isPending || it.status === "draft"}
                  onClick={() => {
                    const reason = window.prompt("Reason for rejecting (sent back with the draft, optional):") ?? undefined;
                    if (reason === undefined) return;
                    reject.mutate({ id: it.id, reason });
                  }}
                  className={cn(actionBtn, "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15")}
                >
                  <X className="h-3.5 w-3.5" aria-hidden /> Reject
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ── Leads ───────────────────────────────────────────────────────────────────
export function LeadsPanel() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"" | LeadStatus>("new");
  const [kind, setKind] = useState<"" | "finance" | "inspection" | "insurance">("");
  const q = useQuery({ queryKey: ["admin", "leads", status, kind], queryFn: () => getAdminLeads({ status: status || undefined, kind: kind || undefined }), staleTime: 15_000 });
  const update = useMutation({
    mutationFn: ({ id, next }: { id: number; next: LeadStatus }) => updateLeadStatus(id, next),
    onSuccess: (_d, v) => { toast.success(`Lead marked ${v.next}`); void qc.invalidateQueries({ queryKey: ["admin", "leads"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const items = q.data?.items ?? [];

  return (
    <Panel
      title="Leads"
      hint="Finance, inspection and insurance requests. Contact details are shared with consent for routing only."
      onRefresh={() => void q.refetch()}
      filters={
        <>
          <FilterSelect label="Kind" value={kind} onChange={setKind} options={[["", "All"], ["finance", "Finance"], ["inspection", "Inspection"], ["insurance", "Insurance"]]} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[["", "All"], ["new", "New"], ["contacted", "Contacted"], ["closed", "Closed"], ["withdrawn", "Withdrawn"]]} />
        </>
      }
    >
      <StateBlock loading={q.isLoading} error={q.error} empty={!q.isLoading && !q.error && items.length === 0} />
      <ul className="space-y-2">
        {items.map((l) => (
          <li key={l.id} className="rounded-xl border border-border bg-surface/60 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 text-caption text-muted-foreground">
                <p className="text-body font-semibold text-foreground">
                  {l.kind} · {l.name || "—"} <span className="font-normal text-muted-foreground">· {l.status}</span>
                </p>
                <p>
                  {l.phone || "—"}
                  {l.email ? ` · ${l.email}` : ""} · {l.district || "—"} · {fmtDate(l.created_at)}
                </p>
                <p>
                  {l.vehicle || "—"}
                  {l.budget_lkr ? ` · budget ${lkr(l.budget_lkr)}` : ""}
                  {l.routed_to ? ` · routed to ${l.routed_to}` : ""}
                  {l.delivery_status ? ` (${l.delivery_status})` : ""}
                </p>
                {l.notes ? <p className="mt-1 text-foreground/80">{l.notes}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={update.isPending || l.status === "contacted"} onClick={() => update.mutate({ id: l.id, next: "contacted" })} className={cn(actionBtn, "bg-primary text-primary-foreground")}>
                  <Check className="h-3.5 w-3.5" aria-hidden /> Contacted
                </button>
                <button type="button" disabled={update.isPending || l.status === "closed"} onClick={() => update.mutate({ id: l.id, next: "closed" })} className={cn(actionBtn, "border border-border bg-card text-foreground")}>
                  Close
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ── Removal / deletion requests ─────────────────────────────────────────────
export function RemovalRequestsPanel() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<LegalStatus>("open");
  const [kind, setKind] = useState<"removal" | "account_deletion">("removal");
  const q = useQuery({ queryKey: ["admin", "legal", status, kind], queryFn: () => getLegalRequests({ status, kind }), staleTime: 15_000 });
  const resolve = useMutation({
    mutationFn: ({ id, next, note }: { id: number; next: LegalStatus; note?: string }) => resolveLegalRequest(id, next, note),
    onSuccess: (_d, v) => { toast.success(v.next === "actioned" ? "Marked as actioned" : v.next === "rejected" ? "Request rejected" : "Reopened"); void qc.invalidateQueries({ queryKey: ["admin", "legal"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const items = q.data?.items ?? [];
  const now = Date.now();

  return (
    <Panel
      title="Removal & deletion requests"
      hint="Listing removal and emailed account-deletion requests, oldest deadline first. Approving here records the decision — remove the listing / account itself, then mark actioned."
      onRefresh={() => void q.refetch()}
      filters={
        <>
          <FilterSelect label="Type" value={kind} onChange={setKind} options={[["removal", "Listing removal"], ["account_deletion", "Account deletion"]]} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[["open", "Open"], ["actioned", "Actioned"], ["rejected", "Rejected"]]} />
        </>
      }
    >
      <StateBlock loading={q.isLoading} error={q.error} empty={!q.isLoading && !q.error && items.length === 0} />
      <ul className="space-y-2">
        {items.map((r) => {
          const overdue = r.status === "open" && r.dueAt && Date.parse(r.dueAt) < now;
          const href = r.listingUrl ? safeExternalUrl(r.listingUrl) : null;
          return (
            <li key={r.id} className="rounded-xl border border-border bg-surface/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 text-caption text-muted-foreground">
                  <p className="text-body font-semibold text-foreground">
                    {r.reference} · {r.reason || r.kind}{" "}
                    {overdue ? <span className="ml-1 rounded-full bg-destructive/15 px-2 py-0.5 text-caption font-bold text-destructive">Overdue</span> : null}
                  </p>
                  <p>
                    {r.name || "—"} · {r.email || "—"}
                    {r.requesterRole ? ` · ${r.requesterRole}` : ""} · due {fmtDate(r.dueAt)}
                  </p>
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 break-all text-primary-bright">
                      {r.listingUrl} <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  ) : null}
                  {r.details ? <p className="mt-1 text-foreground/80">{r.details}</p> : null}
                  {r.resolutionNote ? <p className="mt-1 italic">Note: {r.resolutionNote}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.status === "open" ? (
                    <>
                      <button
                        type="button"
                        disabled={resolve.isPending}
                        onClick={() => {
                          const note = window.prompt("What was done? (optional note)") ?? undefined;
                          if (note === undefined) return;
                          resolve.mutate({ id: r.id, next: "actioned", note });
                        }}
                        className={cn(actionBtn, "bg-deal-good text-white hover:bg-deal-good/90")}
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden /> Approve
                      </button>
                      <button
                        type="button"
                        disabled={resolve.isPending}
                        onClick={() => {
                          const note = window.prompt("Reason for rejecting (kept on record):") ?? undefined;
                          if (note === undefined) return;
                          resolve.mutate({ id: r.id, next: "rejected", note });
                        }}
                        className={cn(actionBtn, "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15")}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden /> Reject
                      </button>
                    </>
                  ) : (
                    <button type="button" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, next: "open" })} className={cn(actionBtn, "border border-border bg-card text-foreground")}>
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
