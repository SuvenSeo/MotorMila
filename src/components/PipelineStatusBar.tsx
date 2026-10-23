import { memo } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import { DataFreshnessIndicator } from "@/components/DataFreshnessIndicator";
import { PipelineJobStatus, PipelineStatusResponse } from "@/types/car";
import { formatRelativeTime } from "@/lib/formatting";

export interface PipelineSourceSnapshot {
  source: string;
  last_success?: string | null;
  status?: string | null;
}

interface PipelineStatusBarProps {
  status: PipelineStatusResponse | null;
  latestListingAt?: string | null;
  lastUpdated?: string | null;
  /** Data-snapshot generation time → renders "Snapshot age …". */
  snapshotAt?: string | null;
  /** Direct snapshot age override (ms); wins over snapshotAt. Mock-friendly. */
  snapshotAgeMs?: number | null;
  /** Per-source last_success rows; defaults to status jobs when omitted. */
  sources?: PipelineSourceSnapshot[] | null;
  /** Age after which a source gets the stale badge. Default 24h. */
  staleSourceAfterMs?: number;
  /** Injectable clock for deterministic stories/tests. */
  now?: Date;
}

const DEFAULT_STALE_SOURCE_AFTER_MS = 24 * 60 * 60 * 1000;

function resolveSnapshotIso(
  snapshotAt: string | null | undefined,
  snapshotAgeMs: number | null | undefined,
  now: Date,
): string | null {
  if (snapshotAgeMs !== null && snapshotAgeMs !== undefined) {
    return new Date(now.getTime() - Math.max(0, snapshotAgeMs)).toISOString();
  }
  return snapshotAt ?? null;
}

function isSourceStale(
  lastSuccess: string | null | undefined,
  now: Date,
  thresholdMs: number,
): boolean {
  if (!lastSuccess) return true;
  const parsed = new Date(lastSuccess);
  if (Number.isNaN(parsed.getTime())) return true;
  return now.getTime() - parsed.getTime() > thresholdMs;
}

const JOB_LABELS: Record<string, string> = {
  scrape_ikman: "Ikman",
  scrape_riyasewana: "Riyasewana",
  scrape_autolanka: "AutoLanka",
  scrape_auto_lanka_site: "AutoLanka Site",
  scrape_autodirect: "AutoDirect",
  scrape_autostream: "AutoStream",
  scrape_patpat: "Patpat",
  scrape_carshop: "Carshop",
  scrape_saleme: "SaleMe",
  scrape_riyahub: "Riyahub",
  scrape_dimo: "Cars at DIMO",
  compute_aggregates: "Aggregates",
  clean_listings: "Cleaner",
};

