import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, Database, Users } from "lucide-react";
import {
  AdminCard,
  AdminEmptyNote,
  AdminErrorNote,
  AdminKpiCard,
  AdminSkeleton,
  AdminStatBars,
  adminCardClass,
} from "@/components/admin/AdminKit";
import { getAdminAnalytics } from "@/services/api";
import { cn } from "@/lib/utils";

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
        <h1 className="font-display text-title1 leading-[1.1] tracking-[-0.01em] text-foreground sm:text-large">Analytics</h1>
        <p className="mt-1.5 max-w-2xl text-body leading-5 text-label-2">
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
              value={formatPrice(a.listings.avgPriceLkr)}
              footer={
                <span className="text-caption text-label-2">
                  Range {formatPrice(a.listings.minPriceLkr)} – {formatPrice(a.listings.maxPriceLkr)}
                </span>
              }
            />
            <AdminKpiCard
              label="Signups today"
              icon={Users}
              value={a.users.signupsToday}
              footer={<span className="text-caption text-label-2">{formatCount(a.users.neverLoggedIn)} never logged in</span>}
            />
            <AdminKpiCard
              label="Active alerts"
              icon={Activity}
              value={a.alerts.active}
              footer={<span className="text-caption text-label-2">{formatCount(a.alerts.withWhatsapp)} with WhatsApp</span>}
            />
            <AdminKpiCard
              label="Scrape outcomes"
              icon={Database}
              value={`${formatCount(a.scrapes.success)} ok`}
              footer={
                <span className="text-caption text-label-2">
                  {formatCount(a.scrapes.failed)} failed runs
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
            <div className="px-5 pb-5"><AdminStatBars rows={a.listings.bySource.map((r) => ({ label: r.source, count: r.count }))} /></div>
          </AdminCard>
          <AdminCard title="Listings by district">
            <div className="px-5 pb-5"><AdminStatBars rows={a.listings.byDistrict.map((r) => ({ label: r.district, count: r.count }))} /></div>
          </AdminCard>
          <AdminCard title="Users by plan">
            <div className="px-5 pb-5"><AdminStatBars rows={a.users.byPlan.map((r) => ({ label: r.plan, count: r.count }))} /></div>
          </AdminCard>
          <AdminCard title="Users by subscription">
            <div className="px-5 pb-5"><AdminStatBars rows={a.users.bySubscription.map((r) => ({ label: r.status, count: r.count }))} /></div>
          </AdminCard>
          <AdminCard title="Market signals by source">
            <div className="px-5 pb-5"><AdminStatBars rows={a.signals.bySource.map((r) => ({ label: r.source, count: r.count }))} /></div>
          </AdminCard>
          <AdminCard title="Invites · Feedback · Dealers">
            <div className="space-y-5 px-5 pb-5">
              <div>
                <p className="mb-2 text-caption font-semibold text-label-2 uppercase tracking-wide">Invites</p>
                <AdminStatBars rows={a.invites.map((r) => ({ label: r.status, count: r.count }))} />
              </div>
              <div>
                <p className="mb-2 text-caption font-semibold text-label-2 uppercase tracking-wide">Feedback</p>
                <AdminStatBars rows={a.feedback.map((r) => ({ label: r.status, count: r.count }))} />
              </div>
              <div>
                <p className="mb-2 text-caption font-semibold text-label-2 uppercase tracking-wide">Dealers</p>
                <AdminStatBars rows={a.dealers.map((r) => ({ label: r.status, count: r.count }))} />
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
