import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AdminCard,
  AdminErrorNote,
} from "@/components/admin/AdminKit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { clearAdminStatsCache, getAdminSystem, runRevcarDataPilot, type AdminProviderHealth } from "@/services/api";

function providerStatusLabel(provider: AdminProviderHealth) {
  if (!provider.enabled) return "flagged off";
  if (!provider.configured) return "needs key";
  const status = provider.lastRun?.status;
  if (!status) return "ready · no runs yet";
  return status;
}

/**
 * System — the controls page (Health is the status page). Security and
 * config flags, stats-cache tools, enrichment providers, RevCarData pilot.
 * No secret values are ever rendered — only set/missing.
 */
export function SystemView() {
  const q = useQuery({ queryKey: ["admin", "system"], queryFn: getAdminSystem });

  const cache = useMutation({
    mutationFn: () => clearAdminStatsCache(),
    onSuccess: (result) => {
      toast.success(`Cleared ${result.deleted} cache row(s)`);
      void q.refetch();
    },
    onError: (e: Error) => toast.error(e.message || "Cache clear failed"),
  });

  const revcar = useMutation({
    mutationFn: () => runRevcarDataPilot(),
    onSuccess: (result) => {
      toast.success(`RevCarData pilot: ${result.matched ?? 0}/${result.attempted ?? 0} matched. MSRP not applied to FMV.`);
      void q.refetch();
    },
    onError: (e: Error) => toast.error(e.message || "RevCarData pilot failed"),
  });

  return (
    <>
      <header>
        <h1 className="font-display text-[1.875rem] leading-[1.1] tracking-[-0.01em] text-foreground sm:text-[2.25rem]">System</h1>
        <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-5 text-label-2">
          Controls, not status — for live status see Health. Keys stay on the backend.
        </p>
      </header>

      {q.error ? <AdminErrorNote message="Couldn't load system info. Try again." onRetry={() => void q.refetch()} /> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminCard title="Security & config">
          {q.isLoading ? (
            <Skeleton className="mx-5 mb-5 h-40" />
          ) : q.data ? (
            <ul className="space-y-2 px-5 pb-5 text-footnote">
              {[
                ["Database", q.data.databaseOk ? "ok" : "down"],
                ["App access enforced", String(q.data.flags.appAccessEnforced)],
                ["Pro access enforced", String(q.data.flags.proAccessEnforced)],
                ["Admin API key", q.data.flags.adminApiKeyConfigured ? "set" : "missing"],
                ["Billing webhook", q.data.flags.billingWebhookConfigured ? "set" : "missing"],
                ["B2B API keys", q.data.flags.b2bKeysConfigured ? "set" : "missing"],
                ["Invite email (Resend)", q.data.flags.resendConfigured ? "set" : "missing"],
                ["Twilio WhatsApp", q.data.flags.twilioConfigured ? "set" : "missing"],
                ["Public app origin", q.data.flags.publicAppOrigin || "unset"],
              ].map(([label, value]) => (
                <li key={label} className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2">
                  <span className="text-label-2">{label}</span>
                  <span className="font-semibold text-foreground">{value}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </AdminCard>
        <AdminCard title="Ops tools" description="Clear the 1-hour market stats cache so summary / district endpoints recompute immediately after data changes.">
          <div className="px-5 pb-5">
            <Button type="button" className="mt-1 h-10 rounded-full" disabled={cache.isPending} onClick={() => cache.mutate()}>
              Clear stats cache
            </Button>
            {q.data?.statsCacheKeys?.length ? (
              <p className="mt-3 text-caption text-label-2">Keys: {q.data.statsCacheKeys.join(", ")}</p>
            ) : (
              <p className="mt-3 text-caption text-label-2">No cache rows currently.</p>
            )}
          </div>
        </AdminCard>
      </div>

      <AdminCard title="Enrichment providers" description="Third-party research adapters. A failed provider must never take down listing pages.">
        <div className="px-5 pb-5">
          {q.isLoading ? (
            <Skeleton className="h-32" />
          ) : q.data?.providers?.length ? (
            <ul className="grid gap-2 md:grid-cols-2">
              {q.data.providers.map((provider) => (
                <li key={provider.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2 text-footnote">
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground">{provider.label}</span>
                    <span className="block text-caption text-label-2">
                      {provider.lastRun?.endedAt ? `Last run ${new Date(provider.lastRun.endedAt).toLocaleString()}` : "No ingest run recorded"}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-foreground">{providerStatusLabel(provider)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-footnote text-label-2">Provider health unavailable.</p>
          )}
          <Button type="button" variant="outline" className="mt-4" disabled={revcar.isPending} onClick={() => revcar.mutate()}>
            {revcar.isPending ? "Running spec pilot…" : "Run RevCarData 100-record pilot"}
          </Button>
          <p className="mt-2 text-caption text-label-2">Match-rate sample only. Foreign MSRP is never written into LKR fair market value.</p>
        </div>
      </AdminCard>
    </>
  );
}