function prettifyJobName(name: string): string {
  return JOB_LABELS[name] || name.replace(/^scrape_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function activityLabel(job: PipelineJobStatus): string {
  if (job.status === "running") {
    return "Running now";
  }
  if (job.last_success) {
    return `Last success ${formatRelativeTime(job.last_success)}`;
  }
  if (job.last_run) {
    return `Last run ${formatRelativeTime(job.last_run)}`;
  }
  return "Awaiting first run";
}

function statusColor(status: "ok" | "running" | "delayed") {
  if (status === "ok") return "#d89b35";
  if (status === "running") return "#f59e0b";
  return "#ef4444";
}

function statusIcon(status: "ok" | "running" | "delayed") {
  if (status === "ok") return CheckCircle2;
  if (status === "running") return Loader2;
  return AlertTriangle;
}

export const PipelineStatusBar = memo(function PipelineStatusBar({
  status,
  latestListingAt,
  lastUpdated,
  snapshotAt,
  snapshotAgeMs,
  sources,
  staleSourceAfterMs = DEFAULT_STALE_SOURCE_AFTER_MS,
  now,
}: PipelineStatusBarProps) {
  const jobs = status?.jobs ?? [];
  const effectiveNow = now ?? new Date();
  const snapshotIso = resolveSnapshotIso(snapshotAt, snapshotAgeMs, effectiveNow);
  const sourceRows: PipelineSourceSnapshot[] =
    sources ??
    jobs.map((job) => ({
      source: prettifyJobName(job.name),
      last_success: job.last_success,
      status: job.status,
    }));
  const overall = status?.overall_status ?? "delayed";
  const loading = !status;
  const overallLabel = overall === "ok" ? "Healthy" : overall === "running" ? "Running" : "Delayed";
  const overallMessage =
    overall === "ok"
      ? "All monitored jobs are within expected cadence."
      : overall === "running"
        ? "Pipeline jobs are actively executing now."
        : "At least one job is delayed or requires attention.";
  const generatedLabel = status?.generated_at ? formatRelativeTime(status.generated_at) : "unknown";
  const healthyJobs = jobs.filter((job) => job.status === "ok").length;
  const runningJobs = jobs.filter((job) => job.status === "running").length;
  const delayedJobs = jobs.filter((job) => job.status === "delayed").length;

  return (
    <div className="console-section overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full shadow-e1" style={{ backgroundColor: statusColor(overall) }} />
          <span className="tech-label text-muted-foreground">Data Pipeline</span>
          <span className="status-chip px-2.5 py-1">
            {overallLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 tech-label">
          <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-primary-bright num">{healthyJobs} healthy</span>
          <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-primary-bright num">{runningJobs} running</span>
          <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-primary-bright num">{delayedJobs} delayed</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-6 py-3">
        <p className="ui-caption">{overallMessage}</p>
        <div className="flex flex-wrap items-center gap-3">
          <DataFreshnessIndicator latestListingAt={latestListingAt} lastUpdated={lastUpdated} />
          <p className="tech-label text-muted-foreground">Pipeline refreshed {generatedLabel}</p>
          {snapshotIso ? (
            <p
              className="tech-label text-muted-foreground"
              title={snapshotIso}
              aria-label={`Snapshot age ${formatRelativeTime(snapshotIso, effectiveNow)}`}
            >
              Snapshot age {formatRelativeTime(snapshotIso, effectiveNow)}
            </p>
          ) : null}
        </div>
      </div>

      {loading || sourceRows.length === 0 ? null : (
        <div className="border-b border-border px-6 py-3">
          <p className="tech-label text-muted-foreground mb-2">Source freshness</p>
          <ul className="flex flex-wrap items-center gap-2" aria-label="Per-source freshness">
            {sourceRows.map((row) => {
              const stale = isSourceStale(row.last_success, effectiveNow, staleSourceAfterMs);
              return (
                <li
                  key={row.source}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1"
                  title={row.last_success ? `Last success ${row.last_success}` : "Never synced"}
                >
                  <span className="tech-label text-foreground">{row.source}</span>
                  <span className="tech-label text-muted-foreground">
                    {row.last_success
                      ? formatRelativeTime(row.last_success, effectiveNow)
                      : "never synced"}
                  </span>
                  {stale ? (
                    <span className="rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-caption font-medium text-primary-bright">
                      stale
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="p-5 sm:p-6">
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="data-card p-4">
                <div className="skeleton-shimmer mb-3 h-2.5 w-24 rounded" />
                <div className="skeleton-shimmer mb-2 h-2 w-32 rounded" />
                <div className="skeleton-shimmer h-2 w-20 rounded" />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="console-empty px-5 py-4 ui-caption">
            No pipeline jobs have reported yet.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job) => {
              const Icon = statusIcon(job.status);
              const color = statusColor(job.status);
              return (
                <article key={job.name} className="data-card space-y-3 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${job.status === "running" ? "animate-spin" : ""}`}
                        style={{ color }}
                      />
                      <p className="text-footnote font-semibold text-foreground truncate">{prettifyJobName(job.name)}</p>
                    </div>
                    <span className="tech-label rounded-full border border-border bg-card px-2 py-1 text-foreground">
                      {job.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 ui-caption">
                    <Clock3 className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{activityLabel(job)}</span>
                  </div>

                  {job.last_status && (
                    <p className="tech-label text-muted-foreground">
                      Last result: {String(job.last_status).toLowerCase()}
                    </p>
                  )}

                  {job.last_error && (
                    <p className="ui-caption text-primary/90 leading-relaxed line-clamp-2" title={job.last_error}>
                      {job.last_error}
                    </p>
                  )}
                </article>
              );
            })}
            </div>
        )}
      </div>
    </div>
  );
});

PipelineStatusBar.displayName = "PipelineStatusBar";
