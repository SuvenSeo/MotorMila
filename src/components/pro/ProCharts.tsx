import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartTooltipCard,
  chartAxis,
  chartColor,
  chartGrid,
  chartTick,
  chartTooltip,
  useChartCalm,
  useChartDraw,
} from "@/components/ui/chart-theme";
import { formatLkrAxis, formatLkrCompact } from "@/lib/price";
import { movingAverage } from "@/lib/proAnalytics";
import type { PriceIndexPoint } from "@/types/car";
import type { ProDailySupplyPoint } from "@/types/pro";

const monthTick = (period: string) => {
  const [year, month] = String(period).split("-");
  if (!month) return period;
  const label = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(month) - 1];
  return label ? `${label} ${year?.slice(2)}` : period;
};

/**
 * The mix-adjusted price index, base period = 100. An index is the only chart
 * on the desk whose *level* is meaningless on its own: the annotation carries
 * the base period and the tooltip carries the median and the sample size, so a
 * reader never mistakes it for a price.
 */
export function IndexChart({
  points,
  basePeriod,
  heightClass = "h-64 sm:h-80",
  showBrush = true,
  label = "Mix-adjusted price index over time",
}: {
  points: PriceIndexPoint[];
  basePeriod?: string | null;
  heightClass?: string;
  showBrush?: boolean;
  label?: string;
}) {
  const calm = useChartCalm();
  const draw = useChartDraw(points.length > 0);
  const data = useMemo(
    () => points.map((point) => ({ ...point, label: monthTick(point.period) })),
    [points],
  );
  return (
    <div className={heightClass} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: showBrush ? 4 : 0 }}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="label" {...chartAxis} minTickGap={24} />
          <YAxis
            {...chartAxis}
            width={40}
            domain={["dataMin - 1", "dataMax + 1"]}
            tickFormatter={(value: number) => value.toFixed(0)}
          />
          <ReferenceLine y={100} stroke={chartColor.muted} strokeDasharray="2 4" ifOverflow="extendDomain" />
          <Tooltip
            {...chartTooltip(calm)}
            content={
              <ChartTooltipCard
                title={(label, payload) => {
                  const period = (payload?.[0]?.payload as { period?: string } | undefined)?.period;
                  return period ? monthTick(period) : String(label ?? "");
                }}
                rows={(payload) => {
                  const point = payload?.[0]?.payload as PriceIndexPoint | undefined;
                  if (!point) return [];
                  const rows: Array<{ label: string; value: string; color?: string }> = [
                    { label: "Index", value: point.index_value.toFixed(1), color: chartColor.primary },
                  ];
                  if (point.median_price_lkr != null) rows.push({ label: "Median", value: formatLkrCompact(point.median_price_lkr), color: chartColor.muted });
                  if (point.mom_change_pct != null) rows.push({ label: "Month on month", value: `${point.mom_change_pct > 0 ? "+" : ""}${point.mom_change_pct.toFixed(1)}%` });
                  if (point.sample_size != null) rows.push({ label: "Listings", value: point.sample_size.toLocaleString("en-US") });
                  return rows;
                }}
              />
            }
          />
          <Area
            {...draw}
            type="monotone"
            dataKey="index_value"
            name="Index"
            stroke={chartColor.primary}
            strokeWidth={2}
            fill="hsl(var(--primary) / 0.12)"
            activeDot={{ r: 3, strokeWidth: 0, fill: chartColor.primary }}
            dot={false}
          />
          {showBrush ? (
            <Brush
              dataKey="label"
              height={22}
              travellerWidth={8}
              stroke={chartColor.grid}
              fill="transparent"
              tickFormatter={() => ""}
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
      {basePeriod ? (
        <p className="mt-1 pl-10 text-caption text-label-3">Base {monthTick(basePeriod)} = 100 · mix-adjusted, so the level ignores changes in what was for sale</p>
      ) : null}
    </div>
  );
}

