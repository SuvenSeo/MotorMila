import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LineChart } from "lucide-react";
import { formatPrice, getModelPriceHistory } from "@/services/api";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { SectionHeader } from "@/components/SectionHeader";

type Mode = "calendar" | "yom";

function formatPeriod(period: string): string {
  const [y, m] = period.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : period;
}

function mergeCalendarSeries(
  live: { period: string; median_price_lkr: number | null; listing_count: number }[],
  archive: { period: string; median_price_lkr: number | null; listing_count: number }[],
) {
  const map = new Map<
    string,
    { label: string; period: string; live: number | null; archive: number | null; samples: number }
  >();

  for (const row of archive) {
    map.set(row.period, {
      period: row.period,
      label: formatPeriod(row.period),
      live: null,
      archive: row.median_price_lkr,
      samples: row.listing_count,
    });
  }
  for (const row of live) {
    const existing = map.get(row.period);
    if (existing) {
      existing.live = row.median_price_lkr;
      existing.samples += row.listing_count;
    } else {
      map.set(row.period, {
        period: row.period,
        label: formatPeriod(row.period),
        live: row.median_price_lkr,
        archive: null,
        samples: row.listing_count,
      });
    }
  }

  return [...map.values()].sort((a, b) => a.period.localeCompare(b.period));
}

export function ModelPriceTimeMachine({
  make,
  model,
}: {
  make: string;
  model: string;
}) {
  const [mode, setMode] = useState<Mode>("calendar");

  const historyQuery = useQuery({
    queryKey: ["model-price-history", make, model],
    queryFn: () => getModelPriceHistory(make, model, { from_year: 2010, to_year: 2026 }),
    enabled: Boolean(make && model),
    staleTime: QUERY_STALE.hub,
  });

  const data = historyQuery.data;
  const calendarChart = useMemo(() => {
    if (!data) return [];
    return mergeCalendarSeries(
      data.calendar_series.live_aggregates,
      data.calendar_series.archive_observations,
    );
  }, [data]);

  const yomChart = useMemo(() => {
    if (!data) return [];
    return data.cross_section_by_yom.map((row) => ({
      label: String(row.yom),
      yom: row.yom,
      median: row.median_price_lkr,
      samples: row.listing_count,
    }));
  }, [data]);

  const hasCalendar = calendarChart.some((row) => row.live != null || row.archive != null);
  const hasYom = yomChart.some((row) => row.median != null);
  const empty = !historyQuery.isPending && !hasCalendar && !hasYom;

  return (
    <section className="space-y-5">
      <SectionHeader
        eyebrow="Price Time Machine"
        title={`${make} ${model} over time`}
        description={
          mode === "calendar"
            ? data?.interpretation.calendar_series ||
              "Median asking prices across calendar months from Motormila scans and archive backfills."
            : data?.interpretation.cross_section_by_yom ||
              "Today’s live listings grouped by year of manufacture — not calendar history."
        }
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("calendar")}
          className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition ${
            mode === "calendar"
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          Calendar history
        </button>
        <button
          type="button"
          onClick={() => setMode("yom")}
          className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition ${
            mode === "yom"
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          By manufacture year
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
        {historyQuery.isPending ? (
          <div className="h-[320px] animate-pulse rounded-xl bg-muted/30" />
        ) : empty || historyQuery.isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <LineChart className="h-5 w-5 text-muted-foreground" />
            <p className="max-w-md text-[13px] font-medium text-muted-foreground">
              Historical points for this model are still thin. As Wayback backfill and daily
              scans land, this chart fills in automatically.
            </p>
          </div>
        ) : mode === "calendar" ? (
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={calendarChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="tmLive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="tmArchive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(1)}M`}
                  width={52}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatPrice(value),
                    name === "live" ? "Motormila scans" : "Archive backfill",
                  ]}
                  labelFormatter={(label) => String(label)}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="archive"
                  name="archive"
                  stroke="#38bdf8"
                  fill="url(#tmArchive)"
                  strokeWidth={2}
                  connectNulls
                />
                <Area
                  type="monotone"
                  dataKey="live"
                  name="live"
                  stroke="hsl(var(--primary))"
                  fill="url(#tmLive)"
                  strokeWidth={2}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={yomChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="tmYom" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={20} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(1)}M`}
                  width={52}
                />
                <Tooltip
                  formatter={(value: number) => [formatPrice(value), "Median ask today"]}
                  labelFormatter={(label) => `YOM ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="median"
                  stroke="hsl(var(--primary))"
                  fill="url(#tmYom)"
                  strokeWidth={2}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {data && (
          <p className="mt-4 text-[11px] font-medium text-muted-foreground">
            Archive months: {data.counts.archive_points} · Motormila aggregate months:{" "}
            {data.counts.aggregate_points} · YOM buckets: {data.counts.yom_buckets}
          </p>
        )}
      </div>
    </section>
  );
}
