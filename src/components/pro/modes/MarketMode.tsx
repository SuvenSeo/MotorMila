import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Building2, Database, Flame, LineChart, Package, TrendingUp } from "lucide-react";
import { DeskSection, Figure, Panel, PanelGrid } from "@/components/pro/Panel";
import { DeltaChip, StatPill } from "@/components/pro/DeltaChip";
import { Sparkline } from "@/components/pro/Sparkline";
import { IndexChart, SupplyChart } from "@/components/pro/ProCharts";
import { BarSeries } from "@/components/pro/Histogram";
import { RankBars } from "@/components/pro/RankBars";
import { OpportunityDesk } from "@/components/pro/OpportunityDesk";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLkrCompact } from "@/lib/price";
import { formatRelativeTime } from "@/lib/formatting";
import { changeOverMonths, freshness, momentum, pctChange } from "@/lib/proAnalytics";
import { useAppPreferences } from "@/lib/appPreferences";
import type { PriceIndex, PriceIndexPoint } from "@/types/car";
import type { ProDistrictProfile, ProMarketPulse, ProMarketSnapshot, ProVehicleLane } from "@/types/pro";
import type { DistrictVelocityPoint as VelocityPoint } from "@/types/car";

export type DeskWindow = 6 | 12 | 24 | null;

const WINDOW_LABEL: Record<string, string> = { "6": "6 mo", "12": "12 mo", "24": "24 mo", all: "All" };

/** Trailing change of a sub-index series over the selected window. */
function segmentRow(make: string, points: PriceIndexPoint[], monthsBack: DeskWindow) {
  const usable = points.filter((point) => Number.isFinite(point.index_value));
  if (usable.length === 0) return null;
  const last = usable[usable.length - 1];
  const baseIndex = monthsBack == null ? 0 : Math.max(0, usable.length - 1 - monthsBack);
  const base = usable[baseIndex];
  return {
    make,
    value: last.index_value,
    change: last.index_value - base.index_value > 0 && base.index_value > 0 ? ((last.index_value - base.index_value) / base.index_value) * 100 : 0,
    samples: last.sample_size ?? null,
  };
}

/**
 * Market — the landing desk. Reads in four steps: where the market is, what the
 * index says it is doing, what is mispriced right now, and whether the data
 * underneath is worth paying for.
 */