/** Daily new listings with a seven-day average, so one busy scrape does not read as a market shift. */
export function SupplyChart({
  points,
  heightClass = "h-36",
  label = "Daily new listings with a seven-day average",
}: {
  points: ProDailySupplyPoint[];
  heightClass?: string;
  label?: string;
}) {
  const calm = useChartCalm();
  const draw = useChartDraw(points.length > 0);
  const data = useMemo(() => {
    const counts = points.map((point) => point.count);
    const average = movingAverage(counts, 7);
    const offset = Math.max(0, counts.length - average.length);
    return points.map((point, i) => ({
      ...point,
      label: point.date.slice(5),
      average: i >= offset ? average[i - offset] : null,
    }));
  }, [points]);
  return (
    <div className={heightClass} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="label" {...chartAxis} minTickGap={18} />
          <YAxis {...chartAxis} width={28} allowDecimals={false} />
          <Tooltip
            {...chartTooltip(calm)}
            content={<ChartTooltipCard rows={(payload) => {
              const point = payload?.[0]?.payload as { date?: string; count?: number; average?: number | null } | undefined;
              if (!point) return [];
              const rows: Array<{ label: string; value: string; color?: string }> = [
                { label: "New listings", value: String(point.count ?? 0), color: chartColor.primary },
              ];
              if (point.average != null) rows.push({ label: "7-day average", value: point.average.toFixed(1), color: chartColor.up });
              return rows;
            }} />}
          />
          <Bar {...draw} dataKey="count" name="New listings" fill="hsl(var(--primary) / 0.35)" radius={[2, 2, 0, 0]} />
          <Line {...draw} type="monotone" dataKey="average" name="7-day average" stroke={chartColor.up} strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export type RelativePoint = { label: string; lane: number | null; market: number | null };

/**
 * A lane against the market, both rebased to 100 at the first shared month.
 * This is the relative-performance view: the question is never "did this get
 * dearer", it is "did it move more than everything else".
 */
export function RelativeChart({
  points,
  laneName,
  heightClass = "h-64",
  label,
}: {
  points: RelativePoint[];
  laneName: string;
  heightClass?: string;
  label?: string;
}) {
  const calm = useChartCalm();
  const draw = useChartDraw(points.length > 0);
  return (
    <div className={heightClass} role="img" aria-label={label ?? `${laneName} against the market, both rebased to 100`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="label" {...chartAxis} minTickGap={18} tickFormatter={monthTick} />
          <YAxis {...chartAxis} width={40} domain={["dataMin - 1", "dataMax + 1"]} tickFormatter={(value: number) => value.toFixed(0)} />
          <ReferenceLine y={100} stroke={chartColor.muted} strokeDasharray="2 4" ifOverflow="extendDomain" />
          <Tooltip
            {...chartTooltip(calm)}
            content={<ChartTooltipCard rows={(payload) => (payload ?? []).map((point) => ({
              label: String(point.name ?? ""),
              value: typeof point.value === "number" ? point.value.toFixed(1) : "—",
              color: point.color,
            }))} />}
          />
          <Area {...draw} type="monotone" dataKey="market" name="All market" stroke={chartColor.muted} strokeWidth={2} fill="hsl(var(--label-2) / 0.10)" dot={false} />
          <Area {...draw} type="monotone" dataKey="lane" name={laneName} stroke={chartColor.primary} strokeWidth={2} fill="hsl(var(--primary) / 0.12)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Two-series monthly comparison with an optional diverging bar for volume. */
export function MonthlyMedianChart({
  points,
  heightClass = "h-64",
  series,
  label = "Monthly median asking price",
}: {
  points: Array<{ label: string; median: number | null; average: number | null }>;
  heightClass?: string;
  series?: "both" | "median";
  label?: string;
}) {
  const calm = useChartCalm();
  const draw = useChartDraw(points.length > 0);
  return (
    <div className={heightClass} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="label" {...chartAxis} minTickGap={18} tickFormatter={monthTick} />
          <YAxis {...chartAxis} width={52} tickFormatter={(value: number) => formatLkrAxis(value)} />
          <Tooltip
            {...chartTooltip(calm)}
            content={<ChartTooltipCard rows={(payload) => (payload ?? []).map((point) => ({
              label: String(point.name ?? ""),
              value: typeof point.value === "number" ? formatLkrCompact(point.value) : "—",
              color: point.color,
            }))} />}
          />
          <Area {...draw} type="monotone" dataKey="median" name="Median" stroke={chartColor.primary} strokeWidth={2} fill="hsl(var(--primary) / 0.12)" dot={false} />
          {series === "median" ? null : (
            <Area {...draw} type="monotone" dataKey="average" name="Average" stroke={chartColor.muted} strokeWidth={1.5} strokeDasharray="4 3" fill="transparent" dot={false} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** The score-band histogram: how many listings sit in each deal-score band. */
export function ScoreBandChart({
  bands,
  heightClass = "h-32",
  label = "Listings per deal-score band",
}: {
  bands: Array<{ label: string; count: number }>;
  heightClass?: string;
  label?: string;
}) {
  const calm = useChartCalm();
  const draw = useChartDraw(bands.length > 0);
  return (
    <div className={heightClass} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bands} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="label" {...chartAxis} interval={0} tick={{ ...chartTick, fontSize: 11 }} />
          <YAxis {...chartAxis} width={28} allowDecimals={false} />
          <Tooltip {...chartTooltip(calm)} content={<ChartTooltipCard />} cursor={{ fill: "hsl(var(--muted) / 0.35)" }} />
          <Bar {...draw} dataKey="count" name="Listings" fill="hsl(var(--primary) / 0.6)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
