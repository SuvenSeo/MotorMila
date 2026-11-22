import { useMemo, useState } from "react";
import { LineChart, TrendingDown, TrendingUp } from "lucide-react";
import { DeskSection, Figure, Panel } from "@/components/pro/Panel";
import { DeltaChip, StatPill } from "@/components/pro/DeltaChip";
import { MonthlyMedianChart, RelativeChart, ScoreBandChart, type RelativePoint } from "@/components/pro/ProCharts";
import { RankBars } from "@/components/pro/RankBars";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLkrCompact } from "@/lib/price";
import { isThinSample } from "@/lib/proAnalytics";
import { monthlyPoints } from "@/lib/proReportBuilders";
import { useAppPreferences } from "@/lib/appPreferences";
import type { ImportEraSplitData } from "@/types/car";
import type { PriceIndex, PriceIndexPoint } from "@/types/car";
import type { ProDetailPayload, ProMarketPulse, ProVehicleLane } from "@/types/pro";

type Range = "6" | "12" | "24" | "all";

/**
 * Movement — the answer to "what changed", separated from "what is". Lane
 * against market on one axis, the lane's own median over time, who moved
 * hardest this quarter, and the import-freeze cohort split that explains most
 * of the movement in this market.
 */
export function MovementMode({
  lanes,
  index,
  trendDetail,
  trendLane,
  onTrendLane,
  era,
  loadingEra,
  pulse,
  loading,
}: {
  lanes: ProVehicleLane[];
  index: PriceIndex | null;
  trendDetail: ProDetailPayload | null;
  trendLane: string;
  onTrendLane: (value: string) => void;
  era: ImportEraSplitData | null;
  loadingEra: boolean;
  pulse: ProMarketPulse | null;
  loading: boolean;
}) {
  const { t } = useAppPreferences();
  const [range, setRange] = useState<Range>("12");

  const months = range === "all" ? null : Number(range);
  const points = useMemo(() => {
    const all = monthlyPoints(trendDetail?.trend_points ?? []);
    return months == null ? all : all.slice(-months);
  }, [trendDetail, months]);

  const laneName = trendDetail?.title ?? trendLane.replace("|||", " ") ?? "";
  const relative = useMemo<RelativePoint[]>(() => {
    const laneSeries = monthlyPoints(trendDetail?.trend_points ?? []);
    const marketSeries = (index?.points ?? []).filter((point) => point.median_price_lkr != null);
    const marketByMonth = new Map<string, PriceIndexPoint>(marketSeries.map((point) => [point.period, point]));
    const shared = laneSeries.filter((point) => marketByMonth.has(point.label) && point.median != null);
    const windowed = months == null ? shared : shared.slice(-months);
    if (windowed.length < 2) return [];
    const laneBase = windowed[0].median as number;
    const marketBase = marketByMonth.get(windowed[0].label)?.median_price_lkr as number;
    if (!laneBase || !marketBase) return [];
    return windowed.map((point) => ({
      label: point.label,
      lane: ((point.median as number) / laneBase) * 100,
      market: (((marketByMonth.get(point.label)?.median_price_lkr as number) ?? marketBase) / marketBase) * 100,
    }));
  }, [trendDetail, index, months]);

  const movers = useMemo(() => {
    const usable = lanes.filter((lane) => lane.change_90d_pct != null && !isThinSample(lane.listing_count));
    const byChange = [...usable].sort((a, b) => (b.change_90d_pct as number) - (a.change_90d_pct as number));
    return {
      rising: byChange.slice(0, 5),
      falling: byChange.slice(-5).reverse(),
    };
  }, [lanes]);

  const laneChange = trendDetail ? (() => {
    const usable = points.filter((point) => point.median != null);
    if (usable.length < 2) return null;
    const first = usable[0].median as number;
    const last = usable[usable.length - 1].median as number;
    return first > 0 ? ((last - first) / first) * 100 : null;
  })() : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Panel
          label={t("pro.move.lane", "Lane selected")}
          value={<Figure size="sm">{laneName || "—"}</Figure>}
          hint={t("pro.move.laneHint", "Switch lane from the picker beside the trend section")}
          className="rounded-card border border-border"
        />
        <Panel
          label={t("pro.move.change", "Change in window")}
          value={<Figure size="sm">{laneChange != null ? `${laneChange > 0 ? "+" : ""}${laneChange.toFixed(1)}%` : "—"}</Figure>}
          delta={<DeltaChip pct={laneChange} polarity="price" period={range === "all" ? t("pro.window.allTime", "All time") : `${range} mo`} />}
          hint={t("pro.move.changeHint", "Median asking price from the first month in the window to the latest")}
          className="rounded-card border border-border"
        />
        <Panel
          label={t("pro.move.score", "Deal-score spread")}
          value={<Figure size="sm">{pulse?.deal_score_bands.reduce((sum, band) => sum + band.count, 0).toLocaleString("en-US") ?? "—"}</Figure>}
          hint={t("pro.move.scoreHint", "Listings carrying a score, by band — the shape of the discount, not just its average")}
          className="rounded-card border border-border"
        >
          {pulse && pulse.deal_score_bands.length ? (
            <ScoreBandChart bands={pulse.deal_score_bands} heightClass="h-24" />
          ) : null}
        </Panel>
      </div>

      <DeskSection
        label={t("pro.section.trend", "01 · Trend")}
        id="pro-trend"
        title={t("pro.trend.title", "This lane against the market")}
        body={t(
          "pro.trend.body",
          "Both series rebased to 100 at the first month of the window. If the lane line is above the market line, this vehicle is getting dearer faster than everything else.",
        )}
        actions={
          <>
            <SegmentedControl<Range>
              value={range}
              onValueChange={setRange}
              size="sm"
              aria-label={t("pro.trend.rangeAria", "Trend window")}
              options={[
                { value: "6", label: "6M" },
                { value: "12", label: "12M" },
                { value: "24", label: "24M" },
                { value: "all", label: t("pro.window.all", "All") },
              ]}
            />
            <Select value={trendLane} onValueChange={onTrendLane}>
              <SelectTrigger className="w-full sm:w-[16rem]" aria-label={t("pro.trend.laneAria", "Choose a lane")}>
                <SelectValue placeholder={t("pro.trend.lane", "Choose a lane")} />
              </SelectTrigger>
              <SelectContent>
                {lanes.slice(0, 80).map((lane) => (
                  <SelectItem key={`${lane.make}|||${lane.model}`} value={`${lane.make}|||${lane.model}`}>
                    {lane.make} {lane.model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      >
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-card border border-border bg-surface-1 p-3 sm:p-4">
            <h3 className="tech-label mb-2 text-label-2">{t("pro.trend.relative", "Relative performance")}</h3>
            {loading ? (
              <Skeleton shape="chart" className="h-64" />
            ) : relative.length > 1 ? (
              <RelativeChart points={relative} laneName={laneName} />
            ) : (
              <EmptyState
                icon={LineChart}
                title={t("pro.trend.noRelative", "Not enough shared history")}
                body={t("pro.trend.noRelativeBody", "This lane and the market need at least two common months to compare.")}
                className="py-10"
              />
            )}
          </div>
          <div className="rounded-card border border-border bg-surface-1 p-3 sm:p-4">
            <h3 className="tech-label mb-2 text-label-2">{t("pro.trend.median", "Monthly median")}</h3>
            {loading ? (
              <Skeleton shape="chart" className="h-64" />
            ) : points.length > 1 ? (
              <MonthlyMedianChart points={points} />
            ) : (
              <EmptyState
                icon={LineChart}
                title={t("pro.trend.noSeries", "No monthly series yet")}
                body={t("pro.trend.noSeriesBody", "Monthly medians appear once this lane has listings in more than one month.")}
                className="py-10"
              />
            )}
          </div>
        </div>
      </DeskSection>

      <DeskSection
        label={t("pro.section.movers", "02 · Movers")}
        id="pro-movers"
        title={t("pro.movers.title", "Who moved hardest this quarter")}
        body={t("pro.movers.body", "Lanes with at least five listings, ranked by the change in median asking price across their own monthly series.")}
      >
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-card border border-border bg-surface-1 p-3 sm:p-4">
            <h3 className="tech-label mb-2 inline-flex items-center gap-1.5 text-label-2">
              <TrendingUp aria-hidden className="h-3.5 w-3.5 text-deal-high-text" />
              {t("pro.movers.rising", "Asking prices rising")}
            </h3>
            <RankBars
              rows={movers.rising.map((lane) => ({
                key: `${lane.make}-${lane.model}`,
                label: `${lane.make} ${lane.model}`,
                value: Math.abs(lane.change_90d_pct ?? 0),
                valueLabel: `${(lane.change_90d_pct ?? 0) > 0 ? "+" : ""}${(lane.change_90d_pct ?? 0).toFixed(1)}%`,
                meta: `${lane.listing_count} ${t("pro.movers.stock", "listings")} · ${formatLkrCompact(lane.median_price_lkr)}`,
              }))}
              emptyLabel={t("pro.movers.empty", "Momentum needs a few months of a lane's own history.")}
            />
          </div>
          <div className="rounded-card border border-border bg-surface-1 p-3 sm:p-4">
            <h3 className="tech-label mb-2 inline-flex items-center gap-1.5 text-label-2">
              <TrendingDown aria-hidden className="h-3.5 w-3.5 text-deal-good-text" />
              {t("pro.movers.falling", "Asking prices falling")}
            </h3>
            <RankBars
              rows={movers.falling.filter((lane) => (lane.change_90d_pct ?? 0) < 0).map((lane) => ({
                key: `${lane.make}-${lane.model}`,
                label: `${lane.make} ${lane.model}`,
                value: Math.abs(lane.change_90d_pct ?? 0),
                valueLabel: `${(lane.change_90d_pct ?? 0).toFixed(1)}%`,
                meta: `${lane.listing_count} ${t("pro.movers.stock", "listings")} · ${formatLkrCompact(lane.median_price_lkr)}`,
              }))}
              emptyLabel={t("pro.movers.emptyFall", "No lane is meaningfully cheaper over its own series.")}
            />
          </div>
        </div>
      </DeskSection>

      <DeskSection
        label={t("pro.section.cohorts", "03 · Cohorts")}
        id="pro-era"
        title={t("pro.era.title", "The import-freeze split")}
        body={t(
          "pro.era.body",
          "Vehicles manufactured up to 2024 against those from 2025 on. The premium in the right-hand column is what restricted imports are worth in today's asking prices.",
        )}
        actions={
          <>
            <StatPill tone="neutral">{t("pro.era.pre", "Pre-freeze ≤ 2024")}</StatPill>
            <StatPill tone="accent">{t("pro.era.post", "Post-freeze ≥ 2025")}</StatPill>
          </>
        }
      >
        <div className="rounded-card border border-border bg-surface-1">
          {loadingEra ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} shape="text" className="h-9" />
              ))}
            </div>
          ) : (era?.makes?.length ?? 0) === 0 ? (
            <EmptyState
              icon={LineChart}
              title={t("pro.era.empty", "Cohort data is not available yet")}
              body={t("pro.era.emptyBody", "The split appears once enough priced listings carry a manufacture year on both sides of 2025.")}
              className="py-12"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left">
                <caption className="sr-only">{t("pro.era.caption", "Median asking price by make and import era")}</caption>
                <thead>
                  <tr className="text-caption text-label-3">
                    <th scope="col" className="border-b border-separator px-3 py-2 font-medium">{t("pro.col.make", "Make")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.era.preMedian", "Pre median")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.col.n", "n")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.era.postMedian", "Post median")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.col.n", "n")}</th>
                    <th scope="col" className="border-b border-separator px-3 py-2 text-right font-medium">{t("pro.era.premium", "Premium")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(era?.makes ?? []).map((row) => {
                    const pre = row.pre_freeze.median_price_lkr;
                    const post = row.post_freeze.median_price_lkr;
                    const premium = pre && post ? ((post - pre) / pre) * 100 : null;
                    return (
                      <tr key={row.make} className="transition-colors hover:bg-surface-2/70">
                        <th scope="row" className="border-b border-separator px-3 py-2 text-left text-footnote font-semibold text-foreground">{row.make}</th>
                        <td className="border-b border-separator px-3 py-2 text-right text-footnote tabular-nums text-foreground">{pre != null ? formatLkrCompact(pre) : "—"}</td>
                        <td className="border-b border-separator px-3 py-2 text-right text-caption tabular-nums text-label-3">{row.pre_freeze.count.toLocaleString("en-US")}</td>
                        <td className="border-b border-separator px-3 py-2 text-right text-footnote tabular-nums text-foreground">{post != null ? formatLkrCompact(post) : "—"}</td>
                        <td className="border-b border-separator px-3 py-2 text-right text-caption tabular-nums text-label-3">{row.post_freeze.count.toLocaleString("en-US")}</td>
                        <td className="border-b border-separator px-3 py-2 text-right">
                          {premium != null ? <DeltaChip pct={premium} polarity="price" /> : <span className="text-caption text-label-3">—</span>}
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
    </div>
  );
}
