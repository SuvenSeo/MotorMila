import { useMemo, useRef } from "react";
import { useInView } from "motion/react";
import { useReducedMotionOrLowData } from "@/lib/motion";
import { useChartDraw } from "@/components/ui/chart-theme";
import { useAppPreferences } from "@/lib/appPreferences";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, LineChart, TrendingDown } from "lucide-react";
import { formatPrice } from "@/services/api";
import { formatPriceLkrMillions } from "@/lib/formatting";
import type { PriceHistoryInfo } from "@/types/car";
import { formatLkrAxisFromMillions } from "@/lib/price";

interface ListingPriceTimelineProps {
  history: PriceHistoryInfo | null;
  marketMedianLkr?: number | null;
  listingTitle?: string;
  isLoading?: boolean;
}

function formatAxisDate(iso: string, localeTag: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString(localeTag, { day: "numeric", month: "short" });
}

function formatFullDate(iso: string, localeTag: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString(localeTag, { day: "numeric", month: "short", year: "numeric" });
}

const NICE_MN_STEPS = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100];

/**
 * Y axis in LKR millions with round, evenly spaced ticks (at most 5 gaps) and the
 * domain snapped to them, so the top label is never an odd "7.2 Mn" that runs
 * past the plot edge.
 */
export function niceMillionsAxis(values: number[], marketMedianLkr?: number | null): { domain: [number, number]; ticks: number[] } {
  const all = [...values];
  if (marketMedianLkr && marketMedianLkr > 0) all.push(marketMedianLkr / 1_000_000);
  if (!all.length) return { domain: [0, 1], ticks: [0, 0.5, 1] };
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = Math.max((max - min) * 0.08, max * 0.03);
  const lo0 = Math.max(0, min - pad);
  const hi0 = max + pad;
  const snap = (step: number): [number, number] => {
    const lo = Math.floor(lo0 / step + 1e-9) * step;
    return [lo, Math.max(Math.ceil(hi0 / step - 1e-9) * step, lo + step)];
  };
  const step = NICE_MN_STEPS.find((st) => {
    const [lo, hi] = snap(st);
    return (hi - lo) / st <= 5;
  }) ?? NICE_MN_STEPS[NICE_MN_STEPS.length - 1];
  const [lo, hi] = snap(step);
  const ticks: number[] = [];
  for (let i = 0; lo + i * step <= hi + step / 2; i++) ticks.push(Number((lo + i * step).toFixed(4)));
  return { domain: [lo, hi], ticks };
}

