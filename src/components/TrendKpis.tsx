import { useMemo } from "react";
import { AreaChart, Card, Metric, Text } from "@tremor/react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { PriceTrendPoint } from "@/types/car";

function compactLkr(v: number): string {
  if (v >= 1_000_000) return `Rs ${ (v / 1_000_000).toFixed(2) }M`;
  if (v >= 1_000) return `Rs ${ (v / 1_000).toFixed(0) }K`;
  return `Rs ${v.toFixed(0)}`;
}

/**
 * Tremor KPI strip for the Trends page (#7 UI review). Three KPI cards with
 * mini area sparklines, computed from the real visible trend series:
 * current median, change vs the oldest month, and sample coverage.
 * Returns null when there is no series to summarize.
 */
export function TrendKpis({ points }: { points: PriceTrendPoint[] }) {
  const kpis = useMemo(() => {
    const clean = points.filter((p) => Number.isFinite(p.median_price) && p.median_price > 0);
    if (clean.length < 2) return null;
    const first = clean[0];
    const last = clean[clean.length - 1];
    const changePct = ((last.median_price - first.median_price) / first.median_price) * 100;
    const spark = clean.map((p) => ({ month: p.month, Median: p.median_price }));
    const totalSamples = clean.reduce((a, p) => a + (Number(p.sample_count) || 0), 0);
    return { first, last, changePct, spark, totalSamples, months: clean.length };
  }, [points]);

  if (!kpis) return null;

  const down = kpis.changePct < 0;
  const DeltaIcon = down ? TrendingDown : TrendingUp;

  const cards = [
    {
      label: "Median now",
      value: compactLkr(kpis.last.median_price),
      hint: kpis.last.month,
    },
    {
      label: `Change vs ${kpis.first.month}`,
      value: `${down ? "" : "+"}${kpis.changePct.toFixed(1)}%`,
      hint: "Across the visible window",
      delta: true,
    },
    {
      label: "Listings sampled",
      value: kpis.totalSamples.toLocaleString(),
      hint: `${kpis.months} months of history`,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Trend key figures">
      {cards.map((c) => (
        <Card key={c.label} className="!rounded-2xl p-4">
          <Text>{c.label}</Text>
          <div className="mt-1 flex items-center gap-1.5">
            <Metric className="!text-[1.65rem]">{c.value}</Metric>
            {c.delta && (
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                  down ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                }`}
              >
                <DeltaIcon className="h-3 w-3" aria-hidden />
                {Math.abs(kpis.changePct).toFixed(1)}%
              </span>
            )}
          </div>
          <Text className="mt-0.5 !text-[11px]">{c.hint}</Text>
          <AreaChart
            className="mt-2 h-16"
            data={kpis.spark}
            index="month"
            categories={["Median"]}
            colors={[down ? "emerald" : "rose"]}
            showXAxis={false}
            showYAxis={false}
            showGridLines={false}
            showLegend={false}
            showTooltip={false}
            startEndOnly={false}
          />
        </Card>
      ))}
    </div>
  );
}
