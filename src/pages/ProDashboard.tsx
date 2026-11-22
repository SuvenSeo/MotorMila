import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Car, Database, Gauge, MapPin, TableProperties, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { ProShell, type DeskMode, type DeskModeConfig, type TapeStat } from "@/components/pro/ProShell";
import { ExportMenu } from "@/components/pro/ExportMenu";
import { DetailSheet } from "@/components/pro/DetailSheet";
import { ReportDrawer } from "@/components/pro/ReportDrawer";
import { MarketMode, type DeskWindow } from "@/components/pro/modes/MarketMode";
import { LanesMode } from "@/components/pro/modes/LanesMode";
import { GeographiesMode } from "@/components/pro/modes/GeographiesMode";
import { MovementMode } from "@/components/pro/modes/MovementMode";
import { SourcesMode } from "@/components/pro/modes/SourcesMode";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState } from "@/components/ui/error-state";
import { useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";
import { marketReport } from "@/lib/proReportBuilders";
import { exportLanePack, type LanePackFormat } from "@/lib/laneExport";
import { formatLkrCompact } from "@/lib/price";
import { formatRelativeTime } from "@/lib/formatting";
import { changeOverMonths, freshness } from "@/lib/proAnalytics";
import {
  getDistrictVelocity,
  getImportEraSplit,
  getProArbitrageGaps,
  getProDistrictDetail,
  getProDistricts,
  getProMarketPulse,
  getProMarketSnapshot,
  getProPriceIndex,
  getProVehicleLaneDetail,
  getProVehicleLanes,
  getSourceQuality,
} from "@/services/api";
import type { DistrictVelocityData, ImportEraSplitData, PriceIndex, SourceQualityResponse } from "@/types/car";
import type {
  ProArbitrageGap,
  ProDetailPayload,
  ProDistrictProfile,
  ProMarketPulse,
  ProMarketSnapshot,
  ProVehicleLane,
} from "@/types/pro";

const MODES: DeskModeConfig[] = [
  { id: "market", label: "Market", title: "The market desk", hint: "Index, supply and mispriced stock, in one read", icon: Gauge },
  { id: "lanes", label: "Lanes", title: "Lane intelligence", hint: "Every make and model, ranked the way a buyer shortlists", icon: Car },
  { id: "geographies", label: "Areas", title: "Area desk", hint: "District depth, delivery speed and cross-district gaps", icon: MapPin },
  { id: "movement", label: "Movement", title: "Movement", hint: "What changed, and which cohorts explain it", icon: TrendingUp },
  { id: "sources", label: "Sources", title: "Source trust", hint: "The pipeline underneath every number on this desk", icon: Database },
];

const MODE_IDS = MODES.map((mode) => mode.id);
const isDeskMode = (value: string | undefined): value is DeskMode => Boolean(value && (MODE_IDS as string[]).includes(value));

/** A request that may legitimately return nothing yet (an endpoint still deploying). */
async function optional<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

/**
 * The Pro desk. One shell, five modes, one scope bar. Data loads per endpoint so
 * a single failing panel never blanks the workspace: whatever arrived is
 * rendered, and what did not says so.
 */
export default function ProDashboard() {
  const { user, hasProAccess, isAuthenticated, logout } = useAuth();
  const { t } = useAppPreferences();
  const navigate = useNavigate();
  const params = useParams<{ mode?: string }>();
  const mode: DeskMode = isDeskMode(params.mode) ? params.mode : "market";

  const [snapshot, setSnapshot] = useState<ProMarketSnapshot | null>(null);
  const [lanes, setLanes] = useState<ProVehicleLane[]>([]);
  const [districts, setDistricts] = useState<ProDistrictProfile[]>([]);
  const [pulse, setPulse] = useState<ProMarketPulse | null>(null);
  const [index, setIndex] = useState<PriceIndex | null>(null);
  const [velocity, setVelocity] = useState<DistrictVelocityData["points"]>([]);
  const [era, setEra] = useState<ImportEraSplitData | null>(null);
  const [quality, setQuality] = useState<SourceQualityResponse | null>(null);
  const [gaps, setGaps] = useState<ProArbitrageGap[]>([]);
  const [loadingGaps, setLoadingGaps] = useState(false);
  const [trendDetail, setTrendDetail] = useState<ProDetailPayload | null>(null);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [district, setDistrict] = useState("all");
  const [source, setSource] = useState("all");
  const [windowMonths, setWindowMonths] = useState<DeskWindow>(12);
  const [arbitrageLane, setArbitrageLane] = useState("all");
  const [trendLane, setTrendLane] = useState("");
  const [detail, setDetail] = useState<ProDetailPayload | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    setFatal(null);
    const [nextSnapshot, nextLanes, nextDistricts, nextPulse, nextIndex, nextVelocity, nextEra, nextQuality] = await Promise.all([
      optional(getProMarketSnapshot),
      optional(getProVehicleLanes),
      optional(getProDistricts),
      optional(getProMarketPulse),
      optional(getProPriceIndex),
      optional(() => getDistrictVelocity()),
      optional(() => getImportEraSplit()),
      optional(getSourceQuality),
    ]);

    if (!nextSnapshot && !(nextLanes?.length ?? 0) && !(nextDistricts?.length ?? 0)) {
      setFatal(t("pro.error.fatal", "The Pro API did not answer. Check the connection and try again."));
    }
    setSnapshot(nextSnapshot);
    setLanes(nextLanes ?? []);
    setDistricts(nextDistricts ?? []);
    setPulse(nextPulse);
    setIndex(nextIndex);
    setVelocity(nextVelocity?.points ?? []);
    setEra(nextEra);
    setQuality(nextQuality);
    setLoading(false);
    setRefreshing(false);
  }, [t]);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  // Default the trend lane to the deepest lane once the table arrives.
  useEffect(() => {
    if (trendLane || lanes.length === 0) return;
    const deepest = [...lanes].sort((a, b) => b.listing_count - a.listing_count)[0];
    if (deepest) setTrendLane(`${deepest.make}|||${deepest.model}`);
  }, [lanes, trendLane]);

  // Lane detail for the movement chart.
  useEffect(() => {
    if (mode !== "movement" || !trendLane) return;
    const [make, model] = trendLane.split("|||");
    if (!make || !model) return;
    let cancelled = false;
    setLoadingTrend(true);
    void getProVehicleLaneDetail({ make, model })
      .then((result) => {
        if (!cancelled) setTrendDetail(result);
      })
      .catch(() => {
        if (!cancelled) setTrendDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingTrend(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, trendLane]);

  // Arbitrage: whole market by default, one lane when chosen.
  useEffect(() => {
    if (mode !== "geographies") return;
    let cancelled = false;
    setLoadingGaps(true);
    const [make, model] = arbitrageLane === "all" ? [] : arbitrageLane.split("|||");
    void getProArbitrageGaps(make || undefined, model || undefined, 12)
      .then((result) => {
        if (!cancelled) setGaps(result);
      })
      .catch(() => {
        if (!cancelled) setGaps([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingGaps(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, arbitrageLane, refreshing]);

  const openLane = useCallback(async (lane: ProVehicleLane) => {
    setDetail(null);
    setDetailOpen(true);
    try {
      setDetail(await getProVehicleLaneDetail({ make: lane.make, model: lane.model }));
    } catch {
      toast.error(t("pro.error.detail", "Could not load this lane"));
      setDetailOpen(false);
    }
  }, [t]);

  const openDistrict = useCallback(async (name: string) => {
    setDetail(null);
    setDetailOpen(true);
    try {
      setDetail(await getProDistrictDetail(name));
    } catch {
      toast.error(t("pro.error.detail", "Could not load this lane"));
      setDetailOpen(false);
    }
  }, [t]);

  const openSource = useCallback(async (row: { label: string }) => {
    setDetail(null);
    setDetailOpen(true);
    try {
      const first = snapshot?.top_opportunities?.find((listing) => listing.source.toLowerCase() === row.label.toLowerCase());
      const make = first?.make;
      const model = first?.model;
      if (!make || !model) throw new Error("No scored listing to anchor this source.");
      setDetail(await getProVehicleLaneDetail({ make, model }));
    } catch {
      setDetailOpen(false);
      toast.info(t("pro.error.sourceDetail", "Open a source from the quality table to see its lane context."));
    }
  }, [snapshot, t]);

  const exportLanePackFile = useCallback(
    async (format: LanePackFormat) => {
      try {
        await exportLanePack(
          {
            lanes,
            gaps,
            comps: snapshot?.top_opportunities ?? [],
            watermark: !hasProAccess,
            laneLabel: "vehicle lanes",
          },
          format,
        );
        toast.success(t("proDash.export.started", "{format} export started", { format: format.toUpperCase() }));
      } catch (error) {
        toast.error(t("proDash.export.failed", "Export failed"), {
          description: error instanceof Error ? error.message : t("proDash.export.unable", "Unable to create this report."),
        });
      }
    },
    [lanes, gaps, snapshot, hasProAccess, t],
  );

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const districtOptions = useMemo(
    () => districts.map((item) => item.district).sort(),
    [districts],
  );
  const sourceOptions = useMemo(
    () => (snapshot?.source_coverage ?? []).map((item) => item.label),
    [snapshot],
  );

  const marketReportPayload = useMemo(() => marketReport(snapshot, lanes, districts), [snapshot, lanes, districts]);

  const medianDelta = changeOverMonths(index?.points, windowMonths === null ? null : Math.min(windowMonths, 12));
  const latestIndex = index?.points?.[index.points.length - 1];
  const freshnessState = freshness(snapshot?.last_updated ?? snapshot?.generated_at ?? null);

  const tape: TapeStat[] = [
    {
      key: "median",
      label: t("pro.tape.median", "Median"),
      value: formatLkrCompact(snapshot?.median_price_lkr),
      delta: medianDelta,
      polarity: "price",
      period: windowMonths ? `${windowMonths}M` : undefined,
    },
    {
      key: "index",
      label: t("pro.tape.index", "Index"),
      value: latestIndex ? latestIndex.index_value.toFixed(1) : "—",
      delta: latestIndex?.mom_change_pct ?? null,
      polarity: "price",
      period: t("pro.period.mom", "MoM"),
    },
    {
      key: "supply",
      label: t("pro.tape.new7", "New 7d"),
      value: (pulse?.new_7d ?? snapshot?.new_listings_7d ?? 0).toLocaleString("en-US"),
      polarity: "volume",
    },
    {
      key: "deals",
      label: t("pro.tape.hot", "Hot deals"),
      value: (snapshot?.hot_deal_count ?? 0).toLocaleString("en-US"),
      polarity: "score",
    },
    {
      key: "reach",
      label: t("pro.tape.reach", "Reach"),
      value: `${snapshot?.districts_covered ?? 0} ${t("pro.tape.districts", "districts")} · ${snapshot?.source_count ?? 0} ${t("pro.tape.sources", "sources")}`,
    },
  ];

  const filters = (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select value={district} onValueChange={setDistrict}>
        <SelectTrigger className="h-8 w-[9.5rem] border-white/15 bg-white/5 text-white" aria-label={t("pro.filter.district", "Filter by district")}>
          <SelectValue placeholder={t("pro.lanes.district", "District")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("pro.lanes.allDistricts", "All districts")}</SelectItem>
          {districtOptions.map((item) => (
            <SelectItem key={item} value={item}>{item}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={source} onValueChange={setSource}>
        <SelectTrigger className="h-8 w-[9.5rem] border-white/15 bg-white/5 text-white" aria-label={t("pro.filter.source", "Filter by source")}>
          <SelectValue placeholder={t("pro.lanes.source", "Source")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("pro.lanes.allSources", "All sources")}</SelectItem>
          {sourceOptions.map((item) => (
            <SelectItem key={item} value={item}>{item}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div
        role="group"
        aria-label={t("pro.filter.window", "Comparison window")}
        className="inline-flex h-8 items-center gap-0.5 rounded-full border border-white/15 bg-white/5 p-0.5"
      >
        {[
          { value: "6", label: "6M" },
          { value: "12", label: "12M" },
          { value: "24", label: "24M" },
          { value: "all", label: t("pro.window.all", "All") },
        ].map((option) => {
          const active = (windowMonths === null ? "all" : String(windowMonths)) === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => setWindowMonths(option.value === "all" ? null : (Number(option.value) as DeskWindow))}
              className={
                active
                  ? "rounded-full bg-white/15 px-2.5 py-1 text-caption font-semibold text-white"
                  : "rounded-full px-2.5 py-1 text-caption font-semibold text-white/60 transition-colors hover:text-white"
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <ProShell
      modes={MODES}
      mode={mode}
      onMode={(next) => navigate(next === "market" ? "/pro" : `/pro/${next}`)}
      filters={filters}
      freshness={
        <>
          <span
            aria-hidden
            className={
              freshnessState === "stale"
                ? "h-1.5 w-1.5 rounded-full bg-deal-high"
                : freshnessState === "unknown"
                  ? "h-1.5 w-1.5 rounded-full bg-white/30"
                  : "h-1.5 w-1.5 rounded-full bg-deal-good"
            }
          />
          {freshnessState === "live" ? t("pro.fresh.live", "Live") : t("pro.fresh.updated", "Updated {when}", { when: formatRelativeTime(snapshot?.last_updated ?? snapshot?.generated_at) })}
        </>
      }
      onRefresh={refresh}
      refreshing={refreshing}
      actions={
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setReportOpen(true)}
            className="text-white/75 hover:text-white"
          >
            <TableProperties aria-hidden />
            <span className="hidden sm:inline">{t("pro.reports", "Reports")}</span>
          </Button>
          <div className="[&_button]:text-white/80 [&_button:hover]:text-white">
            <ExportMenu report={marketReportPayload} variant="ghost" />
          </div>
        </>
      }
      tape={tape}
      account={{ email: user?.email, plan: user?.plan, onLogout: handleLogout }}
    >
      {fatal ? (
        <div className="mb-5 rounded-card border border-border bg-surface-1">
          <ErrorState body={fatal} onRetry={refresh} className="py-8" />
        </div>
      ) : null}

      {!hasProAccess && isAuthenticated ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-card border border-primary/25 bg-primary/[0.06] px-4 py-2.5">
          <p className="text-footnote text-label-2">
            {t("pro.trial.banner", "Trial view: the desk is showing a sample of lanes and opportunities. Pro opens every row, every month and the export pack.")}
          </p>
          <Button asChild size="sm">
            <a href="/pricing">{t("pro.trial.cta", "See Pro")}</a>
          </Button>
        </div>
      ) : null}

      {mode === "market" ? (
        <MarketMode
          loading={loading}
          snapshot={snapshot}
          lanes={lanes}
          districts={districts}
          index={index}
          pulse={pulse}
          velocity={velocity}
          windowMonths={windowMonths}
          hasProAccess={hasProAccess}
        />
      ) : null}

      {mode === "lanes" ? (
        <LanesMode
          lanes={lanes}
          loading={loading}
          hasProAccess={hasProAccess}
          district={district}
          source={source}
          onDistrict={setDistrict}
          onSource={setSource}
          onOpenLane={(lane) => void openLane(lane)}
          onExport={(format) => void exportLanePackFile(format)}
        />
      ) : null}

      {mode === "geographies" ? (
        <GeographiesMode
          districts={districts}
          lanes={lanes}
          velocity={velocity}
          gaps={gaps}
          loading={loading || loadingGaps}
          marketMedian={snapshot?.median_price_lkr ?? null}
          arbitrageLane={arbitrageLane}
          onArbitrageLane={setArbitrageLane}
          onOpenDistrict={(name) => void openDistrict(name)}
        />
      ) : null}

      {mode === "movement" ? (
        <MovementMode
          lanes={lanes}
          index={index}
          trendDetail={trendDetail}
          trendLane={trendLane}
          onTrendLane={setTrendLane}
          era={era}
          loadingEra={loading}
          pulse={pulse}
          loading={loading || loadingTrend}
        />
      ) : null}

      {mode === "sources" ? (
        <SourcesMode
          snapshot={snapshot}
          quality={quality}
          districts={districts}
          loading={loading}
          onOpenSource={(row) => void openSource(row)}
        />
      ) : null}

      <footer className="mt-8 flex flex-col gap-2 border-t border-separator pt-4 text-caption text-label-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{t("proDash.proDataIsAggregatedFrom", "Pro data is aggregated from public Sri Lanka vehicle marketplaces for commercial analysis.")}</span>
        <span className="tabular-nums">{user?.email}</span>
      </footer>

      <DetailSheet detail={detail} open={detailOpen} onOpenChange={setDetailOpen} />
      <ReportDrawer open={reportOpen} onOpenChange={setReportOpen} snapshot={snapshot} lanes={lanes} districts={districts} />
    </ProShell>
  );
}
