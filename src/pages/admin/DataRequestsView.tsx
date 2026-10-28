import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import {
  AdminCard,
  AdminErrorNote,
  AdminHeader,
  AdminKpiCard,
  formatDay,
} from "@/components/admin/AdminKit";
import { RemovalRequestsPanel } from "@/pages/admin/AdminQueues";
import { getLegalRequests } from "@/lib/adminQueuesApi";

/**
 * Data requests — the existing removal & account-deletion requests,
 * which are the data requests Motormila actually holds. (There is no
 * separate access/correction/erasure log table; those requests, when
 * they arrive, are handled as account deletions here.)
 *
 * Guidance, CeyFi-style: 30 days from receipt. The countdown below is
 * computed from each request's due date; overdue open requests are
 * flagged in the queue itself.
 */
const GUIDANCE_DAYS = 30;

export function DataRequestsView() {
  const openQ = useQuery({ queryKey: ["admin", "legal", "open-summary"], queryFn: () => getLegalRequests({ status: "open" }), staleTime: 30_000 });
  const items = openQ.data?.items ?? [];
  const now = Date.now();
  const overdue = useMemo(() => items.filter((r) => r.dueAt && Date.parse(r.dueAt) < now).length, [items, now]);
  const dueSoon = useMemo(
    () => items.filter((r) => r.dueAt && Date.parse(r.dueAt) >= now && Date.parse(r.dueAt) - now <= 7 * 86_400_000).length,
    [items, now],
  );

  return (
    <>
      <AdminHeader
        title="Data requests"
        description={`Listing removal and account-deletion requests, oldest deadline first. Guidance target: ${GUIDANCE_DAYS} days from receipt. Approving here records the decision — remove the listing / account itself, then mark actioned.`}
      />
      {openQ.error ? <AdminErrorNote message="Couldn't load request counts. Try again." onRetry={() => void openQ.refetch()} /> : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <AdminKpiCard label="Open requests" icon={ShieldCheck} value={openQ.isLoading ? undefined : items.length} footer={<span className="text-[0.75rem] text-label-2">Across removal and account deletion</span>} />
        <AdminKpiCard label="Overdue" icon={ShieldCheck} value={openQ.isLoading ? undefined : overdue} footer={<span className="text-[0.75rem] text-label-2">Past their due date, still open</span>} />
        <AdminKpiCard label="Due within 7 days" icon={ShieldCheck} value={openQ.isLoading ? undefined : dueSoon} footer={<span className="text-[0.75rem] text-label-2">Handle these first</span>} />
      </div>

      <AdminCard title="How the countdown works" description="Each request carries a due date; the queue flags anything overdue.">
        <p className="px-5 pb-5 text-[0.8125rem] leading-5 text-label-2">
          {`Today is ${formatDay(new Date().toISOString().slice(0, 10))}. `}
          A request received today should be handled within {GUIDANCE_DAYS} days. The queue below is sorted oldest
          deadline first, so the most urgent requests are always at the top. Resolution notes are recorded on the
          request itself, and every action also lands in the Logs audit trail.
        </p>
      </AdminCard>

      <RemovalRequestsPanel />
    </>
  );
}
