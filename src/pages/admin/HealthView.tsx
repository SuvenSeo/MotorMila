import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Database, GitCommitHorizontal, Globe2, RefreshCw, Server, ShieldCheck, type LucideIcon } from "lucide-react";
import {
  AdminCard,
  AdminEmptyNote,
  AdminErrorNote,
  AdminHeader,
  AdminStatusDot,
  formatRelative,
  formatWhen,
  type AdminDotTone,
} from "@/components/admin/AdminKit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminHealth, API_BASE } from "@/services/api";
import { cn } from "@/lib/utils";

type PublicHealth = {
  status?: string;
  db?: string;
  mode?: string;
  failover?: boolean;
  primary_status?: string;
  failover_source?: string;
};

function Row({
  icon: Icon,
  label,
  tone,
  status,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  tone: AdminDotTone;
  status: string;
  detail: ReactNode;
}) {
  return (
    <li className="flex items-center gap-4 px-5 py-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-label-2">
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.875rem] font-medium text-foreground">{label}</p>
        <p className="mt-0.5 truncate text-[0.8125rem] text-label-2">{detail}</p>
      </div>
      <span className="flex shrink-0 items-center gap-2 text-[0.8125rem] font-medium text-foreground">
        <AdminStatusDot tone={tone} />
        {status}
      </span>
    </li>
  );
}

