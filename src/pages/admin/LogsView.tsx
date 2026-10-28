import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw, ScrollText } from "lucide-react";
import {
  AdminCard,
  AdminEmptyNote,
  AdminErrorNote,
  AdminHeader,
  AdminSearchField,
  AdminStatusDot,
  formatRelative,
  formatWhen,
} from "@/components/admin/AdminKit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminAuditLog, getAdminPipeline } from "@/services/api";
import { cn } from "@/lib/utils";

/**
 * Logs — two real sources, nothing invented.
 *  1. Admin actions: the audit log written by the backend for every
 *     privileged console action (invite, user change, verify,
 *     approve/reject, permit, cache clear). On deployments predating
 *     the table this is simply empty until the first action lands.
 *  2. Pipeline runs: scrape runs with their error text (admin-only).
 */
function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function LogsView() {
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<"all" | "error" | "info">("all");
  const auditQ = useQuery({ queryKey: ["admin", "audit-log"], queryFn: () => getAdminAuditLog(200) });
  const pipeQ = useQuery({ queryKey: ["admin", "pipeline", "logs"], queryFn: () => getAdminPipeline({ limit: 50 }) });

  const auditRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (auditQ.data?.items ?? []).filter(
      (r) => !needle || `${r.actorEmail} ${r.action} ${r.targetType} ${r.targetId ?? ""} ${r.detail ?? ""}`.toLowerCase().includes(needle),
    );
  }, [auditQ.data, search]);

  const runs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const all = pipeQ.data?.runs ?? [];
    return all.filter((run) => {
      if (level === "error" && run.status !== "FAILED") return false;
      if (level === "info" && run.status === "FAILED") return false;
      return !needle || `${run.source} ${run.status ?? ""} ${run.errorMessage ?? ""}`.toLowerCase().includes(needle);
    });
  }, [pipeQ.data, search, level]);

  return (
    <>
      <AdminHeader
        title="Logs"
        description="Admin actions from the audit log, and pipeline runs with their error text. Nothing here is sampled or invented."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="h-9 rounded-full px-3.5" onClick={() => void auditQ.refetch()} disabled={auditQ.isLoading}>
              <RefreshCw className={cn("size-3.5", auditQ.isLoading && "animate-spin")} /> Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-full px-3.5"
              onClick={() => downloadCsv("motormila-admin-audit-log.csv", toCsv(auditRows.map((r) => ({ id: r.id, actor: r.actorEmail, action: r.action, target: `${r.targetType}:${r.targetId ?? ""}`, detail: r.detail ?? "", at: r.createdAt ?? "" }))))}
            >
              <Download aria-hidden className="size-3.5" /> Export audit CSV
            </Button>
          </div>
        }
      />

      {(auditQ.error || pipeQ.error) && !auditQ.data && !pipeQ.data ? (
        <AdminErrorNote message="Couldn't load logs. Try again." onRetry={() => { void auditQ.refetch(); void pipeQ.refetch(); }} />
      ) : null}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
        <div className="flex items-center gap-1 rounded-xl bg-surface-2 p-1">
          {(["all", "error", "info"] as const).map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setLevel(lvl)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[0.75rem] font-medium capitalize transition-colors",
                level === lvl ? "bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.05)]" : "text-label-2 hover:text-foreground",
              )}
            >
              {lvl === "all" ? "All levels" : lvl === "error" ? "Errors" : "Info"}
            </button>
          ))}
        </div>
        <div className="min-w-[200px] flex-1">
          <AdminSearchField value={search} onChange={setSearch} placeholder="Search actions, runs or error text…" label="Search logs" />
        </div>
      </div>

      <AdminCard
        title={
          <span className="flex items-center gap-2">
            Admin actions
            {auditQ.data ? (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.6875rem] font-medium text-label-2 tabular-nums">
                {auditRows.length} {auditRows.length === 1 ? "entry" : "entries"}
              </span>
            ) : null}
          </span>
        }
      >
        {!auditQ.data ? (
          <div className="space-y-2 border-t border-border px-5 py-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : auditRows.length === 0 ? (
          <AdminEmptyNote icon={ScrollText} title="No admin actions yet" body="Actions taken from this console are recorded here. Older deployments have no rows until the first new action." className="border-t border-border py-10" />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {auditRows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <AdminStatusDot tone="ok" />
                <span className="shrink-0 font-mono text-[0.75rem] text-foreground">{row.action}</span>
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-label-2">
                  {row.targetType}:{row.targetId ?? "—"}
                  {row.detail ? ` · ${row.detail}` : ""}
                </span>
                <span className="shrink-0 text-[0.75rem] text-label-2">{row.actorEmail}</span>
                <span className="shrink-0 text-[0.75rem] text-label-2">{formatRelative(row.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard
        title={
          <span className="flex items-center gap-2">
            Pipeline runs
            {pipeQ.data ? (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.6875rem] font-medium text-label-2 tabular-nums">
                {runs.length} {runs.length === 1 ? "run" : "runs"}
              </span>
            ) : null}
          </span>
        }
      >
        {!pipeQ.data ? (
          <div className="space-y-2 border-t border-border px-5 py-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : runs.length === 0 ? (
          <AdminEmptyNote icon={ScrollText} title="No runs match" body="No pipeline runs match the current filter." className="border-t border-border py-10" />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <AdminStatusDot tone={run.status === "FAILED" ? "bad" : run.status === "SUCCESS" ? "ok" : "idle"} />
                <span className="shrink-0 font-mono text-[0.75rem] text-foreground">{run.source}</span>
                <span className="shrink-0 text-[0.75rem] font-medium text-label-2">{run.status || "—"}</span>
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-label-2">
                  found {run.listingsFound} · new {run.listingsNew}
                  {run.errorMessage ? ` · ${run.errorMessage}` : ""}
                </span>
                <span className="shrink-0 text-[0.75rem] text-label-2" title={formatWhen(run.startedAt)}>{formatRelative(run.startedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </>
  );
}
