import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Car, Inbox, MessageSquareText, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import {
  AdminCard,
  AdminCardLink,
  AdminDelta,
  AdminEmptyNote,
  AdminErrorNote,
  AdminKpiCard,
  AdminListSkeleton,
  AdminShare,
  AdminSkeleton,
  ADMIN_BLUE,
  adminCardClass,
  capitalise,
  formatCount,
  formatDay,
  formatRelative,
} from "@/components/admin/AdminKit";
import { AdminAvatar } from "@/components/admin/AdminKit";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { getAdminOverview, type AdminOverview } from "@/services/api";
import { getAdminLeads as getQueueLeads } from "@/lib/adminQueuesApi";

type Period = "7" | "30" | "90";

/** Sign-ups per day as a plain SVG area chart (no chart dependency). */
function SignupsChart({ daily }: { daily: Array<{ day: string; count: number }> }) {
  const W = 600;
  const H = 220;
  const PAD_L = 28;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 26;
  const max = Math.max(1, ...daily.map((d) => d.count));
  const x = (i: number) => PAD_L + (i / Math.max(1, daily.length - 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);
  const points = daily.map((d, i) => `${x(i)},${y(d.count)}`).join(" ");
  const area = daily.length
    ? `M ${x(0)},${y(daily[0].count)} ${daily.map((d, i) => `L ${x(i)},${y(d.count)}`).join(" ")} L ${x(daily.length - 1)},${H - PAD_B} L ${x(0)},${H - PAD_B} Z`
    : "";
  const labels = daily.length > 2 ? [0, Math.floor(daily.length / 2), daily.length - 1] : daily.map((_, i) => i);
  return (
    <div role="img" aria-label={`Sign-ups per day: ${daily.reduce((s, d) => s + d.count, 0)} in total`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full sm:h-64" preserveAspectRatio="none">
        <defs>
          <linearGradient id="admin-signups-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ADMIN_BLUE} stopOpacity="0.22" />
            <stop offset="100%" stopColor={ADMIN_BLUE} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((g) => {
          const gy = PAD_T + (g / 3) * (H - PAD_T - PAD_B);
          return <line key={g} x1={PAD_L} x2={W - PAD_R} y1={gy} y2={gy} stroke="#e7e7e1" strokeDasharray="3 3" strokeWidth="1" />;
        })}
        {area ? <path d={area} fill="url(#admin-signups-fill)" /> : null}
        {points ? <polyline points={points} fill="none" stroke={ADMIN_BLUE} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {labels.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#62635f">
            {formatDay(daily[i]?.day)}
          </text>
        ))}
        {[0, Math.ceil(max / 2), max].map((v) => (
          <text key={v} x={PAD_L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#62635f">
            {v}
          </text>
        ))}
      </svg>
    </div>
  );
}

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

function periodSeries(data: AdminOverview | undefined, period: Period): Array<{ day: string; count: number }> {
  const n = Number(period);
  const byDay = new Map((data?.signupsDaily ?? []).map((d) => [d.day, d.count]));
  const out: Array<{ day: string; count: number }> = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const day = d.toISOString().slice(0, 10);
    out.push({ day, count: byDay.get(day) ?? 0 });
  }
  return out;
}

