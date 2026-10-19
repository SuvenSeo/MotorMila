import { useMemo } from "react";
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

interface ListingPriceTimelineProps {
  history: PriceHistoryInfo | null;
  marketMedianLkr?: number | null;
  listingTitle?: string;
  isLoading?: boolean;
}

function formatAxisDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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
  const points = useMemo(() => history?.points ?? [], [history?.points]);
  const hasChart = points.length >= 2;

  const chartData = useMemo(() => {
    return points.map((point, index) => ({
      index,
      label: formatAxisDate(point.scraped_at),
      scraped_at: point.scraped_at,
      price_lkr: point.price_lkr,
      price_million: point.price_lkr / 1_000_000,
    }));
  }, [points]);

  const yDomain = useMemo(() => {
    // Use millions to match the price_million dataKey used by the Area chart.
    const values = points.map((p) => p.price_lkr / 1_000_000);
    if (marketMedianLkr && marketMedianLkr > 0) values.push(marketMedianLkr / 1_000_000);
    if (!values.length) return [0, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.12, max * 0.03);
    return [Math.max(0, min - pad), max + pad];
  }, [points, marketMedianLkr]);

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
            <h2 className="text-[13px] font-bold text-foreground">Price timeline</h2>
            <p className="text-[10px] font-semibold text-muted-foreground">
              Scan-over-scan tracking{listingTitle ? ` · ${listingTitle}` : ""}
            </p>
          </div>
        </div>
        {cutCount > 0 && (
          <Link
            to="/best-picks"
            className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[12px] font-semibold text-emerald-700 no-underline transition-colors hover:bg-emerald-500/15 dark:text-emerald-300"
          >
            <TrendingDown className="h-3 w-3" />
            {cutCount} cut{cutCount === 1 ? "" : "s"} recorded
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-border pb-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="text-[11px] font-medium text-muted-foreground">Opening ask</p>
          <p className="mt-1 text-[13px] font-bold text-foreground num">
            {history.first_price_lkr ? formatPrice(history.first_price_lkr) : "—"}
          </p>
          {points[0]?.scraped_at ? (
            <p className="mt-0.5 text-[10px] text-muted-foreground">{formatFullDate(points[0].scraped_at)}</p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="text-[11px] font-medium text-muted-foreground">Current ask</p>
          <p className="mt-1 text-[13px] font-bold text-foreground num">
            {history.current_price_lkr ? formatPrice(history.current_price_lkr) : "—"}
          </p>
          {lastChangeAt ? (
            <p className="mt-0.5 text-[10px] text-muted-foreground">Updated {formatFullDate(lastChangeAt)}</p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="text-[11px] font-medium text-muted-foreground">Total move</p>
          <div
            className={`mt-1 inline-flex items-center gap-1 text-[13px] font-bold num ${
              isDrop
                ? "text-emerald-600 dark:text-emerald-400"
                : isRise
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-foreground"
            }`}
          >
            {isDrop ? <ArrowDownRight className="h-3.5 w-3.5" /> : isRise ? <ArrowUpRight className="h-3.5 w-3.5" /> : null}
            {formatChangePct(changePct)}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="text-[11px] font-medium text-muted-foreground">Price moves</p>
          <p className="mt-1 text-[13px] font-bold text-foreground num">
            {cutCount > 0 || raiseCount > 0 ? (
              <>
                {cutCount > 0 ? `${cutCount}↓` : null}
                {cutCount > 0 && raiseCount > 0 ? " · " : null}
                {raiseCount > 0 ? `${raiseCount}↑` : null}
              </>
            ) : (
              "Stable"
            )}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{points.length} tracked point{points.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      <div className="mt-4 h-[220px] w-full sm:h-[260px]">
        {hasChart ? (
          <div
            role="img"
            aria-label={`Price timeline with ${points.length} recorded asking prices`}
            className="h-full w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 12, right: 8, left: -12, bottom: 4 }}>
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
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontWeight: 600 }}
                  dy={8}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  domain={yDomain}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontWeight: 600 }}
                  tickFormatter={(value: number) => `${value.toFixed(1)}M`}
                  width={52}
                />
                <Tooltip
                  formatter={(value: number) => [formatPriceLkrMillions(Number(value) * 1_000_000), "Asking price"]}
                  labelFormatter={(_, payload) => {
                    const row = Array.isArray(payload) ? payload[0]?.payload : null;
                    return row?.scraped_at ? formatFullDate(String(row.scraped_at)) : "";
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
                      value: "Market median",
                      position: "insideTopRight",
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  />
                ) : null}
                <Area
                  type="stepAfter"
                  dataKey="price_million"
                  name="Asking price"
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
            <p className="text-[12px] font-semibold text-foreground">Tracking started</p>
            <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-muted-foreground">
              We recorded the opening ask at {formatPrice(points[0].price_lkr)}. The chart fills in when the seller changes their price on a future scan.
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        Prices update when our scans detect a change at the source — unchanged asks do not add duplicate points.
      </p>
    </section>
  );
}