function cacheAge(refreshedAt?: string | null): string {
  if (!refreshedAt) return "never refreshed";
  const mins = Math.round((Date.now() - Date.parse(refreshedAt)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/**
 * Health — the status page (System is the controls page). Live checks:
 * admin database, public API health (including failover mode), live
 * listings, last scrape, failed scrapes in 24h, stats-cache freshness,
 * and recent scrape errors (message text only, truncated).
 *
 * Deliberately absent: a deployed version/commit — the app bundle does
 * not carry one, so it renders as "—" instead of an invented value.
 * Listing-OG / sitemap / canonical checks are not a backend check the
 * API can run on itself; they are verified from the public site (see
 * the note under the checks) rather than faked here.
 */
export function HealthView() {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const q = useQuery({ queryKey: ["admin", "health"], queryFn: getAdminHealth });
  const pubQ = useQuery({
    queryKey: ["admin", "public-health"],
    queryFn: async (): Promise<PublicHealth> => {
      const res = await fetch(`${API_BASE}/health`);
      if (!res.ok) throw new Error(`Public health check failed (${res.status})`);
      return (await res.json()) as PublicHealth;
    },
  });

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      void q.refetch();
      void pubQ.refetch();
    }, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, q, pubQ]);

  const data = q.data;
  const pub = pubQ.data;

  return (
    <>
      <AdminHeader
        title="Health"
        description="The services Motormila depends on, checked live when this page opens."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoRefresh((v) => !v)}
              aria-pressed={autoRefresh}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                autoRefresh ? "border-[#0A7AFF]/30 bg-[#0A7AFF]/10 text-[#0A7AFF]" : "border-border bg-card text-label-2 hover:border-black/20",
              )}
            >
              <AdminStatusDot tone={autoRefresh ? "ok" : "idle"} className="size-2" />
              Live refresh {autoRefresh ? "on (30s)" : "off"}
            </button>
            <Button type="button" variant="outline" className="h-9 rounded-full px-3.5" onClick={() => { void q.refetch(); void pubQ.refetch(); }} disabled={q.isLoading}>
              <RefreshCw className={cn("size-3.5", q.isLoading && "animate-spin")} /> Refresh
            </Button>
          </div>
        }
      />

      {q.error && !data ? <AdminErrorNote message="Couldn't load health. Try again." onRetry={() => void q.refetch()} /> : null}
      {pubQ.error && !pub ? <AdminErrorNote message="Public API health check failed — the API may be down even if the admin database answers." /> : null}

      <AdminCard title="Services">
        {!data ? (
          <div className="space-y-2 px-5 py-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            <Row
              icon={Database}
              label="Admin database"
              tone={data.databaseOk ? "ok" : "bad"}
              status={data.databaseOk ? "Connected" : "Down"}
              detail={data.databaseOk ? "Admin queries are answering." : "Admin queries are failing — check the backend database."}
            />
            <Row
              icon={Server}
              label="Public API"
              tone={!pub ? "idle" : pub.mode === "failover" ? "warn" : "ok"}
              status={!pub ? "Unknown" : pub.mode === "failover" ? "Failover" : pub.status || "OK"}
              detail={
                !pub
                  ? "Public health endpoint did not answer."
                  : pub.mode === "failover"
                    ? `Running on the fallback database (${pub.failover_source || "snapshot"}); primary: ${pub.primary_status || "unknown"}`
                    : `Primary database: ${pub.primary_status || pub.db || "ok"}`
              }
            />
            <Row
              icon={Globe2}
              label="Live listings"
              tone="ok"
              status={data.liveListings.toLocaleString()}
              detail="Listings currently visible in the market."
            />
            <Row
              icon={Activity}
              label="Last scrape"
              tone={!data.lastScrape ? "idle" : data.lastScrape.status === "FAILED" ? "bad" : "ok"}
              status={!data.lastScrape ? "No runs yet" : data.lastScrape.status || "—"}
              detail={
                !data.lastScrape
                  ? "No scrape runs recorded."
                  : `${data.lastScrape.source} · ${formatRelative(data.lastScrape.startedAt)} · found ${data.lastScrape.listingsFound}, new ${data.lastScrape.listingsNew}`
              }
            />
            <Row
              icon={ShieldCheck}
              label="Failed scrapes · 24h"
              tone={data.failedScrapes24h > 0 ? "warn" : "ok"}
              status={data.failedScrapes24h === 0 ? "None" : `${data.failedScrapes24h} failed`}
              detail="Scrape runs that ended FAILED in the last 24 hours."
            />
            <Row
              icon={GitCommitHorizontal}
              label="Deployed version"
              tone="idle"
              status="—"
              detail="The app bundle does not expose a version or commit id, so none is shown here."
            />
          </ul>
        )}
      </AdminCard>

      <AdminCard title="Stats cache freshness" description="Market stats are cached for 1 hour; System clears them.">
        {!data ? (
          <div className="space-y-2 px-5 py-4"><Skeleton className="h-10" /></div>
        ) : data.statsCache.length === 0 ? (
          <AdminEmptyNote icon={Database} title="No cache rows." body="Stats recompute on demand when the cache is empty." className="border-t border-border py-8" />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {data.statsCache.map((row) => (
              <li key={row.key} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="font-mono text-[0.8125rem] text-foreground">{row.key}</span>
                <span className="text-[0.75rem] text-label-2" title={formatWhen(row.refreshedAt)}>
                  refreshed {cacheAge(row.refreshedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard title="Recent errors" description="Failed scrape runs, message text only (truncated). Full runs live on Logs.">
        {!data ? (
          <div className="space-y-2 px-5 py-4"><Skeleton className="h-10" /></div>
        ) : data.recentErrors.length === 0 ? (
          <AdminEmptyNote icon={Activity} title="No recent errors." body="No failed scrape runs in the recent history." className="border-t border-border py-8" />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {data.recentErrors.map((err) => (
              <li key={err.id} className="flex items-center gap-3 px-5 py-3">
                <AdminStatusDot tone="bad" />
                <span className="shrink-0 font-mono text-[0.75rem] text-foreground">{err.source}</span>
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-label-2">{err.errorMessage || "No error message recorded"}</span>
                <span className="shrink-0 text-[0.75rem] text-label-2">{formatRelative(err.startedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <p className="text-[0.75rem] leading-5 text-label-2">
        Listing-OG, sitemap and canonical checks are public-site checks, not backend self-checks: verify them on
        motormila.pages.dev (a listing page's OG preview, /sitemap.xml, and a page canonical) rather than from this
        panel. They are not rendered here because the backend cannot honestly check its own public edge.
      </p>
    </>
  );
}
