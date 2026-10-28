import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Store } from "lucide-react";
import { toast } from "sonner";
import {
  AdminEmptyNote,
  AdminErrorNote,
  adminCardClass,
  adminTdClass,
  adminThClass,
} from "@/components/admin/AdminKit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminDealers, verifyAdminDealer } from "@/services/api";

/** Dealers — verify pending yards without the separate dealer admin token. */
export function DealersView() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "dealers"], queryFn: () => getAdminDealers({ limit: 100 }) });
  const verify = useMutation({
    mutationFn: verifyAdminDealer,
    onSuccess: () => {
      toast.success("Dealer verified");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message || "Verify failed"),
  });

  return (
    <>
      <header>
        <h1 className="font-display text-[1.875rem] leading-[1.1] tracking-[-0.01em] text-foreground sm:text-[2.25rem]">Dealers</h1>
        <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-5 text-label-2">Dealer claims, verified from here.</p>
      </header>

      {q.error ? <AdminErrorNote message="Couldn't load dealers. Try again." onRetry={() => void q.refetch()} /> : null}

      <div className={adminCardClass}>
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-display text-callout font-semibold">Dealer claims</h2>
          <p className="text-caption text-label-2">Verify pending yards without the separate dealer admin token.</p>
        </div>
        <div className="overflow-x-auto p-6">
          {q.isLoading ? (
            <Skeleton className="h-40" />
          ) : (q.data?.dealers ?? []).length === 0 ? (
            <AdminEmptyNote icon={Store} title="No dealer profiles yet." className="py-8" />
          ) : (
            <TableContainer className="border-0">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className={adminThClass}>Dealer</TableHead>
                    <TableHead className={adminThClass}>Contact</TableHead>
                    <TableHead className={adminThClass}>Status</TableHead>
                    <TableHead className={adminThClass}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(q.data?.dealers ?? []).map((dealer) => (
                    <TableRow key={dealer.id}>
                      <TableCell className={adminTdClass}>
                        <p className="font-semibold">{dealer.displayName}</p>
                        <p className="text-caption text-label-2">{dealer.sellerNamePattern || dealer.claimedUrl || "—"}</p>
                      </TableCell>
                      <TableCell className={adminTdClass + " text-caption text-label-2"}>
                        {dealer.contactEmail || dealer.contactPhone || "—"}
                      </TableCell>
                      <TableCell className={adminTdClass + " text-caption font-medium"}>{dealer.status}</TableCell>
                      <TableCell className={adminTdClass}>
                        {dealer.status !== "verified" ? (
                          <Button type="button" size="sm" className="h-9 rounded-full" onClick={() => verify.mutate(dealer.id)}>
                            Verify
                          </Button>
                        ) : (
                          <span className="text-caption text-label-2">Verified</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </div>
      </div>
    </>
  );
}
