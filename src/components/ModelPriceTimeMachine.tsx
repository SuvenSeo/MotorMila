import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPrice, getModelPriceHistory } from "@/services/api";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { useAppPreferences } from "@/lib/appPreferences";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  ChartFrame,
  ChartLegend,
  ChartTooltipCard,
  chartAxis,
  chartColor,
  chartGrid,
  chartTooltip,
  useChartCalm,
  useChartDraw,
} from "@/components/ui/chart-theme";
import { formatLkrAxis } from "@/lib/price";

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
  const { t, language } = useAppPreferences();
  const calm = useChartCalm();
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

  // An area needs two points to draw a line: one month of data rendered an
  // empty plot with stacked axis labels. Treat <2 points as "thin", not a chart.
  const calendarPoints = calendarChart.filter((row) => row.live != null || row.archive != null).length;
  const yomPoints = yomChart.filter((row) => row.median != null).length;
  const hasCalendar = calendarPoints >= 2;
  const hasYom = yomPoints >= 2;
  const hasArchive = calendarChart.some((row) => row.archive != null);

  // Open on whichever view can actually draw.
  const [autoPicked, setAutoPicked] = useState(false);
  useEffect(() => {
    if (autoPicked || historyQuery.isPending) return;
    setAutoPicked(true);
    if (!hasCalendar && hasYom) setMode("yom");
  }, [autoPicked, historyQuery.isPending, hasCalendar, hasYom]);
  const viewEmpty = mode === "calendar" ? !hasCalendar : !hasYom;
  const state = historyQuery.isPending ? "loading" : historyQuery.isError ? "error" : viewEmpty ? "empty" : "ready";
  const draw = useChartDraw(state === "ready");

  const liveLabel = t("timeMachine.live", "Motormila scans");
  const archiveLabel = t("timeMachine.archive", "Archive backfill");

  return (
    <section className="space-y-5">
      <SectionHeading
        eyebrow={t("timeMachine.eyebrow", "Price Time Machine")}
        title={t("timeMachine.title", "{make} {model} over time", { ...names })}
        description={
          mode === "calendar"
            ? // The API's interpretation text is English-only; use it only in English.
              (language === "en" ? data?.interpretation.calendar_series : undefined) ||
              t("timeMachine.calendarDesc", "Median asking prices across calendar months from Motormila scans and archive backfills.")
            : (language === "en" ? data?.interpretation.cross_section_by_yom : undefined) ||
              t("timeMachine.yomDesc", "Today’s live listings grouped by year of manufacture — not calendar history.")
        }
      />

      <Card padding="md">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          {/* Tamil/Sinhala tab labels are long: let the pills shrink and wrap on phones instead of overflowing. */}
          <TabsList aria-label={t("timeMachine.viewAria", "Chart view")} className="h-auto max-w-full">
            <TabsTrigger value="calendar" className="h-auto min-h-8 whitespace-normal py-1 text-center leading-tight">{t("timeMachine.calendarTab", "Calendar history")}</TabsTrigger>
            <TabsTrigger value="yom" className="h-auto min-h-8 whitespace-normal py-1 text-center leading-tight">{t("timeMachine.yomTab", "By manufacture year")}</TabsTrigger>
          </TabsList>
        </Tabs>

        <ChartFrame
          key={mode}
          state={state}
          className="mt-5"
          heightClass="h-72 sm:h-[21rem]"
          emptyTitle={t("timeMachine.emptyTitle", "History is still thin")}
          emptyBody={t(
            "timeMachine.empty",
            "Historical points for this model are still thin. As archive backfill and daily scans land, this chart fills in automatically.",
          )}
          errorTitle={t("timeMachine.errorTitle", "Price history didn't load")}
          onRetry={() => void historyQuery.refetch()}
          label={
            mode === "calendar"
              ? t("timeMachine.calendarAria", "{make} {model} median asking price by month, {n} months", { ...names, n: calendarPoints })
              : t("timeMachine.yomAria", "{make} {model} median asking price by manufacture year, {n} years", { ...names, n: yomPoints })
          }
        >
          {mode === "calendar" ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={calendarChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="tmLive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor.primary} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={chartColor.primary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="tmArchive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor.muted} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={chartColor.muted} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...chartGrid} />
                <XAxis {...chartAxis} dataKey="label" minTickGap={28} interval="preserveStartEnd" />
                <YAxis {...chartAxis} tickFormatter={(v: number) => formatLkrAxis(v)} width={64} />
                <Tooltip
                  {...chartTooltip(calm)}
                  content={(p) => (
                    <ChartTooltipCard
                      {...p}
                      rows={(payload) =>
                        payload
                          .filter((row) => row.value != null)
                          .map((row) => ({
                            label: row.dataKey === "live" ? liveLabel : archiveLabel,
                            value: formatPrice(Number(row.value)),
                            color: row.dataKey === "live" ? chartColor.primary : chartColor.muted,
                          }))
                      }
                    />
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="archive"
                  name="archive"
                  stroke={chartColor.muted}
                  strokeDasharray="4 3"
                  fill="url(#tmArchive)"
                  strokeWidth={2}
                  connectNulls
                  {...draw}
                />
                <Area
                  type="monotone"
                  dataKey="live"
                  name="live"
                  stroke={chartColor.primary}
                  fill="url(#tmLive)"
                  strokeWidth={2.5}
                  connectNulls
                  {...draw}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={yomChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="tmYom" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor.primary} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={chartColor.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...chartGrid} />
                <XAxis {...chartAxis} dataKey="label" minTickGap={20} interval="preserveStartEnd" />
                <YAxis {...chartAxis} tickFormatter={(v: number) => formatLkrAxis(v)} width={64} />
                <Tooltip
                  {...chartTooltip(calm)}
                  content={(p) => (
                    <ChartTooltipCard
                      {...p}
                      title={(label) => t("timeMachine.yomLabel", "YOM {year}", { year: String(label ?? "") })}
                      rows={(payload) => [
                        {
                          label: t("timeMachine.medianToday", "Median ask today"),
                          value: formatPrice(Number(payload?.[0]?.value)),
                          color: chartColor.primary,
                        },
                      ]}
                    />
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="median"
                  stroke={chartColor.primary}
                  fill="url(#tmYom)"
                  strokeWidth={2.5}
                  connectNulls
                  {...draw}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>

        <div className="mt-4 flex flex-col gap-2 border-t border-separator pt-4 sm:flex-row sm:items-center sm:justify-between">
          {mode === "calendar" && state === "ready" ? (
            <ChartLegend
              items={[
                { label: liveLabel, color: chartColor.primary },
                ...(hasArchive ? [{ label: archiveLabel, color: chartColor.muted }] : []),
              ]}
            />
          ) : (
            <span />
          )}
          {data ? (
            <p className="text-caption tabular-nums text-label-2">
              {t("timeMachine.counts", "Archive months: {a} · Motormila aggregate months: {b} · YOM buckets: {c}", {
                a: data.counts.archive_points,
                b: data.counts.aggregate_points,
                c: data.counts.yom_buckets,
              })}
            </p>
          ) : null}
        </div>
      </Card>
    </section>
  );
}
