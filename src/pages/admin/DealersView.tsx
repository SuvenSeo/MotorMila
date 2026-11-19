import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Store } from "lucide-react";
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
      <AdminHeader title="Dealers" description="Dealer claims, verified from here." />

      {q.error ? <AdminErrorNote message="Couldn't load dealers. Try again." onRetry={() => void q.refetch()} /> : null}

      <AdminCard
        title="Dealer claims"
        description="Verify pending yards without the separate dealer admin token."
        bodyClassName="overflow-x-auto p-6"
      >
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
      </AdminCard>
    </>
  );
}
