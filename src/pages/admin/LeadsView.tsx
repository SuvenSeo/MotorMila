import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AdminCard,
  AdminEmptyNote,
  AdminErrorNote,
  AdminHeader,
  formatRelative,
  formatWhen,
} from "@/components/admin/AdminKit";
import { LeadsPanel } from "@/pages/admin/AdminQueues";
import { getAdminLeads, type AdminLead } from "@/lib/adminQueuesApi";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Leads — status workflow (new → contacted → closed / withdrawn), search
 * and kind filters live in the panel below; clicking a lead opens its
 * detail pane. Contact details are shared with consent for routing only.
 */
export function LeadsView() {
  const q = useQuery({ queryKey: ["admin", "leads", "detail"], queryFn: () => getAdminLeads({}), staleTime: 15_000 });
  const [openId, setOpenId] = useState<number | null>(null);
  const items = q.data?.items ?? [];

  return (
    <>
      <AdminHeader
        title="Leads"
        description="Finance, inspection and insurance requests. Click a lead in the detail list to open it, or work the queue below."
      />
      {q.error ? <AdminErrorNote message="Couldn't load leads. Try again." onRetry={() => void q.refetch()} /> : null}

      <AdminCard title="Lead detail" description="Latest leads first. Status changes happen in the queue below.">
        {q.isLoading ? (
          <p className="px-5 pb-5 text-footnote text-label-2">Loading…</p>
        ) : items.length === 0 ? (
          <AdminEmptyNote icon={Inbox} title="No leads yet." className="border-t border-border py-8" />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {[...items]
              .sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""))
              .slice(0, 10)
              .map((lead: AdminLead) => {
                const isOpen = openId === lead.id;
                return (
                  <li key={lead.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : lead.id)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-black/[0.02]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.8125rem] font-medium text-foreground">
                          {lead.kind} · {lead.name || "—"} <span className="font-normal text-label-2">· {lead.status}</span>
                        </p>
                        <p className="truncate text-[0.75rem] text-label-2">
                          {lead.vehicle || "—"} · {formatRelative(lead.created_at)}
                        </p>
                      </div>
                      <span className={cn("shrink-0 text-[0.75rem] text-label-2", isOpen && "font-semibold text-foreground")}>
                        {isOpen ? "Close" : "Detail"}
                      </span>
                    </button>
                    {isOpen ? (
                      <div className="border-t border-border bg-surface-2/60 px-5 py-4">
                        <dl className="grid gap-2 text-[0.8125rem] sm:grid-cols-2">
                          <div><dt className="text-caption text-label-2">Name</dt><dd className="font-medium text-foreground">{lead.name || "—"}</dd></div>
                          <div><dt className="text-caption text-label-2">Phone</dt><dd className="font-medium text-foreground">{lead.phone || "—"}</dd></div>
                          <div><dt className="text-caption text-label-2">Email</dt><dd className="font-medium text-foreground">{lead.email || "—"}</dd></div>
                          <div><dt className="text-caption text-label-2">District</dt><dd className="font-medium text-foreground">{lead.district || "—"}</dd></div>
                          <div><dt className="text-caption text-label-2">Vehicle</dt><dd className="font-medium text-foreground">{lead.vehicle || "—"}</dd></div>
                          <div><dt className="text-caption text-label-2">Budget</dt><dd className="font-medium text-foreground">{lead.budget_lkr != null ? `Rs ${Math.round(Number(lead.budget_lkr)).toLocaleString()}` : "—"}</dd></div>
                          <div><dt className="text-caption text-label-2">Received</dt><dd className="font-medium text-foreground">{formatWhen(lead.created_at)}</dd></div>
                          <div><dt className="text-caption text-label-2">Routed to</dt><dd className="font-medium text-foreground">{lead.routed_to || "—"}</dd></div>
                        </dl>
                        {lead.notes ? <p className="mt-3 text-body leading-relaxed text-foreground">{lead.notes}</p> : null}
                        {lead.source_page ? <p className="mt-2 text-caption text-label-2">Source: {lead.source_page}</p> : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        )}
      </AdminCard>

      <LeadsPanel />
    </>
  );
}
