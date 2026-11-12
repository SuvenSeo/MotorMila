import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, Database, Users } from "lucide-react";
import {
  AdminCard,
  AdminEmptyNote,
  AdminErrorNote,
  AdminKpiCard,
  AdminSkeleton,
  ADMIN_BLUE,
  adminCardClass,
} from "@/components/admin/AdminKit";
import { getAdminAnalytics } from "@/services/api";
import { cn } from "@/lib/utils";

function StatBars({ rows }: { rows: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (rows.length === 0) return <p className="text-[13px] text-label-2">No data yet.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
            <span className="truncate font-medium text-foreground">{row.label}</span>
            <span className="text-label-2 tabular-nums">{row.count.toLocaleString()}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${(row.count / max) * 100}%`, background: ADMIN_BLUE }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) <= 0) return "—";
  return `Rs ${Math.round(Number(value)).toLocaleString()}`;
}

function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString();
}

/**
 * Analytics — the existing /admin/analytics payload, in the CeyFi
 * usage-view shape: KPI tiles on top, distribution bars below. Every
 * distribution the endpoint returns is shown (the old tab showed only
 * three of them).
 */
export function AnalyticsView() {
  const q = useQuery({ queryKey: ["admin", "analytics"], queryFn: getAdminAnalytics });
  const a = q.data;

  return (
    <>
      <header>
        <h1 className="font-display text-[1.875rem] leading-[1.1] tracking-[-0.01em] text-foreground sm:text-[2.25rem]">Analytics</h1>
        <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-5 text-label-2">
          Listings, users, alerts, signals and scrape outcomes across the platform.
        </p>
      </header>

      {q.error && !a ? (
        <AdminErrorNote message="Couldn't load analytics. Try again." onRetry={() => void q.refetch()} />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {a ? (
          <>
            <AdminKpiCard
              label="Avg listing price"
              icon={BarChart3}
              value={null}
              footer={<span className="text-[0.875rem] font-semibold text-foreground">{formatPrice(a.listings.avgPriceLkr)}</span>}
            />
            <AdminKpiCard
              label="Signups today"
              icon={Users}
              value={a.users.signupsToday}
              footer={<span className="text-[0.75rem] text-label-2">{formatCount(a.users.neverLoggedIn)} never logged in</span>}
            />
            <AdminKpiCard
              label="Active alerts"
              icon={Activity}
              value={a.alerts.active}
              footer={<span className="text-[0.75rem] text-label-2">{formatCount(a.alerts.withWhatsapp)} with WhatsApp</span>}
            />
            <AdminKpiCard
              label="Scrape outcomes"
              icon={Database}
              value={null}
              footer={
                <span className="text-[0.875rem] font-semibold text-foreground">
                  {formatCount(a.scrapes.success)} ok / {formatCount(a.scrapes.failed)} fail
                </span>
              }
            />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={cn(adminCardClass, "px-5 py-4")}>
              <AdminSkeleton className="h-3.5 w-24" />
              <AdminSkeleton className="mt-4 h-9 w-16" />
              <AdminSkeleton className="mt-4 h-4 w-28 rounded-full" />
            </div>
          ))
        )}
      </div>

      {a ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <AdminCard title="Listings by source">
            <div className="px-5 pb-5"><StatBars rows={a.listings.bySource.map((r) => ({ label: r.source, count: r.count }))} /></div>
          </AdminCard>
          <AdminCard title="Listings by district">
            <div className="px-5 pb-5"><StatBars rows={a.listings.byDistrict.map((r) => ({ label: r.district, count: r.count }))} /></div>
          </AdminCard>
          <AdminCard title="Users by plan">
            <div className="px-5 pb-5"><StatBars rows={a.users.byPlan.map((r) => ({ label: r.plan, count: r.count }))} /></div>
          </AdminCard>
          <AdminCard title="Users by subscription">
            <div className="px-5 pb-5"><StatBars rows={a.users.bySubscription.map((r) => ({ label: r.status, count: r.count }))} /></div>
          </AdminCard>
          <AdminCard title="Market signals by source">
            <div className="px-5 pb-5"><StatBars rows={a.signals.bySource.map((r) => ({ label: r.source, count: r.count }))} /></div>
          </AdminCard>
          <AdminCard title="Invites · Feedback · Dealers">
            <div className="space-y-5 px-5 pb-5">
              <div>
                <p className="mb-2 text-[0.75rem] font-semibold text-label-2 uppercase tracking-wide">Invites</p>
                <StatBars rows={a.invites.map((r) => ({ label: r.status, count: r.count }))} />
              </div>
              <div>
                <p className="mb-2 text-[0.75rem] font-semibold text-label-2 uppercase tracking-wide">Feedback</p>
                <StatBars rows={a.feedback.map((r) => ({ label: r.status, count: r.count }))} />
              </div>
              <div>
                <p className="mb-2 text-[0.75rem] font-semibold text-label-2 uppercase tracking-wide">Dealers</p>
                <StatBars rows={a.dealers.map((r) => ({ label: r.status, count: r.count }))} />
              </div>
            </div>
          </AdminCard>
        </div>
      ) : q.isLoading ? null : (
        <AdminEmptyNote icon={BarChart3} title="Analytics unavailable." />
      )}
    </>
  );
}
