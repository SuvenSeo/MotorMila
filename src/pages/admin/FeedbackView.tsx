import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import {
  AdminCard,
  AdminEmptyNote,
  AdminErrorNote,
  AdminSearchField,
  adminCardClass,
  formatRelative,
  formatWhen,
} from "@/components/admin/AdminKit";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminFeedback, updateAdminFeedback } from "@/services/api";
import { cn } from "@/lib/utils";

const STATUSES = ["new", "open", "triaged", "resolved", "closed", "spam"] as const;

/** Feedback — inbox with a detail pane (click a row to expand it) and status updates. */
export function FeedbackView() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const q = useQuery({ queryKey: ["admin", "feedback"], queryFn: () => getAdminFeedback({ limit: 100 }) });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateAdminFeedback(id, status),
    onSuccess: () => {
      toast.success("Feedback updated");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message || "Update failed"),
  });

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (q.data?.feedback ?? []).filter(
      (item) =>
        (statusFilter === "all" || item.status === statusFilter) &&
        (!needle || `${item.message} ${item.email ?? ""} ${item.category}`.toLowerCase().includes(needle)),
    );
  }, [q.data, statusFilter, query]);
  const openCount = (q.data?.feedback ?? []).filter((i) => i.status === "new" || i.status === "open").length;

  return (
    <>
      <header>
        <h1 className="font-display text-[1.875rem] leading-[1.1] tracking-[-0.01em] text-foreground sm:text-[2.25rem]">Feedback</h1>
        <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-5 text-label-2">
          Triage bugs, ideas, and data reports from the in-app widget. {openCount} open.
        </p>
      </header>

      {q.error ? <AdminErrorNote message="Couldn't load feedback. Try again." onRetry={() => void q.refetch()} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <AdminSearchField value={query} onChange={setQuery} placeholder="Search message or email" label="Search feedback" className="w-[260px]" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-10 w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <AdminCard title="Feedback inbox" description="Click a row for the full detail.">
        <div className="space-y-3 px-5 pb-5">
          {q.isLoading ? (
            <Skeleton className="h-40" />
          ) : items.length === 0 ? (
            <AdminEmptyNote icon={LifeBuoy} title="No feedback here." body="Nothing matches the current filter." className="py-8" />
          ) : (
            items.map((item) => {
              const open = openId === item.id;
              return (
                <div key={item.id} className={cn(adminCardClass, "shadow-none")}>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : item.id)}
                    aria-expanded={open}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-caption font-medium text-primary/80">
                        {item.category} · {item.status}
                      </p>
                      <p className={cn("mt-2 text-body font-medium leading-relaxed text-foreground", !open && "line-clamp-2")}>{item.message}</p>
                      <p className="mt-2 text-caption text-label-2">
                        {item.email || "anonymous"}
                        {item.route ? ` · ${item.route}` : ""} · {formatRelative(item.createdAt)}
                      </p>
                    </div>
                    <ChevronDown aria-hidden className={cn("mt-1 size-4 shrink-0 text-label-2 transition-transform", open && "rotate-180")} />
                  </button>
                  {open ? (
                    <div className="border-t border-border px-4 py-3.5">
                      <dl className="grid gap-2 text-[0.8125rem] sm:grid-cols-2">
                        <div>
                          <dt className="text-caption text-label-2">Received</dt>
                          <dd className="font-medium text-foreground">{formatWhen(item.createdAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-caption text-label-2">From</dt>
                          <dd className="font-medium text-foreground">{item.email || "anonymous"}</dd>
                        </div>
                        <div>
                          <dt className="text-caption text-label-2">Route</dt>
                          <dd className="font-medium text-foreground">{item.route || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-caption text-label-2">Category</dt>
                          <dd className="font-medium text-foreground">{item.category}</dd>
                        </div>
                      </dl>
                      <p className="mt-3 whitespace-pre-wrap text-body leading-relaxed text-foreground">{item.message}</p>
                    </div>
                  ) : null}
                  <div className="flex justify-end border-t border-border px-4 py-2.5">
                    <Select value={item.status} onValueChange={(status) => update.mutate({ id: item.id, status })}>
                      <SelectTrigger className="h-9 w-[130px] rounded-full bg-surface-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </AdminCard>
    </>
  );
}
