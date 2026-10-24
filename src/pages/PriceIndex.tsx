import { useCallback, useEffect, useMemo, useState } from "react";
import { m } from "motion/react";
import { AreaChart, Area, Bar, BarChart, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { ArrowDownRight, ArrowUpRight, Info, LineChart, Minus } from "lucide-react";
import { getPriceIndex } from "@/services/api";
import type { PriceIndex, PriceIndexPoint } from "@/types/car";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import { revealItem } from "@/lib/motion";
import { FreePlanBanner } from "@/components/FreePlanBanner";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatTile, FlowValue } from "@/components/ui/stat-tile";
import {
  ChartFrame,
  ChartTooltipCard,
  chartAxis,
  chartColor,
  chartGrid,
  chartTooltip,
  toneColor,
  toneFor,
  useChartCalm,
  useChartDraw,
} from "@/components/ui/chart-theme";
import {
  FREE_TRENDS_MONTHS,
  freePlanCopy,
  hasFullPlatformAccess,
  takeLastMonths,
} from "@/lib/planLimits";
import { cn } from "@/lib/utils";

function formatPeriod(period: string): string {
  const [y, mo] = period.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : period;
}

function formatTick(period: string): string {
  const [y, mo] = period.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) : period;
}

function formatPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

const PCT_FORMAT = { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" } as const;

export default function PriceIndexPage() {
  const { t } = useAppPreferences();
  const calm = useChartCalm();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  const [data, setData] = useState<PriceIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [activeSegment, setActiveSegment] = useState<string>("overall");
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    document.title = "SL Used Vehicle Price Index — Motormila";
    setLoading(true);
    setError(false);
    getPriceIndex()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    if (!fullAccess && activeSegment !== "overall") {
      setActiveSegment("overall");
    }
  }, [fullAccess, activeSegment]);

  const segmentKeys = useMemo(() => ["overall", ...Object.keys(data?.segments || {})], [data]);
  const activePoints: PriceIndexPoint[] = useMemo(() => {
    if (!data) return [];
    const raw = activeSegment === "overall" ? data.points : data.segments[activeSegment] || [];
    return fullAccess ? raw : takeLastMonths(raw, FREE_TRENDS_MONTHS);
  }, [data, activeSegment, fullAccess]);

  const chartData = useMemo(
    () => activePoints.map((p) => ({ ...p, label: formatPeriod(p.period), tick: formatTick(p.period) })),
    [activePoints],
  );
  const momChartData = useMemo(
    () =>
      activePoints
        .filter((p) => p.mom_change_pct != null && Number.isFinite(p.mom_change_pct))
        .map((p) => ({ label: formatPeriod(p.period), tick: formatTick(p.period), mom: Number(p.mom_change_pct) })),
    [activePoints],
  );
  const latest = activePoints[activePoints.length - 1];
  const first = activePoints[0];
  const totalChange = latest && first && first.index_value > 0
    ? ((latest.index_value - first.index_value) / first.index_value) * 100
    : null;
  const tone = toneFor(totalChange);
  const stroke = activePoints.length >= 2 ? toneColor(tone) : chartColor.primary;
  const ChangeIcon = tone === "up" ? ArrowUpRight : tone === "down" ? ArrowDownRight : Minus;
  const draw = useChartDraw(chartData.length >= 2);
  const drawBars = useChartDraw(momChartData.length >= 2);

  const state = loading ? "loading" : error ? "error" : !data || activePoints.length === 0 ? "empty" : "ready";
  const segmentLabel = activeSegment === "overall" ? t("index.allVehicles", "All vehicles") : activeSegment;

  return (
    <PageCanvas ambient="none">
      <PageHeader
        eyebrow={t("index.eyebrow", "Market benchmark")}
        eyebrowIcon={LineChart}
        title={t("index.title", "SL Used Vehicle Price Index.")}
        description={t("index.description", "One number for the whole used-car market, mix-adjusted so it tracks real price movement — not whichever cars happened to be for sale that month.")}
      />

      <FreePlanBanner />

      <PageBody className="space-y-6 pt-0 lg:pt-0">
        {state === "loading" ? (
          <div role="status" aria-label={t("index.loading", "Loading price index")} className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <StatTile key={i} loading label={"\u00a0"} value={null} hint=" " />
              ))}
            </div>
            <Skeleton shape="chart" className="h-[22rem]" />
          </div>
        ) : state === "error" ? (
          <Card padding="none">
            <ErrorState
              title={t("index.errorTitle", "The price index didn't load")}
              body={t("index.errorBody", "Check your connection and try again.")}
              onRetry={retry}
            />
          </Card>
        ) : state === "empty" ? (
          <Card padding="none">
            <EmptyState
              icon={LineChart}
              title={t("index.emptyTitle", "The index is still building")}
              body={t("index.empty", "The index needs a few months of accumulated market aggregates before it can plot a like-for-like trend. It will populate as daily scans build history.")}
            />
          </Card>
        ) : (
          <>
            {/* Headline stats */}
            <m.div variants={revealItem} className="grid gap-3 sm:grid-cols-3">
              <StatTile
                label={t("index.current", "Current index")}
                value={
                  <FlowValue
                    value={Number(latest?.index_value ?? 0)}
                    format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
                    label={Number(latest?.index_value ?? 0).toFixed(1)}
                  />
                }
                hint={t("index.baseEquals100", "base {period} = 100", { period: data?.base_period ? formatPeriod(data.base_period) : "—" })}
              />
              <StatTile
                label={t("index.sinceBase", "Since base")}
                value={
                  totalChange == null || !Number.isFinite(totalChange) ? (
                    "—"
                  ) : (
                    <span className={cn("inline-flex items-center gap-1", tone === "up" ? "text-deal-caution-text" : tone === "down" ? "text-deal-good-text" : "text-foreground")}>
                      <ChangeIcon className="h-6 w-6" aria-hidden />
                      <FlowValue value={totalChange} format={PCT_FORMAT} suffix="%" label={formatPct(totalChange)} />
                    </span>
                  )
                }
                hint={t("index.wholeWindow", "whole tracked window")}
              />
              <StatTile
                label={t("index.mom", "Month-on-month")}
                value={
                  latest?.mom_change_pct == null ? (
                    "—"
                  ) : (
                    <FlowValue value={latest.mom_change_pct} format={PCT_FORMAT} suffix="%" label={formatPct(latest.mom_change_pct)} />
                  )
                }
                hint={t("index.latestPeriod", "latest: {period}", { period: latest ? formatPeriod(latest.period) : "—" })}
              />
            </m.div>

            {/* Segment switcher — Free stays on overall; Pro unlocks segments */}
            {segmentKeys.length > 1 && (
              <m.div variants={revealItem} className="flex flex-wrap gap-2" role="group" aria-label={t("index.segmentAria", "Index segment")}>
                {segmentKeys.map((seg) => {
                  const locked = !fullAccess && seg !== "overall";
                  return (
                    <Chip
                      key={seg}
                      selected={activeSegment === seg}
                      disabled={locked}
                      onClick={() => {
                        if (!locked) setActiveSegment(seg);
                      }}
                      title={locked ? freePlanCopy.indexBody : undefined}
                    >
                      {seg === "overall" ? t("index.allVehicles", "All vehicles") : seg}
                      {locked ? " · Pro" : ""}
                    </Chip>
                  );
                })}
              </m.div>
            )}

            {/* Index chart */}
            <m.div variants={revealItem}>
              <Card padding="md">
                <SectionHeading
                  as="h3"
                  className="mb-4"
                  eyebrow={segmentLabel}
                  title={t("index.chartTitle", "Index over time")}
                  description={t("index.chartBody", "Mix-adjusted, base month = 100.")}
                />
                <ChartFrame
                  state={chartData.length >= 2 ? "ready" : "empty"}
                  heightClass="h-72 sm:h-[22rem]"
                  emptyTitle={t("index.oneMonthTitle", "One month in so far")}
                  emptyBody={t("index.oneMonthBody", "The line draws once the index has a second month.")}
                  label={t("index.chartAria", "{segment} price index: {n} months, currently {value} ({change} since base)", {
                    segment: segmentLabel,
                    n: chartData.length,
                    value: latest ? latest.index_value.toFixed(1) : "—",
                    change: formatPct(totalChange),
                  })}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="idxFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
                          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...chartGrid} />
                      <XAxis {...chartAxis} dataKey="tick" minTickGap={28} interval="preserveStartEnd" />
                      <YAxis {...chartAxis} domain={["auto", "auto"]} width={44} />
                      <ReferenceLine y={100} stroke={chartColor.grid} strokeDasharray="2 4" />
                      <Tooltip
                        {...chartTooltip(calm)}
                        content={(p) => (
                          <ChartTooltipCard
                            {...p}
                            title={(_l, payload) => String((payload?.[0]?.payload as { label?: string } | undefined)?.label ?? "")}
                            rows={(payload) => {
                              const row = payload?.[0]?.payload as PriceIndexPoint | undefined;
                              if (!row) return [];
                              return [
                                { label: t("index.indexLabel", "Index"), value: row.index_value.toFixed(1), color: stroke },
                                { label: t("index.momShort", "MoM"), value: formatPct(row.mom_change_pct) },
                              ];
                            }}
                          />
                        )}
                      />
                      <Area type="monotone" dataKey="index_value" stroke={stroke} strokeWidth={2.5} fill="url(#idxFill)" dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: stroke, stroke: chartColor.surface }} {...draw} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartFrame>
              </Card>
            </m.div>

            {/* Month-on-month momentum */}
            <m.div variants={revealItem}>
              <Card padding="md">
                <SectionHeading
                  as="h3"
                  className="mb-4"
                  title={t("index.momTitle", "Monthly momentum")}
                  description={t("index.momHint", "month-on-month index change")}
                />
                <ChartFrame
                  state={momChartData.length >= 2 ? "ready" : "empty"}
                  heightClass="h-56"
                  emptyTitle={t("index.momEmptyTitle", "Not enough months yet")}
                  emptyBody={t("index.momEmptyBody", "Momentum bars appear after two months of index changes.")}
                  label={t("index.momAria", "Bar chart of month-on-month index changes")}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={momChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid {...chartGrid} />
                      <XAxis {...chartAxis} dataKey="tick" minTickGap={20} interval="preserveStartEnd" />
                      <YAxis {...chartAxis} width={44} tickFormatter={(v: number) => `${v}%`} />
                      <ReferenceLine y={0} stroke={chartColor.grid} />
                      <Tooltip
                        {...chartTooltip(calm)}
                        cursor={{ fill: chartColor.grid, fillOpacity: 0.4 }}
                        content={(p) => (
                          <ChartTooltipCard
                            {...p}
                            title={(_l, payload) => String((payload?.[0]?.payload as { label?: string } | undefined)?.label ?? "")}
                            rows={(payload) => {
                              const row = payload?.[0]?.payload as { mom: number } | undefined;
                              return row ? [{ label: t("index.momShort", "MoM"), value: formatPct(row.mom), color: toneColor(toneFor(row.mom)) }] : [];
                            }}
                          />
                        )}
                      />
                      <Bar dataKey="mom" radius={[4, 4, 4, 4]} maxBarSize={28} {...drawBars}>
                        {momChartData.map((d) => (
                          <Cell key={d.label} fill={toneColor(toneFor(d.mom))} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartFrame>
              </Card>
            </m.div>

            {!fullAccess ? (
              <UpgradePrompt
                title={freePlanCopy.indexTitle}
                body={freePlanCopy.indexBody}
                variant="strip"
              />
            ) : null}

            {/* Methodology */}
            {data?.methodology ? (
              <m.div variants={revealItem}>
                <Card padding="md" className="flex items-start gap-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <div>
                    <h2 className="text-callout font-semibold text-foreground">{t("index.methodology", "Methodology")}</h2>
                    <p className="mt-1.5 text-footnote text-label-2">{data.methodology}</p>
                  </div>
                </Card>
              </m.div>
            ) : null}
          </>
        )}
      </PageBody>
    </PageCanvas>
  );
}
