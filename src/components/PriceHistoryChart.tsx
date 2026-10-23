import { useEffect, useMemo, useRef } from "react";
import { m } from "motion/react";
import { fadeIn, useReducedMotionOrLowData } from "@/lib/motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowDownRight, ArrowUpRight, BarChart3, Gauge } from "lucide-react";
import { formatPriceLkrMillions } from "@/lib/formatting";
import { changeTone, paddedDomain, TONE_STYLES } from "@/lib/dataSanity";
import { TrendToneLegend } from "@/components/data/TrendToneLegend";
import type { PriceTrendPoint } from "@/types/car";
import { formatLkrAxisFromMillions } from "@/lib/price";

interface PriceHistoryChartProps {
  title?: string;
  points?: PriceTrendPoint[];
  isLoading?: boolean;
  emptyMessage?: string;
  coverageNote?: string | null;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
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

function formatPercentChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatSampleCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "Collecting samples";
  return `${value.toLocaleString()} samples`;
}

export function PriceHistoryChart({
  title = "Sri Lanka Market",
  points = [],
  isLoading = false,
  emptyMessage = "No historical values available for this selection.",
  coverageNote,
  emptyActionLabel,
  onEmptyAction,
}: PriceHistoryChartProps) {
  const motionStill = useReducedMotionOrLowData();
  // Recharts animates every data change; we only want the first draw.
  const drewOnce = useRef(false);
  const animateDraw = !motionStill && !drewOnce.current;
  useEffect(() => {
    if (!isLoading && points.length > 0) {
      const id = window.setTimeout(() => { drewOnce.current = true; }, 650);
      return () => window.clearTimeout(id);
    }
  }, [isLoading, points.length]);
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

  const latestPoint = normalizedPoints.length ? normalizedPoints[normalizedPoints.length - 1] : null;
  const baselinePoint = normalizedPoints.length ? normalizedPoints[0] : null;
  const highPoint = normalizedPoints.length
    ? normalizedPoints.reduce((best, point) => (Number(point.median_price) > Number(best.median_price) ? point : best))
    : null;
  const lowPoint = normalizedPoints.length
    ? normalizedPoints.reduce((best, point) => (Number(point.median_price) < Number(best.median_price) ? point : best))
    : null;

  const latestMedianLabel = latestPoint ? formatPriceLkrMillions(latestPoint.median_price) : "N/A";
  const changePct =
    baselinePoint && latestPoint && Number(baselinePoint.median_price) > 0
      ? ((Number(latestPoint.median_price) - Number(baselinePoint.median_price)) / Number(baselinePoint.median_price)) * 100
      : null;
  const changeLabel = formatPercentChange(changePct);
  const hasChangeSignal = changePct !== null;
  const changePositive = hasChangeSignal && changePct >= 0;
  const totalSamples = normalizedPoints.reduce((sum, point) => sum + Number(point.sample_count || 0), 0);
  const averageSamples = normalizedPoints.length ? Math.round(totalSamples / normalizedPoints.length) : 0;
  const periodLabel = baselinePoint && latestPoint
    ? `${formatMonthLabel(baselinePoint.month)} to ${formatMonthLabel(latestPoint.month)}`
    : "Waiting for history";
  const tone = changeTone(changePct);
  const toneStyle = TONE_STYLES[tone];
  const trendTone =
    changePct === null ? "Awaiting signal" : tone === "stable" ? "Prices stable" : changePositive ? "Prices rising" : "Prices easing";
  // Padded domain, never forced to zero: a 7.6–8.0M series fills the plot.
  const yDomain = paddedDomain(chartData.map((d) => d.median_million));

  return (
    <div className="asset-surface w-full rounded-3xl p-4 sm:p-6 md:p-7">
      <div className="grid gap-5 lg:grid-cols-[0.78fr_1.32fr]">
        <aside className="data-card p-5">
          <div className="headline-kicker text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
            Trend desk
          </div>

          <h3 className="headline-display mt-5 text-title1 leading-tight md:text-title1">{title}</h3>
          <p className="mt-3 text-footnote leading-relaxed text-muted-foreground">
            Median advertised price movement for the selected make, model, condition, and district filters.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="data-card p-3">
              <p className="tech-label">Current median</p>
              <p className="mt-2 text-title2 font-bold tracking-normal text-foreground num">{latestMedianLabel}</p>
            </div>
            <div className="data-card p-3">
              <p className="tech-label">Movement</p>
              <div className={`mt-2 inline-flex items-center gap-1.5 rounded-2xl px-2.5 py-1 text-caption font-bold ${
                !hasChangeSignal ? "bg-foreground/[0.03] text-muted-foreground" : toneStyle.chip
              }`}>
                {!hasChangeSignal || tone === "stable" ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                ) : changePositive ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                )}
                {changeLabel}
              </div>
            </div>
            <div className="data-card p-3">
              <p className="tech-label">Avg depth</p>
              <p className="mt-2 text-callout font-bold tracking-normal text-foreground num">{formatSampleCount(averageSamples)}</p>
            </div>
            <div className="data-card p-3">
              <p className="tech-label">Range</p>
              <p className="mt-2 text-footnote font-bold leading-5 text-foreground num">
                {lowPoint && highPoint ? `${formatPriceLkrMillions(lowPoint.median_price)} - ${formatPriceLkrMillions(highPoint.median_price)}` : "N/A"}
              </p>
            </div>
          </div>
        </aside>

        <section className="data-card p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="tech-label">Price history</p>
              <h4 className="headline-display mt-1 text-title3">{periodLabel}</h4>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="status-chip w-fit">
                <Gauge className="h-3.5 w-3.5 text-primary" />
                {trendTone}
              </div>
              {coverageNote ? (
                <p className="max-w-sm text-left text-caption font-semibold leading-5 text-primary/80 sm:text-right">
                  {coverageNote}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-6 h-[340px] w-full sm:h-[390px]">
            {isLoading ? (
              <div className="skeleton-shimmer h-full w-full rounded-xl border border-border" />
            ) : chartData.length === 0 ? (
              <div className="console-empty flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-footnote leading-relaxed text-muted-foreground">
                <p>{emptyMessage}</p>
                {emptyActionLabel && onEmptyAction ? (
                  <button
                    type="button"
                    onClick={onEmptyAction}
                    className="tech-label rounded-2xl border border-primary/25 bg-primary/10 px-3 py-2 text-primary-bright transition-ui duration-short hover:bg-primary/20 active:scale-[0.97]"
                  >
                    {emptyActionLabel}
                  </button>
                ) : null}
              </div>
            ) : (
              <m.div
                key={title}
                initial="hidden"
                animate="show"
                variants={fadeIn}
                role="img"
                aria-label={`${title || "Price trend"}: ${chartData.length} months of median asking prices${chartData.length ? `, latest ${formatMonthLabel(chartData[chartData.length - 1]?.month || "")}` : ""}`}
                className="h-full w-full"
              >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 18, right: 12, left: -18, bottom: 8 }}>
                  <defs>
                    <linearGradient id="priceHistoryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={toneStyle.stroke} stopOpacity={0.24} />
                      <stop offset="58%" stopColor={toneStyle.stroke} stopOpacity={0.08} />
                      <stop offset="100%" stopColor={toneStyle.stroke} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 8" vertical={false} stroke="hsl(var(--foreground) / 0.06)" />
                  <XAxis
                    dataKey="tick"
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                    interval="preserveStartEnd"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12, fontWeight: 600 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12, fontWeight: 600 }}
                    domain={yDomain ?? ["auto", "auto"]}
                    tickCount={5}
                    allowDecimals
                    tickFormatter={(value: number) => formatLkrAxisFromMillions(value)}
                    width={56}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === "Median" ? formatPriceLkrMillions(Number(value) * 1_000_000) : value,
                      name,
                    ]}
                    labelFormatter={(_l, payload) => String(payload?.[0]?.payload?.label ?? "")}
                    labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 800 }}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "16px",
                      boxShadow: "0 18px 45px rgba(0,0,0,0.35)",
                    }}
                    itemStyle={{ color: "hsl(var(--muted-foreground))", fontWeight: 700 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="median_million"
                    name="Median"
                    stroke={toneStyle.stroke}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#priceHistoryGradient)"
                    dot={chartData.length <= 14 ? { r: 2.5, strokeWidth: 2, fill: "hsl(var(--card))", stroke: toneStyle.stroke } : false}
                    activeDot={{ r: 5, strokeWidth: 2, fill: toneStyle.stroke, stroke: "hsl(var(--card))" }}
                    connectNulls
                    // Draw in once (500ms) on first render only; lane changes
                    // crossfade instead. Off under reduced motion / low data.
                    isAnimationActive={animateDraw}
                    animationDuration={500}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
              </m.div>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 tech-label text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span className="flex flex-wrap items-center gap-3">Median advertised listings · axis in millions (Mn) <TrendToneLegend className="normal-case tracking-normal" /></span>
            <span className="num">{formatSampleCount(totalSamples)} tracked across this range</span>
          </div>
        </section>
      </div>
    </div>
  );
}
