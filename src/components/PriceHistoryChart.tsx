import { memo, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatPriceLkrMillions } from "@/lib/formatting";
import { paddedDomain } from "@/lib/dataSanity";
import { TrendToneLegend } from "@/components/data/TrendToneLegend";
import type { PriceTrendPoint } from "@/types/car";
import { formatLkrAxisFromMillions } from "@/lib/price";
import { useAppPreferences } from "@/lib/appPreferences";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { LkrValue } from "@/components/ui/stat-tile";

interface PriceHistoryChartProps {
  title?: string;
  points?: PriceTrendPoint[];
  isLoading?: boolean;
  emptyMessage?: string;
  coverageNote?: string | null;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  /**
   * "cinematic": the Trends hero chart. A dark ink card in both themes,
   * hairline grid, a dot only on the latest month, and a one-shot draw-in done
   * by sliding a curtain off the plot (transform only, no per-frame paint).
   */
  variant?: "default" | "cinematic";
}

function formatMonthLabel(monthKey: string): string {
  const [yearRaw, monthRaw] = String(monthKey || "").split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return monthKey;
  }
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** Compact axis tick ("Mar 26") so 12 months never overprint on mobile. */
function formatMonthTick(monthKey: string): string {
  const [yearRaw, monthRaw] = String(monthKey || "").split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return monthKey;
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

/** Cinematic line when the series has no direction yet (one month). */
const CINE_LINE = "hsl(213 100% 64%)";
/** Hairline, solid, horizontal-only grid for the dark card. */
const CINE_GRID = { vertical: false, stroke: "hsl(0 0% 100% / 0.07)", strokeDasharray: undefined } as const;

/** A dot on the latest month only (the "now" marker); the rest of the line stays clean. */
function lastDot(n: number, stroke: string) {
  return function LastDot(props: { cx?: number; cy?: number; index?: number }) {
    const { cx, cy, index } = props;
    if (index !== n - 1 || cx == null || cy == null) return <g key={`d-${index}`} />;
    return (
      <g key={`d-${index}`}>
        <circle cx={cx} cy={cy} r={7} fill={stroke} fillOpacity={0.18} />
        <circle cx={cx} cy={cy} r={3.5} fill={stroke} stroke="hsl(222 40% 3%)" strokeWidth={2} />
      </g>
    );
  };
}

function formatPercentChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export const PriceHistoryChart = memo(function PriceHistoryChart({
  title,
  points = [],
  isLoading = false,
  emptyMessage,
  coverageNote,
  emptyActionLabel,
  onEmptyAction,
  variant = "default",
}: PriceHistoryChartProps) {
  const cine = variant === "cinematic";
  const { t } = useAppPreferences();
  const calm = useChartCalm();
  const heading = title ?? t("priceChart.defaultTitle", "Sri Lanka market");

  const normalizedPoints = useMemo(() => {
    return [...points]
      .filter((point) => Number.isFinite(Number(point?.median_price)) && Number(point?.median_price) > 0)
      .sort((a, b) => String(a.month).localeCompare(String(b.month)));
  }, [points]);

  const chartData = useMemo(() => {
    return normalizedPoints.map((point) => ({
      label: formatMonthLabel(point.month),
      tick: formatMonthTick(point.month),
      month: point.month,
      median_million: Number(point.median_price) / 1_000_000,
      median_lkr: Number(point.median_price),
      sample_count: Number(point.sample_count || 0),
    }));
  }, [normalizedPoints]);

  const drawProps = useChartDraw(!isLoading && chartData.length > 0);
  // Cinematic: the series renders final; a curtain does the reveal, once per
  // page visit (it mounts with the plot, which may be deferred below the fold).
  const [curtainDone, setCurtainDone] = useState(false);
  const curtain = cine && !calm && !curtainDone;
  const draw = cine ? { ...drawProps, className: undefined } : drawProps;

  const latestPoint = normalizedPoints.length ? normalizedPoints[normalizedPoints.length - 1] : null;
  const baselinePoint = normalizedPoints.length ? normalizedPoints[0] : null;
  const highPoint = normalizedPoints.length
    ? normalizedPoints.reduce((best, point) => (Number(point.median_price) > Number(best.median_price) ? point : best))
    : null;
  const lowPoint = normalizedPoints.length
    ? normalizedPoints.reduce((best, point) => (Number(point.median_price) < Number(best.median_price) ? point : best))
    : null;

  const changePct =
    normalizedPoints.length >= 2 && baselinePoint && latestPoint && Number(baselinePoint.median_price) > 0
      ? ((Number(latestPoint.median_price) - Number(baselinePoint.median_price)) / Number(baselinePoint.median_price)) * 100
      : null;
  const tone = toneFor(changePct);
  const stroke = changePct === null ? (cine ? CINE_LINE : chartColor.primary) : toneColor(tone);
  const ToneIcon = changePct === null || tone === "stable" ? Minus : tone === "up" ? ArrowUpRight : ArrowDownRight;
  const totalSamples = normalizedPoints.reduce((sum, point) => sum + Number(point.sample_count || 0), 0);
  const averageSamples = normalizedPoints.length ? Math.round(totalSamples / normalizedPoints.length) : 0;
  const periodLabel =
    baselinePoint && latestPoint
      ? baselinePoint.month === latestPoint.month
        ? formatMonthLabel(latestPoint.month)
        : t("priceChart.period", "{from} to {to}", {
            from: formatMonthLabel(baselinePoint.month),
            to: formatMonthLabel(latestPoint.month),
          })
      : null;
  // Cinematic: a fixed tick stride instead of Recharts' "preserveStartEnd",
  // which measures every tick label in a hidden span (a forced layout of the
  // whole page per label, ~100 ms at 4x CPU on Trends).
  const xInterval = useMemo(() => {
    const narrow = typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches;
    const maxTicks = narrow ? 4 : 8;
    return Math.max(0, Math.ceil(chartData.length / maxTicks) - 1);
  }, [chartData.length]);
  const cineDot = useMemo(() => lastDot(chartData.length, stroke), [chartData.length, stroke]);
  // Padded domain, never forced to zero: a 7.6–8.0M series fills the plot.
  const yDomain = paddedDomain(chartData.map((d) => d.median_million));
  // Cinematic: round ticks inside the padded domain, one per distinct label
  // (the default ticks land on the domain's ragged edges and can repeat a label).
  const yLo = yDomain?.[0];
  const yHi = yDomain?.[1];
  const yTicks = useMemo(() => {
    if (!cine || yLo == null || yHi == null || !(yHi > yLo)) return undefined;
    const raw = (yHi - yLo) / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= raw) ?? raw;
    const seen = new Set<string>();
    const out: number[] = [];
    for (let v = Math.ceil(yLo / step) * step; v <= yHi + 1e-9; v += step) {
      const tick = Number(v.toFixed(6));
      const text = formatLkrAxisFromMillions(tick);
      if (!seen.has(text)) {
        seen.add(text);
        out.push(tick);
      }
    }
    return out.length >= 2 ? out : undefined;
  }, [cine, yLo, yHi]);

  // A line needs two points; one month is a figure, not a chart.
  const state = isLoading ? "loading" : chartData.length < 2 ? "empty" : "ready";
  const emptyTitle =
    chartData.length === 1 ? t("priceChart.oneMonthTitle", "One month of history so far") : t("priceChart.emptyTitle", "No price history yet");
  const emptyBody =
    emptyMessage ??
    (chartData.length === 1
      ? t("priceChart.oneMonthBody", "The line appears once a second month of listings is in.")
      : t("priceChart.emptyBody", "No historical values available for this selection."));

  const facts = [
    {
      label: t("priceChart.currentMedian", "Current median"),
      value: <LkrValue value={latestPoint ? Number(latestPoint.median_price) : null} />,
    },
    {
      label: t("priceChart.range", "Range"),
      value:
        lowPoint && highPoint && normalizedPoints.length >= 2
          ? `${formatPriceLkrMillions(lowPoint.median_price)} – ${formatPriceLkrMillions(highPoint.median_price)}`
          : "—",
    },
    {
      label: t("priceChart.avgDepth", "Avg depth"),
      value:
        averageSamples > 0
          ? t("priceChart.samplesMonth", "{n} ads a month", { n: averageSamples.toLocaleString("en-US") })
          : "—",
    },
  ];

  return (
    <Card
      padding="md"
      className={cine ? "cine-result cine-chart theme-dark w-full border-foreground/10 bg-[hsl(var(--cine-ink))] text-foreground shadow-e2" : "w-full"}
    >
      {cine ? <div aria-hidden className="cine-result__light" /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className={cine ? "cine-eyebrow text-white/60" : "text-footnote font-semibold text-primary"}>{t("priceChart.eyebrow", "Price history")}</p>
          <h3 className={cine ? "cine-display mt-2 text-[clamp(1.5rem,1.1rem+1.6vw,2.25rem)] text-white [overflow-wrap:anywhere]" : "mt-1 font-display text-title2 font-semibold text-foreground [overflow-wrap:anywhere]"}>{heading}</h3>
          {periodLabel ? <p className="mt-1 text-footnote text-label-2">{periodLabel}</p> : null}
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {state === "ready" ? (
            <Badge variant={changePct === null ? "neutral" : toneBadge(tone)} className="tabular-nums">
              <ToneIcon aria-hidden />
              {formatPercentChange(changePct)}
            </Badge>
          ) : null}
          {coverageNote ? (
            <p className="max-w-sm text-caption text-label-2 sm:text-right">{coverageNote}</p>
          ) : null}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label} className={cine ? "min-w-0 border-t border-foreground/10 pt-2.5" : "min-w-0 rounded-control bg-surface-2 px-3 py-2.5"}>
            <dt className="text-caption text-label-2">{f.label}</dt>
            <dd className="mt-0.5 truncate text-callout font-semibold tabular-nums text-foreground">{isLoading ? "—" : f.value}</dd>
          </div>
        ))}
      </dl>

      <ChartFrame
        state={state}
        className="mt-5"
        heightClass="h-72 sm:h-96"
        deferUntilNear={cine}
        emptyTitle={emptyTitle}
        emptyBody={emptyBody}
        emptyAction={
          emptyActionLabel && onEmptyAction ? (
            <Button variant="secondary" size="sm" onClick={onEmptyAction}>
              {emptyActionLabel}
            </Button>
          ) : undefined
        }
        label={t("priceChart.aria", "{title}: {n} months of median asking prices, latest {month}", {
          title: heading,
          n: chartData.length,
          month: latestPoint ? formatMonthLabel(latestPoint.month) : "",
        })}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 12, right: cine ? 22 : 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="priceHistoryGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={cine ? 0.16 : 0.22} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...(cine ? CINE_GRID : chartGrid)} />
            <XAxis {...chartAxis} dataKey="tick" minTickGap={28} interval={cine ? xInterval : "preserveStartEnd"} />
            <YAxis
              {...chartAxis}
              domain={yDomain ?? ["auto", "auto"]}
              tickCount={5}
              allowDecimals
              tickFormatter={(value: number) => formatLkrAxisFromMillions(value)}
              width={68}
              interval={cine ? 0 : undefined}
              ticks={yTicks}
            />
            <Tooltip
              {...chartTooltip(calm)}
              content={(p) => (
                <ChartTooltipCard
                  {...p}
                  title={(_l, payload) => String((payload?.[0]?.payload as { label?: string } | undefined)?.label ?? "")}
                  rows={(payload) => {
                    const row = payload?.[0]?.payload as { median_lkr: number; sample_count: number } | undefined;
                    if (!row) return [];
                    return [
                      { label: t("priceChart.median", "Median"), value: formatPriceLkrMillions(row.median_lkr), color: stroke },
                      ...(row.sample_count > 0
                        ? [{ label: t("priceChart.ads", "Ads"), value: row.sample_count.toLocaleString("en-US") }]
                        : []),
                    ];
                  }}
                />
              )}
            />
            <Area
              type="monotone"
              dataKey="median_million"
              name="Median"
              stroke={stroke}
              strokeWidth={cine ? 2 : 2.5}
              fillOpacity={1}
              fill="url(#priceHistoryGradient)"
              dot={cine ? cineDot : chartData.length <= 14 ? { r: 2.5, strokeWidth: 2, fill: chartColor.surface, stroke } : false}
              activeDot={{ r: 5, strokeWidth: 2, fill: stroke, stroke: chartColor.surface }}
              connectNulls
              {...draw}
            />
          </AreaChart>
        </ResponsiveContainer>
        {curtain ? (
          <span aria-hidden className="cine-chart__curtain-wrap">
            <span className="cine-chart__curtain" onAnimationEnd={() => setCurtainDone(true)} />
          </span>
        ) : null}
      </ChartFrame>

      <div className="mt-4 flex flex-col gap-2 border-t border-separator pt-4 sm:flex-row sm:items-center sm:justify-between">
        <TrendToneLegend />
        <span className="text-caption tabular-nums text-label-2">
          {totalSamples > 0
            ? t("priceChart.tracked", "{n} ads tracked across this range · axis in Mn", { n: totalSamples.toLocaleString("en-US") })
            : t("chart.mnNote", "Mn = million rupees (Rs 1,000,000)")}
        </span>
      </div>
    </Card>
  );
});
