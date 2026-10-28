import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown } from "lucide-react";
import { toast } from "sonner";
import { AdminCard, AdminEmptyNote, AdminErrorNote } from "@/components/admin/AdminKit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAdminPermits, upsertAdminPermit } from "@/services/api";

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) <= 0) return "—";
  return `Rs ${Math.round(Number(value)).toLocaleString()}`;
}

/** Permits — upsert a permit price and see the current list. Unchanged behaviour. */
export function PermitsView() {
  const qc = useQueryClient();
  const [permitName, setPermitName] = useState("");
  const [permitType, setPermitType] = useState("duty_free");
  const [permitPrice, setPermitPrice] = useState("0");

  const q = useQuery({ queryKey: ["admin", "permits"], queryFn: getAdminPermits });
  const save = useMutation({
    mutationFn: upsertAdminPermit,
    onSuccess: () => {
      toast.success("Permit saved");
      setPermitName("");
      setPermitPrice("0");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message || "Permit save failed"),
  });

  return (
    <>
      <header>
        <h1 className="font-display text-[1.875rem] leading-[1.1] tracking-[-0.01em] text-foreground sm:text-[2.25rem]">Permits</h1>
        <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-5 text-label-2">Duty-free and EV permit market prices.</p>
      </header>

      {q.error ? <AdminErrorNote message="Couldn't load permits. Try again." onRetry={() => void q.refetch()} /> : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <AdminCard title="Upsert permit price">
          <form
            className="space-y-3 px-5 pb-5"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate({ permit_name: permitName.trim(), permit_type: permitType.trim(), market_price_lkr: Number(permitPrice) || 0 });
            }}
          >
            <Input value={permitName} onChange={(e) => setPermitName(e.target.value)} placeholder="Permit name" className="h-11" required />
            <Input value={permitType} onChange={(e) => setPermitType(e.target.value)} placeholder="Type (duty_free / ev)" className="h-11" required />
            <Input type="number" value={permitPrice} onChange={(e) => setPermitPrice(e.target.value)} placeholder="Market price LKR" className="h-11 tabular-nums" required />
            <Button type="submit" className="h-11 w-full rounded-full" disabled={save.isPending}>
              Save permit
            </Button>
          </form>
        </AdminCard>
        <AdminCard title="Current permits">
          <div className="space-y-2 px-5 pb-5">
            {(q.data?.permits ?? []).map((permit) => (
              <div key={permit.id} className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3.5 py-3">
                <div>
                  <p className="text-footnote font-semibold">{permit.permitName}</p>
                  <p className="text-caption text-label-2">{permit.permitType}</p>
                </div>
                <p className="text-footnote font-semibold tabular-nums">{formatPrice(permit.marketPriceLkr)}</p>
              </div>
            ))}
            {!q.isLoading && (q.data?.permits ?? []).length === 0 ? (
              <AdminEmptyNote icon={Crown} title="No permits configured." className="py-8" />
            ) : null}
          </div>
        </AdminCard>
      </div>
    </>
  );
}
