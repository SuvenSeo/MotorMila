import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { MonthlyMedianChart } from "@/components/pro/ProCharts";
import { ExportMenu } from "@/components/pro/ExportMenu";
import { RankBars } from "@/components/pro/RankBars";
import { detailReport, monthlyPoints } from "@/lib/proReportBuilders";
import { formatLkrCompact } from "@/lib/price";
import { formatRelativeTime } from "@/lib/formatting";
import { useAppPreferences } from "@/lib/appPreferences";
import type { ProDetailPayload } from "@/types/pro";

const KIND_LABEL: Record<string, string> = {
  vehicle_lane: "Vehicle lane",
  district: "Area",
  source: "Source",
  market: "Market",
  trend: "Trend",
  listing: "Listing",
};

/**
 * The drill-down: a lane, area or source opened without leaving the desk. The
 * table stays where it was, the sheet carries the series, the mix and the
 * comparables, and every one of them can leave as a report.
 */
export function DetailSheet({
  detail,
  open,
  onOpenChange,
}: {
  detail: ProDetailPayload | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useAppPreferences();
  const points = monthlyPoints(detail?.trend_points ?? []);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(46rem,96vw)] overflow-y-auto sm:max-w-[46rem]">
        {detail ? (
          <>
            <SheetHeader className="space-y-2 pr-8">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">{KIND_LABEL[detail.kind] ?? detail.kind}</Badge>
                <span className="text-caption text-label-3">{formatRelativeTime(detail.generated_at)}</span>
              </div>
              <SheetTitle className="text-title2 font-semibold tracking-tight">{detail.title}</SheetTitle>
              <SheetDescription className="text-footnote leading-relaxed text-label-2">{detail.summary}</SheetDescription>
            </SheetHeader>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ExportMenu report={detailReport(detail)} />
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-separator sm:grid-cols-4">
              {detail.metrics.map((metric) => (
                <div key={metric.label} className="bg-surface-1 p-3">
                  <dt className="tech-label text-label-3">{metric.label}</dt>
                  <dd className="mt-1.5 font-display text-title3 font-semibold leading-none tabular-nums text-foreground">{metric.value}</dd>
                  {metric.detail ? <dd className="mt-1 text-caption text-label-3">{metric.detail}</dd> : null}
                </div>
              ))}
            </dl>

            <section className="mt-6">
              <h3 className="tech-label mb-2 text-label-2">{t("pro.detail.trend", "Monthly median")}</h3>
              <div className="rounded-card border border-border bg-surface-1 p-3">
                {points.length > 2 ? (
                  <MonthlyMedianChart points={points} heightClass="h-64" />
                ) : (
                  <p className="py-8 text-center text-footnote text-label-3">
                    {t("pro.detail.noTrend", "History is not deep enough for this selection yet.")}
                  </p>
                )}
              </div>
            </section>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                { title: t("pro.detail.sourceMix", "Source mix"), rows: detail.source_mix },
                { title: t("pro.detail.districtMix", "Area mix"), rows: detail.district_mix },
              ]
                .filter((group) => group.rows.length > 0)
                .map((group) => (
                  <section key={group.title} className="rounded-card border border-border bg-surface-1 p-3">
                    <h3 className="tech-label mb-2 text-label-2">{group.title}</h3>
                    <RankBars
                      rows={group.rows.slice(0, 6).map((row) => ({
                        key: `${group.title}-${row.label}`,
                        label: row.label,
                        value: row.count,
                        valueLabel: `${row.share_pct.toFixed(0)}%`,
                        meta: row.avg_price_lkr ? `avg ${formatLkrCompact(row.avg_price_lkr)}` : undefined,
                      }))}
                    />
                  </section>
                ))}
            </div>

            {detail.sample_listings.length > 0 ? (
              <section className="mt-6">
                <h3 className="tech-label mb-2 text-label-2">{t("pro.detail.comparables", "Listed comparables")}</h3>
                <ul className="divide-y divide-separator rounded-card border border-border bg-surface-1">
                  {detail.sample_listings.map((listing) => (
                    <li key={listing.id}>
                      <Link
                        to={`/listing/${listing.id}`}
                        className="group flex items-center gap-3 px-3 py-2.5 no-underline transition-colors hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-footnote font-semibold text-foreground group-hover:text-primary">{listing.title}</span>
                          <span className="mt-0.5 block truncate text-caption text-label-3">
                            {listing.district || "Sri Lanka"} · {listing.source}
                            {listing.first_seen_at ? ` · ${formatRelativeTime(listing.first_seen_at)}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-footnote font-semibold tabular-nums text-foreground">{formatLkrCompact(listing.price_lkr)}</span>
                          {listing.deal_score != null ? (
                            <span className="block text-caption tabular-nums text-label-3">score {listing.deal_score.toFixed(1)}</span>
                          ) : null}
                        </span>
                        <ArrowUpRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-label-3 group-hover:text-primary" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-footnote text-label-3">{t("common.loading", "Loading…")}</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
