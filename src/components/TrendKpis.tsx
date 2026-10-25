import { useMemo } from "react";
import { Area, AreaChart, YAxis } from "recharts";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { PriceTrendPoint } from "@/types/car";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { formatChangePct, formatMnShort, paddedDomain } from "@/lib/dataSanity";
import { useAppPreferences } from "@/lib/appPreferences";
import { Badge } from "@/components/ui/badge";
import { StatTile, LkrValue, CountValue, FlowValue } from "@/components/ui/stat-tile";
import { toneBadge, toneColor, toneFor } from "@/components/ui/chart-theme";

/**
 * KPI strip for the Trends page: current median, change vs the oldest month,
 * and sample coverage, each with a token-coloured sparkline from the real
 * visible series. Loading shows three tile skeletons; no series → null (the
 * chart below carries the empty state).
 */
export function TrendKpis({ points, loading = false }: { points: PriceTrendPoint[]; loading?: boolean }) {
  const { t } = useAppPreferences();
  const kpis = useMemo(() => {
    const clean = points.filter((p) => Number.isFinite(p.median_price) && p.median_price > 0);
    if (clean.length < 2) return null;
    const first = clean[0];
    const last = clean[clean.length - 1];
    const changePct = ((last.median_price - first.median_price) / first.median_price) * 100;
    const spark = clean.map((p) => ({ month: p.month, median: p.median_price }));
    const totalSamples = clean.reduce((a, p) => a + (Number(p.sample_count) || 0), 0);
    const domain = paddedDomain(spark.map((s) => s.median), 0.15);
    return { first, last, changePct, spark, totalSamples, months: clean.length, domain };
  }, [points]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <StatTile key={i} loading label={"\u00a0"} value={null} hint=" " />
        ))}
      </div>
    );
  }
  if (!kpis) return null;

  const tone = toneFor(kpis.changePct);
  const DeltaIcon = tone === "down" ? TrendingDown : tone === "up" ? TrendingUp : Minus;
  const chartConfig = {
    median: { label: t("trendKpis.median", "Median"), color: toneColor(tone) },
  } satisfies ChartConfig;
  const changeRounded = Math.round(kpis.changePct * 10) / 10;

  const spark = (
    <ChartContainer config={chartConfig} className="mt-3 aspect-auto h-12 w-full" aria-hidden>
      <AreaChart data={kpis.spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        {kpis.domain && <YAxis hide domain={kpis.domain} />}
        <Area
          dataKey="median"
          type="monotone"
          stroke="var(--color-median)"
          strokeWidth={2}
          fill="var(--color-median)"
          fillOpacity={0.12}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ChartContainer>
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label={t("trendKpis.aria", "Trend key figures")}>
      <StatTile
        label={t("trendKpis.medianNow", "Median now")}
        value={<LkrValue value={kpis.last.median_price} />}
        hint={`${formatMnShort(kpis.last.median_price)} · ${kpis.last.month}`}
      >
        {spark}
      </StatTile>
      <StatTile
        label={t("trendKpis.changeVs", "Change vs {month}", { month: kpis.first.month })}
        value={
          <span className="inline-flex flex-wrap items-center gap-2">
            {tone === "stable" ? (
              t("trendTone.stableShort", "Stable")
            ) : (
              <FlowValue
                value={changeRounded}
                format={{ minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" }}
                suffix="%"
                label={formatChangePct(kpis.changePct)}
              />
            )}
            <Badge variant={toneBadge(tone)} className="font-sans">
              <DeltaIcon aria-hidden />
              {tone === "stable" ? "<1%" : tone === "up" ? t("trendTone.up", "Price up") : t("trendTone.down", "Price down")}
            </Badge>
          </span>
        }
        hint={t("trendKpis.window", "Across the visible window")}
      >
        {spark}
      </StatTile>
      <StatTile
        label={t("trendKpis.sampled", "Listings sampled")}
        value={<CountValue value={kpis.totalSamples} />}
        hint={t("trendKpis.months", "{n} months of history", { n: kpis.months })}
      >
        {spark}
      </StatTile>
    </div>
  );
}