export function OverviewView() {
  const overviewQuery = useQuery({ queryKey: ["admin", "overview"], queryFn: getAdminOverview, refetchInterval: 60_000 });
  const leadsQuery = useQuery({ queryKey: ["admin", "leads", "overview"], queryFn: () => getQueueLeads({}), staleTime: 30_000 });
  const [period, setPeriod] = useState<Period>("30");
  const data = overviewQuery.data;
  const series = useMemo(() => periodSeries(data, period), [data, period]);
  const periodTotal = series.reduce((s, d) => s + d.count, 0);
  const prevTotal = useMemo(() => {
    if (!data) return 0;
    const byDay = new Map((data.signupsDaily ?? []).map((d) => [d.day, d.count]));
    const n = Number(period);
    let sum = 0;
    const today = new Date();
    for (let i = n; i < n * 2; i += 1) {
      const day = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10);
      sum += byDay.get(day) ?? 0;
    }
    return sum;
  }, [data, period]);
  const new7 = periodSeries(data, "7").reduce((s, d) => s + d.count, 0);
  const recentLeads = useMemo(() => {
    const items = [...(leadsQuery.data?.items ?? [])];
    items.sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""));
    return items.slice(0, 5);
  }, [leadsQuery.data]);

  return (
    <>
      <header className="flex flex-col gap-1.5">
        <p className="text-[0.8125rem] font-medium text-label-2">
          {(() => {
            const now = new Date();
            const hour = Number(now.toLocaleString("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Colombo" }));
            const date = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Colombo" });
            return `${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"} · ${date}`;
          })()}
        </p>
        <h1 className="font-display text-[1.875rem] leading-[1.1] tracking-[-0.01em] text-foreground sm:text-[2.25rem]">Overview</h1>
      </header>

      {overviewQuery.error && !data ? (
        <AdminErrorNote message="Couldn't load the overview. Try again." onRetry={() => void overviewQuery.refetch()} />
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {data ? (
          <>
            <AdminKpiCard
              label="Users"
              icon={UsersRound}
              value={data.users.total}
              to="/motormila/admin/users"
              footer={<AdminDelta current={new7} previous={0} label="new this week" />}
            />
            <AdminKpiCard label="Active 7d" icon={Activity} value={data.users.active7} footer={<AdminShare part={data.users.active7} whole={data.users.total} />} />
            <AdminKpiCard label="Active 30d" icon={Activity} value={data.users.active30} footer={<AdminShare part={data.users.active30} whole={data.users.total} />} />
            <AdminKpiCard
              label="Live listings"
              icon={Car}
              value={data.listings.live}
              footer={<span className="text-[0.75rem] text-label-2">{formatCount(data.listings.total)} total scraped</span>}
            />
            <AdminKpiCard
              label="Pending moderation"
              icon={ShieldCheck}
              value={data.moderation?.pending}
              to="/motormila/admin/moderation"
              footer={<span className="text-[0.75rem] text-label-2">User ads waiting for review</span>}
            />
            <AdminKpiCard
              label="Open feedback"
              icon={MessageSquareText}
              value={data.feedback.open}
              to="/motormila/admin/feedback"
              footer={<span className="text-[0.75rem] text-label-2">{formatCount(data.users.admins)} admins on the platform</span>}
            />
          </>
        ) : (
          Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={cn(adminCardClass, "px-5 py-4")}>
              <AdminSkeleton className="h-3.5 w-24" />
              <AdminSkeleton className="mt-4 h-9 w-16" />
              <AdminSkeleton className="mt-4 h-4 w-28 rounded-full" />
            </div>
          ))
        )}
      </div>

      <section className={cn(adminCardClass, "px-5 pt-5 pb-4 sm:px-6")} aria-labelledby="signups-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="signups-title" className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground">Sign-ups</h2>
            <p className="mt-0.5 text-[0.75rem] text-label-2">New accounts per day, last {period} days</p>
            {data ? (
              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-display text-[2rem] leading-none tracking-[-0.02em] text-foreground tabular-nums">{periodTotal.toLocaleString("en-GB")}</span>
                <AdminDelta current={periodTotal} previous={prevTotal} label={`vs the ${period} days before`} />
              </div>
            ) : (
              <AdminSkeleton className="mt-3 h-8 w-40" />
            )}
          </div>
          <SegmentedControl
            aria-label="Sign-ups period"
            value={period}
            onValueChange={(v) => setPeriod(v as Period)}
            size="sm"
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
            ]}
            className="w-full sm:w-auto"
          />
        </div>
        <div className="relative mt-4">
          {data ? <SignupsChart daily={series} /> : <AdminSkeleton className="h-56 w-full rounded-xl sm:h-64" />}
          {data && periodTotal === 0 ? (
            <p className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-[0.8125rem] text-label-2">
              <span className="rounded-full border border-border bg-card/90 px-3 py-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">No sign-ups in the last {period} days yet</span>
            </p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <AdminCard title="Newest users" description="Latest accounts first" action={<AdminCardLink to="/motormila/admin/users">All users</AdminCardLink>}>
          {!data ? (
            <AdminListSkeleton rows={4} />
          ) : (data.recentUsers ?? []).length === 0 ? (
            <AdminEmptyNote icon={UserPlus} title="No users yet" body="Invited accounts appear here after they sign up." className="border-t border-border py-10" />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {(data.recentUsers ?? []).map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                  <AdminAvatar name={u.name || u.email || "?"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-medium text-foreground">{u.name || "Name not known yet"}</p>
                    <p className="truncate text-[0.75rem] text-label-2">{u.email}</p>
                  </div>
                  <span className="shrink-0 text-[0.75rem] text-label-2">{formatRelative(u.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>

        <AdminCard title="Recent leads" description="Finance, inspection and insurance requests" action={<AdminCardLink to="/motormila/admin/leads">All leads</AdminCardLink>}>
          {leadsQuery.isLoading ? (
            <AdminListSkeleton rows={4} />
          ) : recentLeads.length === 0 ? (
            <AdminEmptyNote icon={Inbox} title="No leads yet" body="Lead requests land here." className="border-t border-border py-10" />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {recentLeads.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-medium text-foreground">{l.name || "—"}</p>
                    <p className="truncate text-[0.75rem] text-label-2">
                      {capitalise(l.kind)} · {capitalise(String(l.status))} · {formatRelative(l.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>

        <AdminCard title="Recent feedback" description="From the in-app feedback widget" action={<AdminCardLink to="/motormila/admin/feedback">Inbox</AdminCardLink>}>
          {!data ? (
            <AdminListSkeleton rows={4} avatar={false} />
          ) : (data.recentFeedback ?? []).length === 0 ? (
            <AdminEmptyNote icon={MessageSquareText} title="No feedback yet" body="What people send from the app shows up here." className="border-t border-border py-10" />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {(data.recentFeedback ?? []).map((f) => (
                <li key={f.id} className="flex gap-3 px-5 py-3">
                  <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", f.status === "resolved" || f.status === "closed" ? "bg-zinc-300" : "bg-[#0A7AFF]")} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[0.8125rem] leading-5 text-foreground">{f.message}</p>
                    <p className="mt-0.5 text-[0.75rem] text-label-2">
                      {formatRelative(f.createdAt)}
                      {f.status === "resolved" || f.status === "closed" ? ` · ${capitalise(f.status)}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>

      {/* Retained from the old overview: market glance, top makes, recent scrapes */}
      <div className="grid gap-4 xl:grid-cols-2">
        <AdminCard title="Top makes · live" description="Live listings by make">
          {!data ? <AdminListSkeleton rows={5} avatar={false} /> : <div className="px-5 pb-5"><StatBars rows={(data.topMakes ?? []).map((r) => ({ label: r.make, count: r.count }))} /></div>}
        </AdminCard>
        <AdminCard title="Recent scrapes" description="Latest pipeline runs">
          {!data ? (
            <AdminListSkeleton rows={4} avatar={false} />
          ) : (data.recentScrapes ?? []).length === 0 ? (
            <AdminEmptyNote icon={Activity} title="No scrape runs yet" body="Runs appear here once the pipeline has run." className="border-t border-border py-10" />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {(data.recentScrapes ?? []).slice(0, 8).map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-[0.8125rem] font-medium text-foreground">{run.source}</p>
                    <p className="text-[0.75rem] text-label-2">
                      found {formatCount(run.listingsFound)} · new {formatCount(run.listingsNew)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[0.6875rem] font-medium text-label-2">{run.status || "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>
    </>
  );
}
