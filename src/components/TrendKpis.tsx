import { useMemo } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { PriceTrendPoint } from "@/types/car";
import { formatChangePct, formatMnShort, paddedDomain } from "@/lib/dataSanity";
import { useAppPreferences } from "@/lib/appPreferences";
import { Badge } from "@/components/ui/badge";
import { StatTile, LkrValue, CountValue, FlowValue } from "@/components/ui/stat-tile";
import { toneBadge, toneColor, toneFor } from "@/components/ui/chart-theme";

/**
 * Plain-SVG sparkline (monotone-ish curve + soft fill). Three Recharts
 * AreaCharts (each with a ResponsiveContainer measuring its box) cost ~150 ms
 * of main thread at 4x CPU on every Trends load and filter change; a path
 * string is microseconds and scales with the tile via viewBox.
 */
function Sparkline({ values, domain, color }: { values: number[]; domain: [number, number] | null; color: string }) {
  const { line, area } = useMemo(() => {
    const W = 100;
    const H = 48;
    const top = 2;
    const [lo, hi] = domain ?? [Math.min(...values), Math.max(...values)];
    const span = hi - lo || 1;
    const pts = values.map((v, i) => [
      values.length === 1 ? W / 2 : (i / (values.length - 1)) * W,
      top + (1 - (v - lo) / span) * (H - top),
    ]);
    // Smooth through midpoints (quadratic), like Recharts' monotone look.
    let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const mx = (x0 + x1) / 2;
      d += ` C${mx.toFixed(2)},${y0.toFixed(2)} ${mx.toFixed(2)},${y1.toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)}`;
    }
    return { line: d, area: `${d} L${W},${H} L0,${H} Z` };
  }, [values, domain]);
  return (
    <svg aria-hidden viewBox="0 0 100 48" preserveAspectRatio="none" className="mt-3 block h-12 w-full overflow-visible">
      <path d={area} style={{ fill: color }} fillOpacity={0.12} stroke="none" />
      <path d={line} fill="none" style={{ stroke: color }} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

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
    return { first, last, changePct, sparkValues: spark.map((s) => s.median), totalSamples, months: clean.length, domain };
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
  const changeRounded = Math.round(kpis.changePct * 10) / 10;

  const spark = <Sparkline values={kpis.sparkValues} domain={kpis.domain} color={toneColor(tone)} />;

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