function formatChangePct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function ListingPriceTimeline({
  history,
  marketMedianLkr,
  listingTitle,
  isLoading = false,
}: ListingPriceTimelineProps) {
  const { t, localeTag } = useAppPreferences();
  const points = useMemo(() => history?.points ?? [], [history?.points]);
  const hasChart = points.length >= 2;
  // The line draws in once, the first time the chart scrolls into view, via the
  // shared useChartDraw flag: it drops after the first onAnimationEnd, so a
  // resize or re-render never re-draws it. Off in reduced motion / low data.
  const chartRef = useRef<HTMLDivElement>(null);
  const seen = useInView(chartRef, { once: true, amount: 0.35 });
  const calm = useReducedMotionOrLowData();
  const lineVisible = calm || seen || typeof IntersectionObserver === "undefined";
  const draw = useChartDraw(lineVisible);

  const chartData = useMemo(() => {
    return points.map((point, index) => ({
      index,
      label: formatAxisDate(point.scraped_at, localeTag),
      scraped_at: point.scraped_at,
      price_lkr: point.price_lkr,
      price_million: point.price_lkr / 1_000_000,
    }));
  }, [points, localeTag]);

  const yAxis = useMemo(() => niceMillionsAxis(points.map((p) => p.price_lkr / 1_000_000), marketMedianLkr), [points, marketMedianLkr]);
  // Fixed 52px clipped the lead digit of quarter-million ticks ("2.25 Mn" read
  // ".25 Mn"); size the axis to its longest label (12px semibold ≈ 7.2px/char).
  const yAxisWidth = useMemo(() => {
    const longest = Math.max(0, ...yAxis.ticks.map((v) => formatLkrAxisFromMillions(v).length));
    return Math.max(44, Math.ceil(longest * 7.2) + 8);
  }, [yAxis.ticks]);

  const changePct = history?.change_pct ?? null;
  const isDrop = changePct !== null && changePct < 0;
  const isRise = changePct !== null && changePct > 0;
  const cutCount = history?.cut_count ?? 0;
  const raiseCount = history?.raise_count ?? 0;
  const lastChangeAt = history?.last_change_at ?? null;

  if (isLoading) {
    return <div className="h-56 rounded-2xl border border-border bg-card skeleton-shimmer" />;
  }

  if (!history || points.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <LineChart className="h-4 w-4 text-primary-bright" />
          </div>
          <div>
            <h2 className="text-footnote font-bold text-foreground">{t("priceTimeline.title", "Price timeline")}</h2>
            <p className="text-caption font-semibold text-muted-foreground">
              {t("priceTimeline.subtitle", "Scan-over-scan tracking")}{listingTitle ? ` · ${listingTitle}` : ""}
            </p>
          </div>
        </div>
        {cutCount > 0 && (
          <Link
            to="/best-picks"
            className="inline-flex items-center gap-1 rounded-full border border-deal-good/25 bg-deal-good/10 px-2.5 py-1 text-caption font-semibold text-deal-good-text no-underline transition-colors hover:bg-deal-good/15 dark:text-deal-good-text"
          >
            <TrendingDown className="h-3 w-3" />
            {cutCount === 1 ? t("priceTimeline.cutsOne", "1 cut recorded") : t("priceTimeline.cuts", "{n} cuts recorded", { n: cutCount })}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-border pb-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="text-caption font-medium text-muted-foreground">{t("priceTimeline.opening", "Opening ask")}</p>
          <p className="mt-1 text-footnote font-bold text-foreground num">
            {history.first_price_lkr ? formatPrice(history.first_price_lkr) : "—"}
          </p>
          {points[0]?.scraped_at ? (
            <p className="mt-0.5 text-caption text-muted-foreground">{formatFullDate(points[0].scraped_at, localeTag)}</p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="text-caption font-medium text-muted-foreground">{t("priceTimeline.current", "Current ask")}</p>
          <p className="mt-1 text-footnote font-bold text-foreground num">
            {history.current_price_lkr ? formatPrice(history.current_price_lkr) : "—"}
          </p>
          {lastChangeAt ? (
            <p className="mt-0.5 text-caption text-muted-foreground">{t("priceTimeline.updated", "Updated {date}", { date: formatFullDate(lastChangeAt, localeTag) })}</p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="text-caption font-medium text-muted-foreground">{t("priceTimeline.totalMove", "Total move")}</p>
          <div
            className={`mt-1 inline-flex items-center gap-1 text-footnote font-bold num ${
              isDrop
                ? "text-deal-good-text"
                : isRise
                  ? "text-deal-high-text"
                  : "text-foreground"
            }`}
          >
            {isDrop ? <ArrowDownRight className="h-3.5 w-3.5" /> : isRise ? <ArrowUpRight className="h-3.5 w-3.5" /> : null}
            {formatChangePct(changePct)}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="text-caption font-medium text-muted-foreground">{t("priceTimeline.moves", "Price moves")}</p>
          <p className="mt-1 text-footnote font-bold text-foreground num">
            {cutCount > 0 || raiseCount > 0 ? (
              <>
                {cutCount > 0 ? `${cutCount}↓` : null}
                {cutCount > 0 && raiseCount > 0 ? " · " : null}
                {raiseCount > 0 ? `${raiseCount}↑` : null}
              </>
            ) : (
              t("priceTimeline.stable", "Stable")
            )}
          </p>
          <p className="mt-0.5 text-caption text-muted-foreground">{points.length === 1 ? t("priceTimeline.pointsOne", "1 tracked point") : t("priceTimeline.points", "{n} tracked points", { n: points.length })}</p>
        </div>
      </div>

      <div className="mt-4 h-[220px] w-full sm:h-[260px]">
        {hasChart ? (
          <div
            ref={chartRef}
            role="img"
            aria-label={t("priceTimeline.aria", "Price timeline with {n} recorded asking prices", { n: points.length })}
            className="h-full w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="listingPriceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 8" vertical={false} stroke="hsl(var(--foreground) / 0.06)" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12, fontWeight: 600 }}
                  dy={8}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  domain={yAxis.domain}
                  ticks={yAxis.ticks}
                  interval={0}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12, fontWeight: 600 }}
                  tickFormatter={(value: number) => formatLkrAxisFromMillions(value)}
                  width={yAxisWidth}
                />
                <Tooltip
                  formatter={(value: number) => [formatPriceLkrMillions(Number(value) * 1_000_000), t("priceTimeline.askingPrice", "Asking price")]}
                  labelFormatter={(_, payload) => {
                    const row = Array.isArray(payload) ? payload[0]?.payload : null;
                    return row?.scraped_at ? formatFullDate(String(row.scraped_at), localeTag) : "";
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 800 }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                  }}
                />
                {marketMedianLkr && marketMedianLkr > 0 ? (
                  <ReferenceLine
                    y={marketMedianLkr / 1_000_000}
                    stroke="hsl(var(--primary))"
                    strokeDasharray="6 6"
                    strokeOpacity={0.55}
                    label={{
                      value: t("priceTimeline.marketMedian", "Market median"),
                      position: "insideTopRight",
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  />
                ) : null}
                <Area
                  key={lineVisible ? "drawn" : "waiting"}
                  hide={!lineVisible}
                  {...draw}
                  type="stepAfter"
                  dataKey="price_million"
                  name={t("priceTimeline.askingPrice", "Asking price")}
                  stroke="var(--gold)"
                  strokeWidth={2.5}
                  fill="url(#listingPriceGradient)"
                  dot={{ r: 3.5, strokeWidth: 2, fill: "hsl(var(--card))", stroke: "var(--gold)" }}
                  activeDot={{ r: 5, strokeWidth: 2, fill: "var(--gold)" }}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 text-center">
            <p className="text-caption font-semibold text-foreground">{t("priceTimeline.started", "Tracking started")}</p>
            <p className="mt-1 max-w-sm text-caption leading-relaxed text-muted-foreground">
              {t("priceTimeline.startedBody", "We recorded the opening ask at {price}. The chart fills in when the seller changes their price on a future scan.", { price: formatPrice(points[0].price_lkr) })}
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 text-caption leading-relaxed text-muted-foreground">
        {t("priceTimeline.footnote", "Prices update when our scans detect a change at the source — unchanged asks do not add duplicate points.")}
      </p>
    </section>
  );
}
