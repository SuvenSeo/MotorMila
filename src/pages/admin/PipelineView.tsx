import { useMutation, useQuery } from "@tanstack/react-query";
import { Database } from "lucide-react";
import { toast } from "sonner";
import {
  AdminCard,
  AdminEmptyNote,
  AdminErrorNote,
  AdminHeader,
  adminTdClass,
  adminThClass,
} from "@/components/admin/AdminKit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminPipeline, triggerAdminPipeline } from "@/services/api";

/** Pipeline — scrape triggers and runs, unchanged behaviour from the old tab. */
export function PipelineView() {
  const q = useQuery({ queryKey: ["admin", "pipeline"], queryFn: () => getAdminPipeline({ limit: 50 }), refetchInterval: 60_000 });
  const trigger = useMutation({
    mutationFn: (job: "sync" | "alt_sync") => triggerAdminPipeline(job),
    onSuccess: (result) => {
      toast.success(`Pipeline ${result.job} launched (pid ${result.pid})`);
      void q.refetch();
    },
    onError: (e: Error) => toast.error(e.message || "Trigger failed"),
  });

  return (
    <>
      <AdminHeader
        title="Pipeline"
        description="Scrape runs and triggers. Full error text is visible to session admins; the same runs feed the Logs page."
      />

      {q.error ? <AdminErrorNote message="Couldn't load pipeline runs. Try again." onRetry={() => void q.refetch()} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-10 rounded-full" disabled={trigger.isPending} onClick={() => trigger.mutate("sync")}>
          Trigger core sync
        </Button>
        <Button type="button" variant="outline" className="h-10 rounded-full" disabled={trigger.isPending} onClick={() => trigger.mutate("alt_sync")}>
          Trigger alt sync
        </Button>
      </div>

      <AdminCard
        title="Scrape runs"
        description={
          q.data?.orphansReconciled ? `Reconciled ${q.data.orphansReconciled} orphan run(s).` : "Latest runs first."
        }
        bodyClassName="overflow-x-auto p-6"
      >
        {q.isLoading ? (
          <Skeleton className="h-40" />
        ) : (q.data?.runs ?? []).length === 0 ? (
          <AdminEmptyNote icon={Database} title="No scrape runs yet." className="py-8" />
        ) : (
          <TableContainer className="border-0">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead className={adminThClass}>Source</TableHead>
                  <TableHead className={adminThClass}>Status</TableHead>
                  <TableHead className={adminThClass}>Found</TableHead>
                  <TableHead className={adminThClass}>New</TableHead>
                  <TableHead className={adminThClass}>Started</TableHead>
                  <TableHead className={adminThClass}>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(q.data?.runs ?? []).map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className={adminTdClass + " font-semibold"}>{run.source}</TableCell>
                    <TableCell className={adminTdClass}>{run.status || "—"}</TableCell>
                    <TableCell className={adminTdClass + " tabular-nums"}>{run.listingsFound}</TableCell>
                    <TableCell className={adminTdClass + " tabular-nums"}>{run.listingsNew}</TableCell>
                    <TableCell className={adminTdClass + " text-caption text-label-2"}>
                      {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className={adminTdClass + " max-w-[280px] truncate text-caption text-deal-high-text"}>
                      {run.errorMessage || ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </AdminCard>
    </>
  );
}
