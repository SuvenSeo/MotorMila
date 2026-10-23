import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { getPriceTrends, formatPrice } from "@/services/api";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { useAppPreferences } from "@/lib/appPreferences";
import { cn } from "@/lib/utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { changeTone, formatChangePct, formatMnShort, paddedDomain, TONE_STYLES } from "@/lib/dataSanity";
import { TrendToneLegend } from "@/components/data/TrendToneLegend";

/** "2026-03" → "Mar 26" — short enough that 12 ticks never overprint. */
export function shortMonth(key: string): string {
  const [y, m] = String(key || "").split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

/**
 * Per-model 12-month price trend — shadcn chart on Recharts v3, wired to the
 * real trend API. Y-axis is a padded domain (never forced to zero) labelled in
 * millions; colour follows the buyer-neutral tone (down green, up amber, stable grey).
 */
export function ModelTrendPanel({ make, model }: { make: string; model: string }) {
  const { t } = useAppPreferences();
  const { data, isLoading } = useQuery({
    queryKey: ["model-trend-panel", make, model],
    queryFn: () => getPriceTrends(make, model),
    enabled: Boolean(make && model),
    staleTime: QUERY_STALE.hub,
  });

  const points = useMemo(() => (data ?? []).filter((p) => Number(p.median_price) > 0), [data]);
  const chartData = useMemo(
    () => points.map((p) => ({ month: p.month, label: shortMonth(p.month), median: Number(p.median_price) })),
    [points],
  );
  const domain = useMemo(() => paddedDomain(chartData.map((d) => d.median)), [chartData]);

  if (!isLoading && points.length < 2) return null;

  const first = Number(points[0]?.median_price ?? 0);
  const last = Number(points[points.length - 1]?.median_price ?? 0);
  const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
  const tone = changeTone(changePct);
  const Icon = tone === "down" ? TrendingDown : tone === "up" ? TrendingUp : Minus;
  const chartConfig = {
    median: { label: t("modelTrend.medianPrice", "Median price"), color: TONE_STYLES[tone].stroke },
  } satisfies ChartConfig;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-caption font-semibold text-muted-foreground">
            {t("modelTrend.eyebrow", "Price history")}
          </p>
          <h3 className="mt-1 font-display text-title3 font-semibold text-foreground">
            {t("modelTrend.title", "{make} {model} — 12-month trend", { make, model })}
          </h3>
          <p className="mt-1 text-footnote text-muted-foreground">
            {t("modelTrend.sub", "Median asking price · trailing 12 months")}
          </p>
        </div>
        {!isLoading && (
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-footnote font-semibold", TONE_STYLES[tone].chip)}>
            <Icon className="h-4 w-4" aria-hidden />
            {tone === "stable" ? t("trendTone.stableShort", "Stable") : formatChangePct(changePct)}{" "}
            {t("modelTrend.thisYear", "this year")}
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="mt-6 h-64 animate-pulse rounded-xl bg-surface sm:h-72" aria-hidden />
      ) : (
        <>
          <ChartContainer
            config={chartConfig}
            className="mt-6 aspect-auto h-64 w-full sm:h-72"
            role="img"
            aria-label={t("modelTrend.aria", "{make} {model} median asking price, {n} months, latest {price}", {
              make,
              model,
              n: chartData.length,
              price: formatPrice(last),
            })}
          >
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="modelTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-median)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--color-median)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 6" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={28}
                interval="preserveStartEnd"
                fontSize={12}
              />
              <YAxis
                domain={domain ?? ["auto", "auto"]}
                tickFormatter={(v: number) => formatMnShort(v)}
                tickLine={false}
                axisLine={false}
                tickCount={4}
                width={48}
                fontSize={12}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    formatter={(value) => (
                      <span className="num font-semibold text-foreground">{formatPrice(Number(value))}</span>
                    )}
                  />
                }
              />
              <Area
                dataKey="median"
                type="monotone"
                stroke="var(--color-median)"
                strokeWidth={2.5}
                fill="url(#modelTrendFill)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ChartContainer>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <TrendToneLegend />
            <span className="text-caption font-medium text-muted-foreground">
              {t("chart.mnNote", "Mn = million rupees (Rs 1,000,000)")}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
