import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { getPriceTrends, formatPrice } from "@/services/api";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { useAppPreferences } from "@/lib/appPreferences";
import { formatChangePct, formatMnShort, paddedDomain } from "@/lib/dataSanity";
import { TrendToneLegend } from "@/components/data/TrendToneLegend";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChartFrame,
  ChartTooltipCard,
  chartAxis,
  chartColor,
  chartGrid,
  chartTooltip,
  toneBadge,
  toneColor,
  toneFor,
  useChartCalm,
  useChartDraw,
} from "@/components/ui/chart-theme";

/** "2026-03" → "Mar 26" — short enough that 12 ticks never overprint. */
export function shortMonth(key: string): string {
  const [y, m] = String(key || "").split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

/**
 * Per-model 12-month price trend on the shared chart theme, wired to the real
 * trend API. Y-axis is a padded domain (never forced to zero) labelled in
 * millions; colour follows the buyer-neutral tone (down green, up amber,
 * stable slate). Loading → chart skeleton; <2 points → empty state; error →
 * retry, all in the same footprint.
 */
export function ModelTrendPanel({
  make,
  model,
  displayMake,
  displayModel,
}: {
  make: string;
  model: string;
  /** Human casing for copy (route params can be lowercase slugs). */
  displayMake?: string;
  displayModel?: string;
}) {
  const names = { make: displayMake ?? make, model: displayModel ?? model };
  const { t } = useAppPreferences();
  const calm = useChartCalm();
  const { data, isLoading, isError, refetch } = useQuery({
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
  const ready = !isLoading && !isError && chartData.length >= 2;
  const draw = useChartDraw(ready);

  const first = Number(points[0]?.median_price ?? 0);
  const last = Number(points[points.length - 1]?.median_price ?? 0);
  const changePct = points.length >= 2 && first > 0 ? ((last - first) / first) * 100 : null;
  const tone = toneFor(changePct);
  const stroke = toneColor(tone);
  const Icon = tone === "down" ? TrendingDown : tone === "up" ? TrendingUp : Minus;
  const state = isLoading ? "loading" : isError ? "error" : chartData.length < 2 ? "empty" : "ready";

  return (
    <Card padding="md" className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-footnote font-semibold text-primary">{t("modelTrend.eyebrow", "Price history")}</p>
          <h3 className="mt-1 font-display text-title3 font-semibold text-foreground">
            {t("modelTrend.title", "{make} {model} — 12-month trend", { ...names })}
          </h3>
          <p className="mt-1 text-footnote text-label-2">{t("modelTrend.sub", "Median asking price · trailing 12 months")}</p>
        </div>
        {state === "ready" && changePct !== null && (
          <Badge variant={toneBadge(tone)} className="tabular-nums">
            <Icon aria-hidden />
            {tone === "stable" ? t("trendTone.stableShort", "Stable") : formatChangePct(changePct)}{" "}
            {t("modelTrend.thisYear", "this year")}
          </Badge>
        )}
      </div>
      <ChartFrame
        state={state}
        className="mt-5"
        heightClass="h-64 sm:h-72"
        emptyTitle={t("modelTrend.emptyTitle", "Not enough months yet")}
        emptyBody={t("modelTrend.emptyBody", "The trend line appears once two months of {make} {model} ads are in.", { ...names })}
        errorTitle={t("modelTrend.errorTitle", "The trend didn't load")}
        onRetry={() => void refetch()}
        label={t("modelTrend.aria", "{make} {model} median asking price, {n} months, latest {price}", {
          ...names,
          n: chartData.length,
          price: formatPrice(last),
        })}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 14, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="modelTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...chartGrid} />
            <XAxis {...chartAxis} dataKey="label" minTickGap={28} interval="preserveStartEnd" />
            <YAxis
              {...chartAxis}
              domain={domain ?? ["auto", "auto"]}
              tickFormatter={(v: number) => formatMnShort(v)}
              tickCount={4}
              width={68}
            />
            <Tooltip
              {...chartTooltip(calm)}
              content={(p) => (
                <ChartTooltipCard
                  {...p}
                  rows={(payload) => [
                    {
                      label: t("modelTrend.medianPrice", "Median price"),
                      value: formatPrice(Number(payload?.[0]?.value)),
                      color: stroke,
                    },
                  ]}
                />
              )}
            />
            <Area
              dataKey="median"
              type="monotone"
              stroke={stroke}
              strokeWidth={2.5}
              fill="url(#modelTrendFill)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: stroke, stroke: chartColor.surface }}
              {...draw}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartFrame>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <TrendToneLegend />
        <span className="text-caption text-label-2">{t("chart.mnNote", "Mn = million rupees (Rs 1,000,000)")}</span>
      </div>
    </Card>
  );
}
