import { memo, useMemo } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Flame, Radio } from "lucide-react";
import { formatPrice } from "@/services/api";
import { DataFreshnessIndicator } from "@/components/DataFreshnessIndicator";
import { formatCompactAge, getListingDataFreshness } from "@/lib/dataFreshness";
import { isReasonableListingPrice } from "@/lib/formatting";
import { useCountUp } from "@/hooks/useCountUp";
import type { DashboardInsights, LiveMarketSnapshot, StatsOverview } from "@/types/car";
import { useAppPreferences } from "@/lib/appPreferences";

interface MarketIntelligencePanelProps {
  snapshot: LiveMarketSnapshot | null;
  stats: StatsOverview | null;
  insights: DashboardInsights | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  ikman: "ikman",
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

function labelSource(raw: string): string {
  const compact = String(raw || "").toLowerCase().replace(/[-_.\s]/g, "");
  for (const key of Object.keys(SOURCE_LABELS)) {
    if (compact.startsWith(key)) return SOURCE_LABELS[key];
  }
  return raw || "Source";
}

interface FeedRow {
  key: string;
  source: string;
  fresh: number;
  found: number;
  time: string;
}

/** Loading placeholder for the live-intelligence bento — same footprint, shimmer blocks.
 *  Shimmer is disabled under prefers-reduced-motion (static placeholders remain). */
export function MarketIntelligenceSkeleton() {
  return (
    <div role="status" aria-label="Loading market intelligence">
      <div
        className="grid grid-cols-2 overflow-hidden rounded-3xl border border-border bg-border lg:grid-cols-4"
        style={{ gap: "1px" }}
      >
        <div className="relative col-span-2 bg-card p-6 sm:p-8 lg:row-span-2" aria-hidden="true">
          <div className="skeleton-shimmer h-3 w-28 rounded-full" />
          <div className="skeleton-shimmer mt-5 h-16 w-3/4 rounded-2xl sm:h-20" />
          <div className="skeleton-shimmer mt-4 h-3 w-2/3 rounded-full" />
          <div className="mt-6 flex flex-wrap gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton-shimmer h-6 w-16 rounded-full" />
            ))}
          </div>
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-card p-5" aria-hidden="true">
            <div className="skeleton-shimmer h-3 w-20 rounded-full" />
            <div className="skeleton-shimmer mt-3 h-8 w-24 rounded-xl" />
          </div>
        ))}
      </div>
      <div className="mt-3 overflow-hidden rounded-[1.75rem] border border-border bg-surface" aria-hidden="true">
        <div className="border-b border-border px-5 py-3">
          <div className="skeleton-shimmer h-3.5 w-36 rounded-full" />
        </div>
        <div className="divide-y divide-border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3">
              <div className="skeleton-shimmer h-4 w-40 rounded-full" />
              <div className="skeleton-shimmer h-4 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Metric cell ────────────────────────────────────────────────────────────

function MetricCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="bg-card p-5 transition-colors duration-200 hover:bg-foreground/[0.03]">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p
        className={`mt-2 flex items-center gap-1 font-display text-[1.5rem] font-semibold leading-none tracking-tight num ${
          tone === "up"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "down"
              ? "text-rose-600 dark:text-rose-400"
              : "text-foreground"
        }`}
      >
        {tone === "up" && <ArrowUpRight className="h-4 w-4" />}
        {tone === "down" && <ArrowDownRight className="h-4 w-4" />}
        {value}
      </p>
    </div>
  );
}

