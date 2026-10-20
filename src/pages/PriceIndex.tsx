import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowDownRight, ArrowUpRight, LineChart, Info } from "lucide-react";
import { getPriceIndex } from "@/services/api";
import type { PriceIndex, PriceIndexPoint } from "@/types/car";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import { AtmosphericImage } from "@/components/AtmosphericImage";
import { FreePlanBanner } from "@/components/FreePlanBanner";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import {
  FREE_TRENDS_MONTHS,
  freePlanCopy,
  hasFullPlatformAccess,
  takeLastMonths,
} from "@/lib/planLimits";
import { visuals } from "@/lib/visualAssets";

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 220, damping: 24 } },
} as const;

function formatPeriod(period: string): string {
  const [y, m] = period.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : period;
}

function formatPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export default function PriceIndexPage() {
  const { t } = useAppPreferences();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  const [data, setData] = useState<PriceIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeSegment, setActiveSegment] = useState<string>("overall");

  useEffect(() => {
    let cancelled = false;
    document.title = "SL Used Vehicle Price Index — Motormila";
    getPriceIndex()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

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

  const chartData = activePoints.map((p) => ({ ...p, label: formatPeriod(p.period) }));
  const momChartData = useMemo(
    () => activePoints.map((p) => ({ label: formatPeriod(p.period), mom: Number(p.mom_change_pct ?? 0) })),
    [activePoints],
  );
  const latest = activePoints[activePoints.length - 1];
  const first = activePoints[0];
  const totalChange = latest && first && first.index_value > 0
    ? ((latest.index_value - first.index_value) / first.index_value) * 100
    : null;
  const up = (totalChange ?? 0) >= 0;

  return (
    <motion.div initial="hidden" animate="show" variants={containerVariants} className="min-h-screen relative overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <AtmosphericImage
          src={visuals.priceIntelligenceBg.src}
          srcSm={visuals.priceIntelligenceBg.srcSm}
          className="h-full w-full object-cover object-center opacity-[0.22]"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/85 via-background/92 to-background" />
      </div>
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <motion.section variants={itemVariants} className="border-b border-border bg-surface/40 backdrop-blur-md relative z-10">
        <div className="mx-auto max-w-[1320px] px-5 py-10 sm:px-6 sm:py-12">
          <p className="text-[12px] font-semibold text-primary-bright">{t("index.eyebrow", "Market benchmark")}</p>
          <h1 className="mt-3 font-display text-[2rem] font-bold tracking-tight leading-[1.05] text-white sm:text-[2.75rem] lg:text-[3rem]">
            {t("index.title", "SL Used Vehicle Price Index.")}
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted-foreground font-medium">
            {t("index.description", "One number for the whole used-car market, mix-adjusted so it tracks real price movement — not whichever cars happened to be for sale that month.")}
          </p>
        </div>
      </motion.section>

      <FreePlanBanner />

      <div className="mx-auto max-w-[1320px] px-5 py-8 sm:px-6 lg:py-10 space-y-6 relative z-10">
        {loading ? (
          <div role="status" aria-label={t("index.loading", "Loading price index")} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-xl border border-white/5 bg-white/[0.01] p-5">
                  <div className="skeleton-shimmer h-3 w-24 rounded-full" />
                  <div className="skeleton-shimmer mt-3 h-9 w-32 rounded-xl" />
                  <div className="skeleton-shimmer mt-2 h-3 w-20 rounded-full" />
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.01] p-5" aria-hidden="true">
              <div className="skeleton-shimmer h-[320px] w-full rounded-xl" />
            </div>
          </div>
        ) : error || !data || activePoints.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/10 py-16 text-center">
            <LineChart className="h-5 w-5 text-muted-foreground" />
            <p className="max-w-md text-[13px] text-muted-foreground font-medium">
              {t("index.empty", "The index needs a few months of accumulated market aggregates before it can plot a like-for-like trend. It will populate as daily scans build history.")}
            </p>
          </div>
        ) : (
          <>
            {/* Headline stats */}
            <motion.div variants={itemVariants} className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                <p className="text-[12px] font-semibold text-muted-foreground">{t("index.current", "Current index")}</p>
                <p className="num mt-2 text-3xl font-bold text-white">
                  <NumberFlow value={Number(latest?.index_value ?? 0)} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} />
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground font-medium">
                  {t("index.baseEquals100", "base {period} = 100", { period: data.base_period ? formatPeriod(data.base_period) : "—" })}
                </p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.01] p-5">
                <p className="text-[12px] font-semibold text-muted-foreground">{t("index.sinceBase", "Since base")}</p>
                <p className={`num mt-2 flex items-center gap-1.5 text-3xl font-bold ${up ? "text-emerald-400" : "text-rose-400"}`}>
                  {up ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownRight className="h-6 w-6" />}
                  {totalChange == null || !Number.isFinite(totalChange) ? "—" : (
                    <NumberFlow
                      value={totalChange}
                      format={{ minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" }}
                      suffix="%"
                    />
                  )}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground font-medium">{t("index.wholeWindow", "whole tracked window")}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.01] p-5">
                <p className="text-[12px] font-semibold text-muted-foreground">{t("index.mom", "Month-on-month")}</p>
                <p className="num mt-2 text-3xl font-bold text-white">
                  {latest?.mom_change_pct == null ? "—" : (
                    <NumberFlow
                      value={latest.mom_change_pct}
                      format={{ minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" }}
                      suffix="%"
                    />
                  )}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground font-medium">
                  latest: {latest ? formatPeriod(latest.period) : "—"}
                </p>
              </div>
            </motion.div>

            {/* Segment switcher — Free stays on overall; Pro unlocks segments */}
            {segmentKeys.length > 1 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label={t("index.segmentAria", "Index segment")}>
                {segmentKeys.map((seg) => {
                  const locked = !fullAccess && seg !== "overall";
                  return (
                    <button
                      key={seg}
                      type="button"
                      disabled={locked}
                      onClick={() => {
                        if (!locked) setActiveSegment(seg);
                      }}
                      aria-pressed={activeSegment === seg}
                      title={locked ? freePlanCopy.indexBody : undefined}
                      className={`rounded-2xl border px-3.5 py-1.5 text-[12px] font-semibold transition-all ${
                        activeSegment === seg
                          ? "border-primary/30 bg-primary/10 text-primary-bright"
                          : locked
                            ? "cursor-not-allowed border-white/5 bg-white/[0.01] text-muted-foreground/50"
                            : "border-white/5 bg-white/[0.01] text-muted-foreground hover:text-white"
                      }`}
                    >
                      {seg === "overall" ? t("index.allVehicles", "All vehicles") : seg}
                      {locked ? " · Pro" : ""}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Chart */}
            <motion.div variants={itemVariants} className="rounded-xl border border-white/5 bg-white/[0.01] p-5 backdrop-blur-md">
              <div
                role="img"
                aria-label={`${activeSegment === "overall" ? "Overall" : activeSegment} price index: ${chartData.length} months, currently ${latest?.index_value.toFixed(1)} (${formatPct(totalChange)} since base)`}
                className="h-[360px] w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 18, right: 12, left: -8, bottom: 8 }}>
                    <defs>
                      <linearGradient id="idxFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(250 89% 65%)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(250 89% 65%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} width={44} />
                    <Tooltip
                      contentStyle={{ background: "#0e0e11", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, fontSize: 12 }}
                      labelStyle={{ color: "#fff", fontWeight: 700 }}
                      formatter={(value: number, _name, entry) => {
                        const mom = (entry?.payload as PriceIndexPoint | undefined)?.mom_change_pct;
                        return [`${value.toFixed(1)}  (${formatPct(mom ?? null)} MoM)`, "Index"];
                      }}
                    />
                    <Area type="monotone" dataKey="index_value" stroke="hsl(250 89% 78%)" strokeWidth={2} fill="url(#idxFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Month-on-month momentum — Bklit bar chart (#14 UI review) */}
            <motion.div variants={itemVariants} className="rounded-xl border border-white/5 bg-white/[0.01] p-5 backdrop-blur-md">
              <div className="mb-1 flex items-baseline justify-between">
                <h2 className="text-[13px] font-bold text-white">{t("index.momTitle", "Monthly momentum")}</h2>
                <p className="text-[11px] text-muted-foreground font-medium">{t("index.momHint", "month-on-month index change")}</p>
              </div>
              <div className="h-[220px] w-full" role="img" aria-label={t("index.momAria", "Bar chart of month-on-month index changes")}>
                <BarChart data={momChartData} xDataKey="label" margin={{ top: 12, right: 8, bottom: 8, left: 8 }}>
                  <Grid horizontal />
                  <Bar dataKey="mom" fill="hsl(250 89% 65%)" lineCap="round" />
                  <BarXAxis maxLabels={8} />
                  <ChartTooltip />
                </BarChart>
              </div>
            </motion.div>

            {!fullAccess ? (
              <UpgradePrompt
                title={freePlanCopy.indexTitle}
                body={freePlanCopy.indexBody}
                variant="strip"
              />
            ) : null}

            {/* Methodology */}
            <motion.div variants={itemVariants} className="rounded-xl border border-white/5 bg-white/[0.01] p-5">
              <div className="flex items-start gap-2.5">
                <Info className="h-4 w-4 text-primary-bright shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-[13px] font-bold text-white">{t("index.methodology", "Methodology")}</h2>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground font-medium">{data.methodology}</p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </div>
    </motion.div>
  );
}
