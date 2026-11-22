import { useMemo } from "react";
import { Database, ShieldCheck } from "lucide-react";
import { DeskSection, Figure, Panel } from "@/components/pro/Panel";
import { StatPill } from "@/components/pro/DeltaChip";
import { HeatGrid, type HeatCell, type HeatRow } from "@/components/pro/HeatGrid";
import { RankBars } from "@/components/pro/RankBars";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/formatting";
import { formatLkrCompact } from "@/lib/price";
import { daysSince } from "@/lib/proAnalytics";
import { useAppPreferences } from "@/lib/appPreferences";
import type { SourceQualityResponse } from "@/types/car";
import type { ProBreakdownPoint, ProDistrictProfile, ProMarketSnapshot } from "@/types/pro";

const SOURCE_LABELS: Record<string, string> = {
  ikman: "Ikman",
  riyasewana: "Riyasewana",
  autolanka: "AutoLanka",
  autodirect: "AutoDirect",
  patpat: "Patpat",
  autostream: "AutoStream",
  carshop: "Carshop",
  saleme: "SaleMe",
  riyahub: "Riyahub",
  dimo: "Cars at DIMO",
};

/** Display name for a source id, preferring the pipeline's own coverage label. */
function labelFor(source: string, coverage: ProBreakdownPoint[]): string {
  const match = coverage.find((item) => item.label.toLowerCase().startsWith(source.toLowerCase()));
  if (match) return match.label;
  return SOURCE_LABELS[source.toLowerCase()] ?? source;
}

function RateCell({ value, invert = false }: { value: number; invert?: boolean }) {
  const pct = Math.round(value * 100);
  const good = invert ? pct <= 5 : pct >= 90;
  const poor = invert ? pct >= 15 : pct <= 60;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-surface-3 sm:block" aria-hidden>
        <span
          className={good ? "block h-full rounded-full bg-deal-good" : poor ? "block h-full rounded-full bg-deal-high" : "block h-full rounded-full bg-primary"}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </span>
      <span className="text-footnote font-semibold tabular-nums text-foreground">{pct}%</span>
    </span>
  );
}

/**
 * Sources — the trust page. A paid market dataset is only worth what its supply
 * chain is worth, so the fill rate, freshness and error rates are the product,
 * not a footnote. The district × source grid shows where a single pipeline
 * carrying a district could hide a blind spot in the total.
 */