export function MarketMode({
  loading,
  snapshot,
  lanes,
  districts,
  index,
  pulse,
  velocity,
  windowMonths,
  hasProAccess,
}: {
  loading: boolean;
  snapshot: ProMarketSnapshot | null;
  lanes: ProVehicleLane[];
  districts: ProDistrictProfile[];
  index: PriceIndex | null;
  pulse: ProMarketPulse | null;
  velocity: VelocityPoint[];
  windowMonths: DeskWindow;
  hasProAccess: boolean;
}) {
  const { t } = useAppPreferences();

  const laneMedian = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const lane of lanes) map.set(`${lane.make}|||${lane.model}`, lane.median_price_lkr ?? null);
    return map;
  }, [lanes]);

  const laneScores = useMemo(
    () => lanes.map((lane) => lane.avg_deal_score).filter((score): score is number => score != null),
    [lanes],
  );

  const medianPoints = useMemo(
    () => (index?.points ?? []).slice(-12),
    [index],
  );
  const medianSpark = medianPoints.map((point) => point.median_price_lkr).filter((v): v is number => v != null && v > 0);
  const medianDelta = changeOverMonths(index?.points, windowMonths === null ? null : Math.min(windowMonths, 12));
  const latestIndex = index?.points?.[index.points.length - 1];
  const indexChange = latestIndex?.mom_change_pct ?? null;
  const indexSpark = (index?.points ?? []).slice(-12).map((point) => point.index_value);

  const supplyDelta = useMemo(() => {
    const days = pulse?.daily_supply ?? [];
    if (days.length < 14) return null;
    const lastWeek = days.slice(-7).reduce((sum, day) => sum + day.count, 0);
    const priorWeek = days.slice(-14, -7).reduce((sum, day) => sum + day.count, 0);
    return pctChange(lastWeek, priorWeek);
  }, [pulse]);

  const segments = useMemo(() => {
    const rows = Object.entries(index?.segments ?? {})
      .map(([make, points]) => segmentRow(make, points, windowMonths))
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => b.change - a.change);
    return rows.slice(0, 6);
  }, [index, windowMonths]);

  const hotShare = snapshot && snapshot.total_listings > 0 ? (snapshot.hot_deal_count / snapshot.total_listings) * 100 : null;
  const freshnessState = freshness(snapshot?.last_updated ?? snapshot?.generated_at ?? null);
  const velocityTop = useMemo(
    () => [...velocity].filter((point) => point.listing_count > 0).sort((a, b) => b.velocity_score - a.velocity_score).slice(0, 7),
    [velocity],
  );

  const deciles = pulse?.price_deciles ?? [];
  const decileBars = deciles.map((band) => ({
    key: band.label,
    label: band.label,
    fullLabel: `${formatLkrCompact(band.low_lkr)} – ${formatLkrCompact(band.high_lkr)}`,
    value: band.count,
  }));

  return (
    <div className="space-y-7">
      <PanelGrid className="grid-cols-2 xl:grid-cols-4">
        <Panel
          label={t("pro.kpi.median", "Median asking price")}
          meta={windowMonths ? WINDOW_LABEL[String(windowMonths)] : t("pro.window.allTime", "All time")}
          value={
            loading ? (
              <Skeleton shape="text" className="h-8 w-28" />
            ) : (
              <Figure size="md">{formatLkrCompact(snapshot?.median_price_lkr)}</Figure>
            )
          }
          delta={loading ? null : <DeltaChip pct={medianDelta} polarity="price" />}
          hint={t("pro.kpi.medianHint", "Outlier-filtered asking prices across every source")}
          footer={snapshot ? `${snapshot.total_listings.toLocaleString("en-US")} ${t("pro.kpi.priced", "priced listings")}` : undefined}
        >
          {medianSpark.length > 2 ? (
            <Sparkline values={medianSpark} tone={medianDelta != null && medianDelta < 0 ? "down" : "up"} width={150} height={30} fill label={t("pro.kpi.medianSpark", "Median price, last twelve months")} />
          ) : null}
        </Panel>

        <Panel
          label={t("pro.kpi.index", "Mix-adjusted index")}
          meta={index?.base_period ? `base ${index.base_period}` : undefined}
          value={
            loading ? (
              <Skeleton shape="text" className="h-8 w-24" />
            ) : (
              <Figure size="md" tone="primary">{latestIndex ? latestIndex.index_value.toFixed(1) : "—"}</Figure>
            )
          }
          delta={<DeltaChip pct={indexChange} polarity="price" period={t("pro.period.mom", "MoM")} />}
          hint={t("pro.kpi.indexHint", "Prices for like-for-like vehicles, so a change in what was for sale cannot move it")}
          footer={latestIndex?.sample_size ? `${latestIndex.sample_size.toLocaleString("en-US")} ${t("pro.kpi.cohortListings", "listings this month")}` : undefined}
        >
          {indexSpark.length > 2 ? <Sparkline values={indexSpark} width={150} height={30} fill label={t("pro.kpi.indexSpark", "Index over the last twelve months")} /> : null}
        </Panel>

        <Panel
          label={t("pro.kpi.supply", "New supply")}
          meta={t("pro.kpi.last7", "7 days")}
          value={
            loading ? (
              <Skeleton shape="text" className="h-8 w-20" />
            ) : (
              <Figure size="md">{(pulse?.new_7d ?? snapshot?.new_listings_7d ?? 0).toLocaleString("en-US")}</Figure>
            )
          }
          delta={<DeltaChip pct={supplyDelta} polarity="volume" period={t("pro.period.wow", "WoW")} />}
          hint={t("pro.kpi.supplyHint", "First-seen listings entering the market")}
          footer={pulse ? `${pulse.new_24h.toLocaleString("en-US")} ${t("pro.kpi.in24h", "in the last 24 hours")}` : undefined}
        >
          {pulse && pulse.daily_supply.length > 6 ? (
            <Sparkline
              values={pulse.daily_supply.map((day) => day.count)}
              width={150}
              height={30}
              tone="neutral"
              fill
              label={t("pro.kpi.supplySpark", "Daily new listings, last thirty days")}
            />
          ) : null}
        </Panel>

        <Panel
          label={t("pro.kpi.deals", "Hot deals")}
          meta={t("pro.kpi.dealScoreQualified", "score qualified")}
          value={
            loading ? (
              <Skeleton shape="text" className="h-8 w-20" />
            ) : (
              <Figure size="md" tone={snapshot?.hot_deal_count ? "default" : "muted"}>{(snapshot?.hot_deal_count ?? 0).toLocaleString("en-US")}</Figure>
            )
          }
          delta={hotShare != null ? <StatPill tone="accent">{hotShare.toFixed(1)}% {t("pro.kpi.ofInventory", "of stock")}</StatPill> : null}
          hint={t("pro.kpi.dealsHint", "Priced far enough under their lane median to qualify")}
          footer={
            <>
              <span className="inline-flex items-center gap-1"><Building2 aria-hidden className="h-3 w-3" />{snapshot?.districts_covered ?? 0} {t("pro.kpi.districts", "districts")}</span>
              <span className="inline-flex items-center gap-1"><Database aria-hidden className="h-3 w-3" />{snapshot?.source_count ?? 0} {t("pro.kpi.sources", "sources")}</span>
            </>
          }
        />
      </PanelGrid>

      <DeskSection
        label={t("pro.section.price", "01 · Price")}
        id="pro-index"
        title={t("pro.index.title", "The index, not the average")}
        body={t(
          "pro.index.body",
          "A mix-adjusted Laspeyres index of asking prices, rebased so the first month equals 100. Each make is its own sub-index, so a shift in demand for one segment cannot hide in an all-market average.",
        )}
        actions={
          <StatPill tone={freshnessState === "stale" ? "bad" : freshnessState === "unknown" ? "neutral" : "good"}>
            {t("pro.updated", "Updated {when}", { when: freshRelative(snapshot?.last_updated ?? snapshot?.generated_at) })}
          </StatPill>
        }
      >
        <div className="grid gap-3 xl:grid-cols-[1.65fr_1fr]">
          <div className="min-w-0 rounded-card border border-border bg-surface-1 p-3 sm:p-4">
            {loading ? (
              <Skeleton shape="chart" className="h-72" />
            ) : (index?.points?.length ?? 0) > 2 ? (
              <IndexChart points={index!.points} basePeriod={index?.base_period} />
            ) : (
              <EmptyState
                icon={LineChart}
                title={t("pro.index.empty", "The index needs a few more months of history.")}
                body={t("pro.index.emptyBody", "It appears once at least three months of priced listings share the same cohorts.")}
                className="py-10"
              />
            )}
          </div>
          <Panel
            label={t("pro.index.segments", "Segment performance")}
            meta={windowMonths ? WINDOW_LABEL[String(windowMonths)] : t("pro.window.allTime", "All time")}
            hint={t("pro.index.segmentsHint", "Each make rebased to its own first month, so values compare movement, not price.")}
            flush
            className="rounded-card border border-border"
            footer={
              <span className="inline-flex items-center gap-1">
                <TrendingUp aria-hidden className="h-3 w-3" />
                {t("pro.index.segmentFooter", "Ranked by change over the selected window")}
              </span>
            }
          >
            {segments.length === 0 ? (
              <p className="px-4 py-6 text-footnote text-label-3">{t("pro.index.noSegments", "Segment sub-indices are still building history.")}</p>
            ) : (
              <ul className="divide-y divide-separator px-2 pb-1">
                {segments.map((segment) => {
                  const trend = momentum(segment.change);
                  return (
                    <li key={segment.make} className="flex items-center justify-between gap-3 px-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-footnote font-semibold text-foreground">{segment.make}</p>
                        <p className="text-caption tabular-nums text-label-3">
                          {segment.value.toFixed(1)} {segment.samples ? `· n ${segment.samples.toLocaleString("en-US")}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-3 sm:block" aria-hidden>
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(100, Math.abs(segment.change) * 4)}%` }}
                          />
                        </span>
                        <DeltaChip pct={segment.change} polarity="price" />
                        {trend === "flat" ? <span className="sr-only">{t("pro.delta.flat", "Unchanged")}</span> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </DeskSection>

      <DeskSection
        label={t("pro.section.opportunity", "02 · Opportunity")}
        id="pro-opportunities"
        title={t("pro.opps.title", "Mispriced right now")}
        body={t(
          "pro.opps.body",
          "Every scored listing, measured against the median of its own make and model. The gap is the trade; the percentile tells you whether the score is actually unusual.",
        )}
        actions={
          <Link to="/pro/lanes" className="text-caption font-semibold text-primary no-underline hover:underline">
            {t("pro.opps.allLanes", "Open the lane table →")}
          </Link>
        }
      >
        <div className="rounded-card border border-border bg-surface-1 p-3 sm:p-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 7 }).map((_, index) => (
                <Skeleton key={index} shape="text" className="h-9" />
              ))}
            </div>
          ) : (
            <OpportunityDesk
              listings={(snapshot?.top_opportunities ?? []).slice(0, hasProAccess ? 12 : 5)}
              laneMedian={laneMedian}
              laneScores={laneScores}
            />
          )}
        </div>
      </DeskSection>

      <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel
          label={t("pro.supply.title", "Supply")}
          meta={t("pro.supply.window", "last 30 days")}
          value={<Figure size="sm">{pulse ? pulse.new_7d.toLocaleString("en-US") : "—"}<span className="ml-1 text-caption font-medium text-label-3">{t("pro.supply.thisWeek", "added this week")}</span></Figure>}
          hint={t("pro.supply.hint", "Daily first-seen listings with a seven-day average: one heavy scrape never looks like a market shift.")}
          className="rounded-card border border-border"
          footer={
            pulse ? (
              <>
                <span className="inline-flex items-center gap-1"><Package aria-hidden className="h-3 w-3" />{t("pro.supply.total24", "{n} in 24h", { n: pulse.new_24h.toLocaleString("en-US") })}</span>
                <StatPill tone={freshnessState === "stale" ? "bad" : "good"}>
                  {freshnessState === "live" ? t("pro.fresh.live", "Live") : freshRelative(snapshot?.last_updated)}
                </StatPill>
              </>
            ) : undefined
          }
        >
          {pulse && pulse.daily_supply.length > 0 ? <SupplyChart points={pulse.daily_supply} /> : <p className="py-8 text-center text-footnote text-label-3">{t("pro.supply.empty", "Daily supply is not available yet.")}</p>}
        </Panel>

        <Panel
          label={t("pro.spread.title", "Price spread")}
          meta={t("pro.spread.meta", "deciles of asking price")}
          hint={t("pro.spread.hint", "How inventory is distributed across price bands. A thinning upper half is the first sign of a buyer's market.")}
          className="rounded-card border border-border"
          footer={
            pulse ? (
              <>
                <span>{t("pro.spread.cuts", "{share}% of tracked listings have cut their price", { share: pulse.price_cut_share.share_pct.toFixed(1) })}</span>
                {pulse.days_to_clear.sample_size > 0 && pulse.days_to_clear.median_days != null ? (
                  <span className="ml-auto inline-flex items-center gap-1">
                    <Flame aria-hidden className="h-3 w-3" />
                    {t("pro.spread.clear", "median {days}d to clear", { days: Math.round(pulse.days_to_clear.median_days) })}
                  </span>
                ) : null}
              </>
            ) : undefined
          }
        >
          {decileBars.length ? (
            <BarSeries bars={decileBars} height={104} label={t("pro.spread.caption", "Listings per price decile")} valueFormat={(value) => `${value}`} />
          ) : (
            <p className="py-8 text-center text-footnote text-label-3">{t("pro.spread.empty", "Price bands are not available yet.")}</p>
          )}
        </Panel>
      </div>

      <DeskSection
        label={t("pro.section.movement", "03 · Movement")}
        id="pro-movement"
        title={t("pro.velocity.title", "Where stock is moving")}
        body={t("pro.velocity.body", "Delivery speed by district: new listings this week against total stock. Fast districts turn over; slow ones hold askers who will negotiate.")}
      >
        <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-card border border-border bg-surface-1 p-3 sm:p-4">
            {velocityTop.length ? (
              <RankBars
                rows={velocityTop.map((point) => ({
                  key: point.district,
                  label: point.district,
                  value: point.velocity_score,
                  valueLabel: point.velocity_score.toFixed(1),
                  meta: (
                    <>
                      {point.new_7d_count.toLocaleString("en-US")} {t("pro.velocity.new", "new this week")}
                      <span aria-hidden>·</span>
                      {point.listing_count.toLocaleString("en-US")} {t("pro.velocity.stock", "in stock")}
                    </>
                  ),
                }))}
                emptyLabel={t("pro.velocity.empty", "District velocity is not available yet.")}
              />
            ) : (
              <p className="py-8 text-center text-footnote text-label-3">{t("pro.velocity.empty", "District velocity is not available yet.")}</p>
            )}
            <p className="mt-2 text-caption text-label-3">
              {t("pro.velocity.note", "Velocity = new listings in seven days as a share of district stock, scaled to the busiest district.")}
            </p>
          </div>
          <Panel
            label={t("pro.coverage.title", "Coverage")}
            meta={t("pro.coverage.meta", "{n} sources", { n: String(snapshot?.source_count ?? 0) })}
            hint={t("pro.coverage.hint", "Share of priced listings by source. A single source above half is a single point of failure.")}
            className="rounded-card border border-border"
            flush
            footer={
              <span>
                {t("pro.coverage.footer", "{districts} of {total} districts carry listings", {
                  districts: String(districts.length),
                  total: "25",
                })}
              </span>
            }
          >
            <RankBars
              rows={(snapshot?.source_coverage ?? []).map((source) => ({
                key: source.label,
                label: source.label,
                value: source.count,
                valueLabel: `${source.share_pct.toFixed(0)}%`,
                meta: `${formatLkrCompact(source.avg_price_lkr)} ${t("pro.coverage.avg", "avg")}`,
              }))}
              className="px-4 pb-1"
              emptyLabel={t("pro.coverage.empty", "Source coverage will return with the next snapshot.")}
            />
          </Panel>
        </div>
      </DeskSection>
    </div>
  );
}

function freshRelative(iso: string | null | undefined): string {
  return iso ? formatRelativeTime(iso) : "—";
}
