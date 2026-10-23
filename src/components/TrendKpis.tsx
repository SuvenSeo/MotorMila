import { useMemo } from "react";
import { Area, AreaChart, YAxis } from "recharts";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { PriceTrendPoint } from "@/types/car";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { changeTone, formatChangePct, formatMnShort, paddedDomain, TONE_STYLES } from "@/lib/dataSanity";
import { formatPriceLkrMillions } from "@/lib/formatting";
import { useAppPreferences } from "@/lib/appPreferences";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { CountUpOnView, FlowLkr } from "@/components/motion/FlowNumber";

/**
 * KPI strip for the Trends page. Three cards with mini sparklines (shadcn
 * chart on Recharts), computed from the real visible trend series: current
 * median, change vs the oldest month, and sample coverage.
 * Returns null when there is no series to summarize.
 */
export function TrendKpis({ points }: { points: PriceTrendPoint[] }) {
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

  if (!kpis) return null;

  const tone = changeTone(kpis.changePct);
  const DeltaIcon = tone === "down" ? TrendingDown : tone === "up" ? TrendingUp : Minus;
  const chartConfig = {
    median: { label: t("trendKpis.median", "Median"), color: TONE_STYLES[tone].stroke },
  } satisfies ChartConfig;

  const changeRounded = Math.round(kpis.changePct * 10) / 10;
  const cards: Array<{ label: string; value: string; sub: string; delta?: boolean; animated?: ReactNode }> = [
    {
      label: t("trendKpis.medianNow", "Median now"),
      value: formatPriceLkrMillions(kpis.last.median_price),
      animated: <FlowLkr countUp value={kpis.last.median_price} label={formatPriceLkrMillions(kpis.last.median_price)} />,
      sub: `${formatMnShort(kpis.last.median_price)} · ${kpis.last.month}`,
    },
    {
      label: t("trendKpis.changeVs", "Change vs {month}", { month: kpis.first.month }),
      value: tone === "stable" ? t("trendTone.stableShort", "Stable") : formatChangePct(kpis.changePct),
      animated:
        tone === "stable" ? undefined : (
          <CountUpOnView
            value={Math.abs(changeRounded)}
            prefix={changeRounded > 0 ? "+" : changeRounded < 0 ? "\u2212" : ""}
            suffix="%"
            format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
            label={formatChangePct(kpis.changePct)}
          />
        ),
      sub: t("trendKpis.window", "Across the visible window"),
      delta: true,
    },
    {
      label: t("trendKpis.sampled", "Listings sampled"),
      value: kpis.totalSamples.toLocaleString("en-LK"),
      animated: <CountUpOnView value={kpis.totalSamples} label={kpis.totalSamples.toLocaleString("en-LK")} />,
      sub: t("trendKpis.months", "{n} months of history", { n: kpis.months }),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label={t("trendKpis.aria", "Trend key figures")}>
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="text-caption font-semibold text-muted-foreground">{c.label}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <p className="num text-title2 font-bold leading-tight tracking-tight text-foreground">{c.animated ?? c.value}</p>
            {c.delta && (
              <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-caption font-bold", TONE_STYLES[tone].chip)}>
                <DeltaIcon className="h-3 w-3" aria-hidden />
                {tone === "stable" ? `<1%` : `${Math.abs(kpis.changePct).toFixed(1)}%`}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-caption font-medium text-muted-foreground">{c.sub}</p>
          <ChartContainer config={chartConfig} className="mt-2 aspect-auto h-14 w-full" aria-hidden>
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
        </div>
      ))}
    </div>
  );
}