export function SourcesMode({
  snapshot,
  quality,
  districts,
  loading,
  onOpenSource,
}: {
  snapshot: ProMarketSnapshot | null;
  quality: SourceQualityResponse | null;
  districts: ProDistrictProfile[];
  loading: boolean;
  onOpenSource: (source: ProBreakdownPoint) => void;
}) {
  const { t } = useAppPreferences();
  const coverage = useMemo(() => snapshot?.source_coverage ?? [], [snapshot]);

  const totals = useMemo(() => {
    const rows = quality?.sources ?? [];
    const listings = rows.reduce((sum, row) => sum + row.listing_count, 0);
    const weighted = (key: "price_fill_rate" | "fresh_24h_pct" | "outlier_rate" | "duplicate_rate") =>
      listings > 0 ? rows.reduce((sum, row) => sum + row[key] * row.listing_count, 0) / listings : null;
    return {
      listings,
      fill: weighted("price_fill_rate"),
      fresh: weighted("fresh_24h_pct"),
      outliers: weighted("outlier_rate"),
      duplicates: weighted("duplicate_rate"),
      sources: rows.length,
    };
  }, [quality]);

  const heat = useMemo(() => {
    const sourceKeys = (quality?.sources ?? []).map((row) => row.source).slice(0, 8);
    const columns = sourceKeys.map((key) => ({ key, label: labelFor(key, coverage) }));
    const topDistricts = [...districts].sort((a, b) => b.listing_count - a.listing_count).slice(0, 10);
    const rows: HeatRow[] = topDistricts.map((district) => ({ key: district.district, label: district.district }));
    const cells: Record<string, HeatCell> = {};
    let max = 0;
    for (const district of topDistricts) {
      const top = Math.max(1, ...district.source_mix.map((item) => item.share_pct));
      max = Math.max(max, top);
      for (const column of columns) {
        const match = district.source_mix.find((item) => labelFor(column.key, coverage) === item.label || item.label.toLowerCase().startsWith(column.key.toLowerCase()));
        if (!match) {
          cells[`${district.district}|${column.key}`] = { value: null, label: `${district.district} · ${column.label}: no coverage` };
          continue;
        }
        cells[`${district.district}|${column.key}`] = {
          value: Math.min(1, match.share_pct / 100),
          label: `${district.district} · ${column.label}: ${match.share_pct.toFixed(1)}% (${match.count.toLocaleString("en-US")} listings)`,
        };
      }
    }
    return { rows, columns, cells };
  }, [districts, quality, coverage]);

  const stale = (quality?.sources ?? []).filter((row) => row.fresh_24h_pct < 0.25).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Panel
          label={t("pro.src.priced", "Price fill rate")}
          value={<Figure size="sm" tone={totals.fill != null && totals.fill < 0.9 ? "default" : "primary"}>{totals.fill != null ? `${Math.round(totals.fill * 100)}%` : "—"}</Figure>}
          hint={t("pro.src.pricedHint", "Share of listings that carry a usable price, weighted by source volume")}
          className="rounded-card border border-border"
        />
        <Panel
          label={t("pro.src.fresh", "Seen in 24h")}
          value={<Figure size="sm">{totals.fresh != null ? `${Math.round(totals.fresh * 100)}%` : "—"}</Figure>}
          hint={t("pro.src.freshHint", "Listings confirmed live in the last day. A falling number means a source is drifting.")}
          className="rounded-card border border-border"
          footer={stale > 0 ? <StatPill tone="bad">{t("pro.src.staleSources", "{n} sources under 25%", { n: String(stale) })}</StatPill> : undefined}
        />
        <Panel
          label={t("pro.src.outliers", "Outlier rate")}
          value={<Figure size="sm">{totals.outliers != null ? `${(totals.outliers * 100).toFixed(1)}%` : "—"}</Figure>}
          hint={t("pro.src.outliersHint", "Rows excluded from every median because they look like a unit or listing error")}
          className="rounded-card border border-border"
        />
        <Panel
          label={t("pro.src.duplicates", "Duplicate rate")}
          value={<Figure size="sm">{totals.duplicates != null ? `${(totals.duplicates * 100).toFixed(1)}%` : "—"}</Figure>}
          hint={t("pro.src.duplicatesHint", "The same vehicle listed twice, merged so it is not counted twice")}
          className="rounded-card border border-border"
          footer={<span className="inline-flex items-center gap-1"><Database aria-hidden className="h-3 w-3" />{totals.listings.toLocaleString("en-US")} {t("pro.src.tracked", "tracked listings")}</span>}
        />
      </div>

      <DeskSection
        label={t("pro.section.quality", "01 · Pipeline")}
        id="pro-source-quality"
        title={t("pro.src.title", "Source quality")}
        body={t(
          "pro.src.body",
          "Every number in this workspace inherits these rates. Fill rate decides how much of the market is visible; freshness decides how current it is; outliers and duplicates decide how much of it lies.",
        )}
      >
        <div className="rounded-card border border-border bg-surface-1">
          {loading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} shape="text" className="h-9" />
              ))}
            </div>
          ) : (quality?.sources?.length ?? 0) === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title={t("pro.src.empty", "Quality metrics are not available")}
              body={t("pro.src.emptyBody", "They appear once the pipeline has completed a scan for each source.")}
              className="py-12"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-left">
                <caption className="sr-only">{t("pro.src.caption", "Pipeline quality by source")}</caption>
                <thead>
                  <tr className="text-caption text-label-3">
                    <th scope="col" className="border-b border-separator px-3 py-2 font-medium">{t("pro.col.source", "Source")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.col.listings", "Listings")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.src.pricedCol", "Priced")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.src.freshShort", "Seen 24h")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.src.outliersCol", "Outliers")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.src.duplicatesCol", "Duplicates")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(quality?.sources ?? []).map((row) => {
                    const coverageRow = coverage.find((item) => labelFor(row.source, coverage) === item.label);
                    const age = daysSince(coverageRow?.latest_seen_at ?? null);
                    return (
                      <tr key={row.source} className="transition-colors hover:bg-surface-2/70">
                        <th scope="row" className="border-b border-separator px-3 py-2 text-left">
                          <button
                            type="button"
                            onClick={() => coverageRow && onOpenSource(coverageRow)}
                            className="text-left text-footnote font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {labelFor(row.source, coverage)}
                          </button>
                          <span className="mt-0.5 block text-caption text-label-3">
                            {age == null ? "—" : age === 0 ? t("pro.src.today", "updated today") : t("pro.src.lastSeen", "last seen {when}", { when: formatRelativeTime(coverageRow?.latest_seen_at) })}
                          </span>
                        </th>
                        <td className="border-b border-separator px-3 py-2 text-right text-footnote font-semibold tabular-nums text-foreground">
                          {row.listing_count.toLocaleString("en-US")}
                        </td>
                        <td className="border-b border-separator px-3 py-2 text-right">
                          <RateCell value={row.price_fill_rate} />
                        </td>
                        <td className="border-b border-separator px-3 py-2 text-right">
                          <RateCell value={row.fresh_24h_pct} />
                        </td>
                        <td className="border-b border-separator px-3 py-2 text-right">
                          <RateCell value={row.outlier_rate} invert />
                        </td>
                        <td className="border-b border-separator px-3 py-2 text-right">
                          <RateCell value={row.duplicate_rate} invert />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DeskSection>

      <div className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel
          label={t("pro.src.mix", "Share of market")}
          meta={t("pro.src.mixMeta", "of priced listings")}
          hint={t("pro.src.mixHint", "A source above half the market is a single point of failure for every median on this desk.")}
          className="rounded-card border border-border"
          flush
          footer={coverage[0] ? <span>{t("pro.src.mixFooter", "{name} carries {share}% of priced stock", { name: coverage[0].label, share: coverage[0].share_pct.toFixed(1) })}</span> : undefined}
        >
          <RankBars
            rows={coverage.map((source) => ({
              key: source.label,
              label: source.label,
              value: source.count,
              valueLabel: `${source.share_pct.toFixed(0)}%`,
              meta: `${formatLkrCompact(source.avg_price_lkr)} ${t("pro.src.avg", "avg ask")}`,
            }))}
            className="px-4 pb-1"
            emptyLabel={t("pro.src.empty", "Quality metrics are not available")}
          />
        </Panel>

        <Panel
          label={t("pro.src.grid", "Coverage by district")}
          meta={t("pro.src.gridMeta", "share of a district's stock, per source")}
          hint={t("pro.src.gridHint", "An outlined cell is a district this source does not reach at all — a blind spot the totals cannot show.")}
          className="rounded-card border border-border"
          footer={<span>{t("pro.src.gridFooter", "Top ten districts by stock · up to eight sources")}</span>}
        >
          {heat.rows.length && heat.columns.length ? (
            <HeatGrid rows={heat.rows} columns={heat.columns} cells={heat.cells} intensityLabel={t("pro.src.gridLabel", "Share of district stock by source")} />
          ) : (
            <p className="py-8 text-center text-footnote text-label-3">{t("pro.src.gridEmpty", "District-level coverage appears once districts carry source mixes.")}</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