export const MarketIntelligencePanel = memo(function MarketIntelligencePanel({
  snapshot,
  stats,
  insights,
}: MarketIntelligencePanelProps) {
  const { t } = useAppPreferences();
  const totalIndexed = Number(snapshot?.total_listings ?? stats?.total_listings ?? 0);
  const pricedListings = Number(snapshot?.priced_listings ?? 0);
  const unavailableCount = Number(
    snapshot?.unavailable_price_listings ?? Math.max(0, totalIndexed - pricedListings),
  );
  // Priced listings match the default inventory browse count; fall back to total when priced is unknown.
  const liveListings = pricedListings > 0 ? pricedListings : totalIndexed;
  // "N sources" must mean the same thing everywhere on the page: the number of
  // sources actually indexed, not just the ones that happened to run in the
  // latest scrape cycle (which is why this used to read 10 next to a hero 13).
  const sourceCount = Number(stats?.source_count || snapshot?.source_status?.length || 0);
  const districtCount = Number(stats?.district_count || 0);
  const avgPrice = Number(snapshot?.avg_price_lkr ?? stats?.avg_price_lkr ?? 0);
  const momChange = stats?.price_change_mom ?? null;
  // Only use true 24h insight data — never substitute weekly counts for this metric.
  const new24h =
    insights?.new_listings_24h == null ? null : Number(insights.new_listings_24h);
  const goodDeals = Number(stats?.good_deals_count ?? 0);
  const freshness = getListingDataFreshness({
    latestListingAt: snapshot?.latest_listing_at,
    lastUpdated: stats?.last_updated,
  });
  const feedSyncAt = snapshot?.generated_at ?? freshness.primaryAt;
  const feedSyncLabel = formatCompactAge(feedSyncAt);
  const awaitingFeedSync = feedSyncLabel === "—";

  // Animated counters
  const liveCount = useCountUp(liveListings, 1400);
  const avgCount = useCountUp(avgPrice, 1400);
  const newCount = useCountUp(new24h ?? 0, 1100);
  const dealsCount = useCountUp(goodDeals, 1100);

  const liveDisplay =
    liveListings > 0
      ? liveCount.toLocaleString()
      : liveListings === 0
        ? "0"
        : t("intel.noIndexed", "No indexed listings");

  // Live incoming feed — prefer real scrape runs, fall back to scored deals.
  const feed = useMemo<FeedRow[]>(() => {
    const runs = (snapshot?.source_status || [])
      .filter((r) => r && (r.listings_found || r.listings_new || r.finished_at))
      .slice(0, 5)
      .map((r, i) => ({
        key: `${r.source}-${i}`,
        source: labelSource(r.source),
        fresh: Number(r.listings_new || 0),
        found: Number(r.listings_found || 0),
        time: formatCompactAge(r.finished_at || r.started_at),
      }));
    if (runs.length) return runs;

    return (insights?.hot_deals || [])
      .filter((d) => isReasonableListingPrice(Number(d.price_lkr || 0)))
      .slice(0, 5)
      .map((d, i) => ({
        key: `deal-${d.id}-${i}`,
        source: `${d.make} ${d.model}`,
        fresh: Number(d.deal_score || 0),
        found: 0,
        time: d.district || "LK",
      }));
  }, [snapshot?.source_status, insights?.hot_deals]);

  const sources = useMemo(
    () =>
      (snapshot?.active_scrape_sources?.length
        ? snapshot.active_scrape_sources
        : (snapshot?.source_status || []).map((r) => r.source)
      )
        .map(labelSource)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, 10),
    [snapshot?.active_scrape_sources, snapshot?.source_status],
  );

  return (
    <div>
      {/* ── Bento grid ── */}
      <div
        className="grid grid-cols-2 overflow-hidden rounded-3xl border border-border bg-border lg:grid-cols-4"
        style={{ gap: "1px" }}
      >
        {/* Hero cell — moat number (spans 2 cols, 2 rows on lg) */}
        <div className="relative col-span-2 overflow-hidden bg-card p-6 transition-colors duration-200 hover:bg-foreground/[0.03] sm:p-8 lg:row-span-2">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary to-primary/40" />
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 60% 55% at 18% 0%, hsl(var(--primary) / 0.10) 0%, transparent 68%)" }}
          />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] font-semibold text-muted-foreground">{t("intel.liveListings", "Live listings")}</p>
              <DataFreshnessIndicator
                latestListingAt={snapshot?.latest_listing_at}
                lastUpdated={stats?.last_updated}
              />
            </div>

            <p
              className="mt-4 font-display text-[3rem] font-semibold leading-[0.95] tracking-[-0.035em] text-foreground num sm:text-[4rem] lg:text-[4.75rem]"
              aria-live="polite"
            >
              {liveDisplay}
            </p>

            {unavailableCount > 0 && totalIndexed > pricedListings ? (
              <p className="mt-2 text-[12px] font-medium text-muted-foreground">
                {t("intel.totalIndexed", "{n} total indexed · {u} awaiting price", {
                  n: totalIndexed.toLocaleString(),
                  u: unavailableCount.toLocaleString(),
                })}
              </p>
            ) : null}

            <p className="mt-3 text-[13px] font-medium text-muted-foreground">
              {t("intel.acrossSources", "Across {sources} live sources and {districts} districts — indexed continuously, scored against market medians.", {
                sources: sourceCount > 0 ? sourceCount : 10,
                districts: districtCount > 0 ? districtCount : 25,
              })}
            </p>

            {/* Source badges */}
            {sources.length > 0 && (
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-5">
                {sources.map((s) => (
                  <span key={s} className="rounded-full border border-border bg-foreground/[0.03] px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-foreground">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Supporting metric cells */}
        <MetricCell label={t("intel.avgPrice", "Avg price")} value={avgPrice > 0 ? formatPrice(avgCount) : "—"} />
        <MetricCell
          label={t("intel.momChange", "MoM change")}
          value={momChange == null ? t("stats.buildingHistory", "Building history") : `${momChange >= 0 ? "+" : ""}${momChange.toFixed(1)}%`}
          tone={momChange == null ? undefined : momChange > 0 ? "up" : momChange < 0 ? "down" : undefined}
        />
        <MetricCell
          label={t("intel.new24h", "New · 24h")}
          value={
            new24h == null
              ? "—"
              : new24h > 0
                ? newCount.toLocaleString()
                : "0"
          }
        />
        <MetricCell label={t("intel.goodDeals", "Good deals")} value={goodDeals > 0 ? dealsCount.toLocaleString() : "—"} />
      </div>

      {/* ── Live incoming feed ── */}
      <div className="mt-3 overflow-hidden rounded-[1.75rem] border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-primary/70" />
            {t("intel.liveFeed", "Live incoming feed")}
          </p>
          <span
            className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground"
            title={feedSyncAt ? freshness.absoluteLabel : undefined}
          >
            <Radio className="h-3 w-3 text-primary/70" />
            {awaitingFeedSync ? t("intel.awaitingSync", "Awaiting sync") : t("intel.synced", "Synced {age}", { age: feedSyncLabel })}
          </span>
        </div>
        <div className="divide-y divide-border">
          {feed.length ? (
            feed.map((row) => (
              <div key={row.key} className="flex items-center justify-between px-5 py-2.5 transition-colors duration-200 hover:bg-foreground/[0.02]">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Flame className="h-3.5 w-3.5 shrink-0 text-primary/50" />
                  <span className="truncate text-[13px] font-semibold text-foreground">{row.source}</span>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  {row.found > 0 ? (
                    <span className="text-[12px] font-bold text-emerald-600 dark:text-emerald-400/90 num">{t("intel.newSuffix", "+{n} new", { n: row.fresh.toLocaleString() })}</span>
                  ) : (
                    <span className="text-[12px] font-bold text-primary/80 num">{t("intel.dealSuffix", "+{n} deal", { n: row.fresh.toFixed(0) })}</span>
                  )}
                  <span className="w-8 text-right text-[11px] text-muted-foreground num">{row.time}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="px-5 py-8 text-center text-[12px] text-muted-foreground">
              {awaitingFeedSync ? t("intel.awaitingLiveSync", "Awaiting live sync") : t("intel.noScrapeActivity", "No recent scrape activity")}
            </p>
          )}
        </div>
      </div>

      {freshness.isStale ? (
        <div className="mt-3">
          <DataFreshnessIndicator
            latestListingAt={snapshot?.latest_listing_at}
            lastUpdated={stats?.last_updated}
            variant="banner"
          />
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
          <p
            className="text-[11px] font-medium text-muted-foreground"
            title={freshness.primaryAt ? freshness.absoluteLabel : undefined}
          >
            {freshness.dataAsOfLabel}
            {freshness.listingAt && freshness.statsAt && freshness.listingAt !== freshness.statsAt ? (
              <span>{t("intel.statsRefreshed", "· stats refreshed {age} ago", { age: formatCompactAge(freshness.statsAt) })}</span>
            ) : null}
          </p>
          {snapshot?.generated_at ? (
            <p className="text-[12px] font-medium text-muted-foreground/80">
              {t("intel.snapshotAgo", "Snapshot {age} ago", { age: formatCompactAge(snapshot.generated_at) })}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
});

MarketIntelligencePanel.displayName = "MarketIntelligencePanel";
