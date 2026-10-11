import AreaChart from "@tremor/react/dist/components/chart-elements/AreaChart/AreaChart.js";
import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp } from "lucide-react";
import { getPriceTrends, formatPrice } from "@/services/api";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { useAppPreferences } from "@/lib/appPreferences";
import { cn } from "@/lib/utils";

/**
 * Per-model 12-month price trend — Tremor AreaChart (deep import: no barrel,
 * so recharts stays out of the main chunk). Wired to the real trend API.
 * Wrapped in `.apex` to re-tokenize Tremor's emerald to Deal Green.
 */
export function ModelTrendPanel({ make, model }: { make: string; model: string }) {
  const { t } = useAppPreferences();
  const { data, isLoading } = useQuery({
    queryKey: ["model-trend-panel", make, model],
    queryFn: () => getPriceTrends(make, model),
    enabled: Boolean(make && model),
    staleTime: QUERY_STALE.hub,
  });

  const points = (data ?? []).filter((p) => Number(p.median_price) > 0);
  if (!isLoading && points.length < 2) return null;

  const chartData = points.map((p) => ({
    month: p.month,
    [t("modelTrend.medianPrice", "Median price")]: Number(p.median_price),
  }));
  const first = Number(points[0]?.median_price ?? 0);
  const last = Number(points[points.length - 1]?.median_price ?? 0);
  const dropPct = first > 0 ? ((first - last) / first) * 100 : 0;
  const softened = dropPct > 0;

  return (
    <div className="apex rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold text-muted-foreground">
            {t("modelTrend.eyebrow", "Price history")}
          </p>
          <h3 className="mt-1 font-display text-xl font-semibold text-foreground">
            {t("modelTrend.title", "{make} {model} — 12-month trend", { make, model })}
          </h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("modelTrend.sub", "Median asking price · trailing 12 months")}
          </p>
        </div>
        {!isLoading && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold",
              softened ? "bg-deal-green/10 text-deal-green" : "bg-primary/10 text-primary",
            )}
          >
            {softened ? (
              <TrendingDown className="h-4 w-4" aria-hidden />
            ) : (
              <TrendingUp className="h-4 w-4" aria-hidden />
            )}
            {softened ? "−" : "+"}
            {Math.abs(dropPct).toFixed(1)}% {t("modelTrend.thisYear", "this year")}
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="mt-6 h-72 animate-pulse rounded-xl bg-surface" aria-hidden />
      ) : (
        <AreaChart
          className="mt-6 h-72"
          data={chartData}
          index="month"
          categories={[t("modelTrend.medianPrice", "Median price")]}
          colors={["blue"]}
          valueFormatter={(v: number) => formatPrice(v)}
          showLegend={false}
          showGridLines={false}
          showAnimation={true}
          curveType="monotone"
          yAxisWidth={72}
        />
      )}
    </div>
  );
}
