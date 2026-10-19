import { memo } from "react";
import { StatsOverview } from "@/types/car";
import { DataFreshnessIndicator } from "@/components/DataFreshnessIndicator";
import { useAppPreferences } from "@/lib/appPreferences";
import { NumberTicker } from "@/components/ui/NumberTicker";

interface StatsBarProps {
  stats: StatsOverview;
  latestListingAt?: string | null;
}

export const StatsBar = memo(function StatsBar({ stats, latestListingAt }: StatsBarProps) {
  const { t } = useAppPreferences();
  const momChange = stats.price_change_mom;
  const sourceLabel =
    stats.source_count > 0
      ? t("stats.sources", "{n} sources", { n: stats.source_count })
      : t("stats.sourceScanPending", "source scan pending");

  return (
    <div className="mb-0">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Hero: Average Price */}
        <div className="cinematic-panel motion-card rounded-xl p-8 lg:col-span-2 group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <div className="relative z-10 flex flex-col justify-between h-full space-y-8">
            <p className="tech-label tracking-[0.18em]">{t("stats.avgIndexPrice", "Average Index Price")}</p>
            <div>
              <p className="text-5xl font-semibold leading-none text-foreground num lg:text-7xl">
                <NumberTicker
                  value={stats.avg_price_lkr / 1_000_000}
                  decimalPlaces={2}
                  formatValue={(v) => `Rs. ${v.toFixed(2)}M`}
                />
              </p>
              <div className={`mt-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 tech-label num ${
                momChange == null
                  ? "bg-muted/30 text-muted-foreground border border-border"
                  : momChange < 0
                    ? "bg-primary/10 text-primary-bright border border-primary/20"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
              }`}>
                {momChange == null ? (
                  t("stats.buildingHistory", "Building history")
                ) : (
                  <>
                    <span>{momChange < 0 ? "▼" : "▲"}</span>
                    {Math.abs(momChange)}{t("stats.movementVsMonth0", "% Movement vs month-0")}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Listings Count */}
        <div className="cinematic-panel motion-card rounded-xl p-8 flex flex-col justify-between group">
          <p className="tech-label tracking-[0.18em]">{t("stats.totalDepth", "Total Depth")}</p>
          <div>
            <p className="text-4xl font-semibold leading-none text-foreground num lg:text-5xl">
              <NumberTicker value={stats.total_listings} delay={0.15} />
            </p>
            <p className="mt-4 flex items-center gap-2 tech-label text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              {t("stats.pricedListings", "Priced listings")}
            </p>
          </div>
        </div>

        {/* Good Deals */}
        <div className="cinematic-panel motion-card rounded-xl p-8 flex flex-col justify-between group">
          <p className="tech-label tracking-[0.18em]">{t("stats.opportunities", "Opportunities")}</p>
          <div>
            <p className="text-4xl font-semibold leading-none text-primary num lg:text-5xl">
              <NumberTicker value={stats.good_deals_count} delay={0.3} />+
            </p>
            <p className="mt-4 tech-label text-muted-foreground">{t("stats.arbitrageDeals", "Arbitrage Deals")}</p>
          </div>
        </div>

      </div>

      {/* Subline Data */}
      <div className="mt-8 flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2 opacity-80">
          <p className="tech-label text-muted-foreground">
            {t("stats.multiPlatform", "Multi-platform Aggregate · {sources}", { sources: sourceLabel })}
          </p>
          <DataFreshnessIndicator
            latestListingAt={latestListingAt}
            lastUpdated={stats.last_updated}
            variant="subline"
          />
        </div>
        <p className="tech-label text-muted-foreground opacity-80">Build v1.4.2</p>
      </div>
    </div>
  );
});

StatsBar.displayName = "StatsBar";
