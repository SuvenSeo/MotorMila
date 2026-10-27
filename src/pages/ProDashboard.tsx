import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { motion } from "motion/react";
import { listStagger } from "@/lib/motion";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CineHeader } from "@/components/CineHeader";
import { CineFigure, CineSection } from "@/components/CineSection";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, useNavigate } from "react-router-dom";

const containerVariants = listStagger;
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRightLeft,
  BarChart3,
  Car,
  CheckCircle2,
  Crown,
  Database,
  Download,
  FileBarChart,
  FileSpreadsheet,
  LogOut,
  MapPin,
  Palette,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TableProperties,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { ArbitrageTable } from "@/components/ArbitrageTable";
import { VelocityBadge } from "@/components/VelocityBadge";
import { SourceQualityScorecard } from "@/components/SourceQualityScorecard";
import { Checkbox } from "@/components/ui/checkbox";
// Surface and AmbientBackground removed — using direct styling
import { Button } from "@/components/ui/button";
// HeroPill removed
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PRO_EXPORTS_ENFORCED, useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";
import { customizeProReport } from "@/lib/proReportCustomize";
import { exportLanePack, type LanePackFormat } from "@/lib/laneExport";
import { formatPriceLkrMillions, formatRelativeTime } from "@/lib/formatting";
import {
  getImportEraSplit,
  getProArbitrageGaps,
  getProDistrictDetail,
  getProDistricts,
  getProMarketSnapshot,
  getProVehicleLaneDetail,
  getProVehicleLanes,
} from "@/services/api";
import type { ImportEraSplitData } from "@/types/car";
import type {
  ProArbitrageGap,
  ProBreakdownPoint,
  ProDetailPayload,
  ProDistrictProfile,
  ProExportFormat,
  ProMarketSnapshot,
  ProReportPayload,
  ProReportSectionId,
  ProReportTheme,
  ProTrendPoint,
  ProVehicleLane,
} from "@/types/pro";
import { formatLkrCompact } from "@/lib/price";

type WorkspaceTab = "overview" | "vehicles" | "areas" | "trends" | "sources" | "reports";
type LaneFocus = "all" | "hot" | "coverage" | "fresh";
type ReportScope = "market" | "vehicle" | "district" | "source" | "lanes_table" | "districts_table";

const EXPORT_FORMATS: Array<{ format: ProExportFormat; label: string }> = [
  { format: "pdf", label: "PDF" },
  { format: "docx", label: "Word" },
  { format: "csv", label: "CSV" },
  { format: "json", label: "JSON" },
  { format: "print", label: "Print" },
];

const TAB_CONFIG: Array<{ id: WorkspaceTab; labelKey: string; fallback: string; icon: React.ElementType }> = [
  { id: "overview", labelKey: "pro.tab.overview", fallback: "Overview", icon: BarChart3 },
  { id: "vehicles", labelKey: "pro.tab.vehicles", fallback: "Vehicles", icon: Car },
  { id: "areas", labelKey: "pro.tab.areas", fallback: "Areas", icon: MapPin },
  { id: "trends", labelKey: "pro.tab.trends", fallback: "Trends", icon: TrendingUp },
  { id: "sources", labelKey: "pro.tab.sources", fallback: "Sources", icon: Database },
  { id: "reports", labelKey: "pro.tab.reports", fallback: "Reports", icon: FileBarChart },
];

const LANE_FOCUS_OPTIONS: Array<{ value: LaneFocus; label: string }> = [
  { value: "all", label: "All lanes" },
  { value: "hot", label: "Hot deal lanes" },
  { value: "coverage", label: "Broad coverage" },
  { value: "fresh", label: "Fresh supply" },
];

const REPORT_SCOPE_OPTIONS: Array<{ value: ReportScope; label: string; detail: string }> = [
  { value: "market", label: "Market summary", detail: "Executive KPIs, source coverage, and opportunities" },
  { value: "vehicle", label: "Vehicle lane", detail: "One make/model with trend, mix, and listing samples" },
  { value: "district", label: "Area profile", detail: "One district with source mix and top models" },
  { value: "source", label: "Source quality", detail: "Coverage, freshness, and source-specific opportunities" },
  { value: "lanes_table", label: "Vehicle table", detail: "Current make/model intelligence table" },
  { value: "districts_table", label: "Area table", detail: "All district profiles in one export" },
];

const REPORT_SECTION_OPTIONS: Array<{ id: ProReportSectionId; label: string; detail: string }> = [
  { id: "metrics", label: "KPI cards", detail: "Hero metrics and summary indicators" },
  { id: "breakdowns", label: "Mix analysis", detail: "Source and district coverage tables" },
  { id: "trends", label: "Trend points", detail: "Monthly price history where available" },
  { id: "listings", label: "Sample listings", detail: "Live vehicle examples for context" },
  { id: "table", label: "Full table", detail: "Structured rows for the selected report pack" },
  { id: "filters", label: "Filters", detail: "Selected scope and report assumptions" },
  { id: "disclaimer", label: "Disclaimer", detail: "Data and valuation disclaimer" },
];

const REPORT_THEME_OPTIONS: Array<{ value: ProReportTheme; label: string; detail: string }> = [
  { value: "executive-dark", label: "Executive dark", detail: "Premium board-pack look with dark cover" },
  { value: "board-light", label: "Board light", detail: "Clean investor memo style for printing" },
  { value: "dealer-slate", label: "Dealer slate", detail: "Sharper blue slate style for operational packs" },
];

async function exportReport(report: ProReportPayload, format: ProExportFormat) {
  const { exportProReport } = await import("@/lib/proReports");
  await exportProReport(report, format);
}

function fmtMoney(value: number | null | undefined): string {
  return formatPriceLkrMillions(typeof value === "number" ? value : null);
}

function fmtCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "Pending";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Pending";
  return date.toLocaleDateString("en-LK", { month: "short", day: "numeric", year: "numeric" });
}

function trendRows(points: ProTrendPoint[]) {
  return points.map((point) => ({
    month: point.month,
    median: Number(point.median_price_lkr || point.avg_price_lkr || 0) / 1_000_000,
    avg: Number(point.avg_price_lkr || 0) / 1_000_000,
    samples: point.listing_count,
  }));
}

/** One figure in the overview strip: label, value (rolls once), quiet detail. */
function StatCell({
  label,
  value,
  numeric,
  compact,
  detail,
}: {
  label: string;
  value: string;
  /** Raw number: rolls with AnimatedNumber; `value` stays as the readable text. */
  numeric?: number | null;
  compact?: boolean;
  detail?: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[1fr_auto] items-baseline gap-x-4 py-3.5 sm:block sm:px-6 sm:py-4 sm:first:pl-0">
      <dt className="text-caption font-medium text-label-2">{label}</dt>
      <dd className="cine-card__price row-span-2 text-right text-title2 leading-none text-foreground sm:mt-2 sm:text-left sm:text-title1">
        {numeric != null && Number.isFinite(numeric) ? (
          <>
            <span className="sr-only">{value}</span>
            <span aria-hidden>
              <AnimatedNumber
                value={numeric}
                locales="en-US"
                format={compact ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: 0 }}
              />
            </span>
          </>
        ) : (
          value
        )}
      </dd>
      {detail && <dd className="mt-0.5 text-caption text-label-2 sm:mt-1.5 sm:text-footnote">{detail}</dd>}
    </div>
  );
}

/** Recharts tooltip on the dark chart panels. */
const CHART_TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  color: "hsl(var(--foreground))",
};

function ExportButtons({ report }: { report: ProReportPayload }) {
  const { hasProAccess, isAuthenticated } = useAuth();
  const { t } = useAppPreferences();
  const navigate = useNavigate();

  const runExport = async (format: ProExportFormat) => {
    if (PRO_EXPORTS_ENFORCED && (!isAuthenticated || !hasProAccess)) {
      toast.error(t("proDash.export.proRequired", "Pro subscription required"), {
        description: t("proDash.export.signInPro", "Sign in with a Pro account to download reports."),
        action: {
          label: t("proDash.export.signIn", "Sign in"),
          onClick: () => navigate("/sign-in"),
        },
      });
      return;
    }
    try {
      await exportReport(report, format);
      toast.success(t("proDash.export.started", "{format} export started", { format: format.toUpperCase() }));
    } catch (error) {
      toast.error(t("proDash.export.failed", "Export failed"), {
        description: error instanceof Error ? error.message : t("proDash.export.unable", "Unable to create this report."),
      });
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {EXPORT_FORMATS.map((item) => (
        <Button key={item.format} type="button" variant="secondary" size="sm" onClick={() => runExport(item.format)}>
          <Download aria-hidden />
          {item.label}
        </Button>
      ))}
    </div>
  );
}

function marketReport(
  snapshot: ProMarketSnapshot | null,
  lanes: ProVehicleLane[],
  districts: ProDistrictProfile[],
): ProReportPayload {
  return {
    title: "Motormila Pro Market Summary",
    subtitle: "Professional Sri Lanka vehicle market intelligence",
    scope: "market",
    generatedAt: new Date().toISOString(),
    metrics: snapshot
      ? [
          { label: "Priced listings", value: fmtCount(snapshot.total_listings), detail: "Non-outlier inventory" },
          { label: "Median price", value: fmtMoney(snapshot.median_price_lkr) },
          { label: "New listings 7d", value: fmtCount(snapshot.new_listings_7d) },
          { label: "Hot deals", value: fmtCount(snapshot.hot_deal_count) },
        ]
      : [],
    breakdowns: snapshot ? [{ title: "Source Coverage", rows: snapshot.source_coverage }] : [],
    listings: snapshot?.top_opportunities || [],
    table: {
      title: "Top Vehicle Lanes",
      columns: ["Vehicle", "Listings", "Median", "Avg Deal", "Top District", "Top Source"],
      rows: lanes.slice(0, 20).map((lane) => [
        `${lane.make} ${lane.model}`,
        lane.listing_count,
        fmtMoney(lane.median_price_lkr),
        lane.avg_deal_score?.toFixed(1) || "N/A",
        lane.top_district || "N/A",
        lane.top_source || "N/A",
      ]),
    },
    filters: {
      districts: districts.length,
      sources: snapshot?.source_count || 0,
    },
  };
}

function detailReport(detail: ProDetailPayload): ProReportPayload {
  return {
    title: detail.title,
    subtitle: detail.summary,
    scope: detail.kind,
    generatedAt: new Date().toISOString(),
    metrics: detail.metrics,
    breakdowns: [
      { title: "Source Mix", rows: detail.source_mix },
      { title: "District Mix", rows: detail.district_mix },
    ].filter((item) => item.rows.length),
    trends: detail.trend_points,
    listings: detail.sample_listings,
  };
}

function sourceReport(snapshot: ProMarketSnapshot, source: ProBreakdownPoint): ProReportPayload {
  return {
    title: `${source.label} Source Quality`,
    subtitle: `${source.count.toLocaleString()} listings, ${source.share_pct.toFixed(1)}% of tracked priced inventory`,
    scope: "source",
    generatedAt: new Date().toISOString(),
    metrics: [
      { label: "Listings", value: source.count.toLocaleString() },
      { label: "Share", value: `${source.share_pct.toFixed(1)}%` },
      { label: "Average price", value: fmtMoney(source.avg_price_lkr) },
      { label: "Latest seen", value: fmtDate(source.latest_seen_at) },
    ],
    breakdowns: [{ title: "Full Source Coverage", rows: snapshot.source_coverage }],
    listings: snapshot.top_opportunities.filter((listing) => listing.source.toLowerCase() === source.label.toLowerCase()),
  };
}

function lanesTableReport(lanes: ProVehicleLane[]): ProReportPayload {
  return {
    title: "Motormila Vehicle Lane Table",
    subtitle: "Grouped Pro vehicle intelligence rows",
    scope: "vehicle_lane",
    generatedAt: new Date().toISOString(),
    coverSummary: "Current make and model lanes ranked by market depth, price band, deal score, and source coverage.",
    metrics: [
      { label: "Vehicle lanes", value: fmtCount(lanes.length), detail: "Grouped make and model rows" },
      { label: "Total listings", value: fmtCount(lanes.reduce((sum, lane) => sum + lane.listing_count, 0)) },
      { label: "Sources", value: fmtCount(new Set(lanes.map((lane) => lane.top_source).filter(Boolean)).size) },
      { label: "District leaders", value: fmtCount(new Set(lanes.map((lane) => lane.top_district).filter(Boolean)).size) },
    ],
    table: {
      title: "Vehicle Lanes",
      columns: ["Vehicle", "Listings", "Median", "Min", "Max", "Avg Deal", "Top District", "Top Source"],
      rows: lanes.map((lane) => [
        `${lane.make} ${lane.model}`,
        lane.listing_count,
        fmtMoney(lane.median_price_lkr),
        fmtMoney(lane.min_price_lkr),
        fmtMoney(lane.max_price_lkr),
        lane.avg_deal_score?.toFixed(1) || "N/A",
        lane.top_district || "N/A",
        lane.top_source || "N/A",
      ]),
    },
  };
}

function districtsTableReport(districts: ProDistrictProfile[]): ProReportPayload {
  return {
    title: "Motormila District Opportunity Pack",
    subtitle: "District-level Pro intelligence rows",
    scope: "district",
    generatedAt: new Date().toISOString(),
    coverSummary: "Area profiles compare inventory depth, median price, source coverage, and leading models by district.",
    metrics: [
      { label: "District profiles", value: fmtCount(districts.length) },
      { label: "Total listings", value: fmtCount(districts.reduce((sum, district) => sum + district.listing_count, 0)) },
      { label: "Highest supply", value: districts[0]?.district || "N/A" },
      { label: "Source depth", value: fmtCount(Math.max(0, ...districts.map((district) => district.source_count))) },
    ],
    table: {
      title: "District Profiles",
      columns: ["District", "Listings", "Median", "Range", "Top Model", "Sources"],
      rows: districts.map((district) => [
        district.district,
        district.listing_count,
        fmtMoney(district.median_price_lkr),
        `${fmtMoney(district.min_price_lkr)} - ${fmtMoney(district.max_price_lkr)}`,
        `${district.top_make || ""} ${district.top_model || ""}`.trim(),
        district.source_count,
      ]),
    },
  };
}

function DetailDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: ProDetailPayload | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useAppPreferences();
  const chartData = useMemo(() => trendRows(detail?.trend_points || []), [detail]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto rounded-2xl border-border bg-surface-1 text-foreground">
        {detail ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-title2 font-semibold tracking-normal">{detail.title}</DialogTitle>
              <DialogDescription className="text-footnote leading-relaxed text-label-2">{detail.summary}</DialogDescription>
            </DialogHeader>

            <ExportButtons report={detailReport(detail)} />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {detail.metrics.map((metric) => (
                <div key={metric.label} className="rounded-control border border-border bg-surface-2 p-4">
                  <p className="text-caption font-semibold uppercase tracking-caps text-label-2">{metric.label}</p>
                  <p className="mt-2 text-title3 font-semibold text-foreground num">{metric.value}</p>
                  {metric.detail && <p className="mt-1 text-caption text-label-2">{metric.detail}</p>}
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <section className="rounded-control border border-border bg-surface-2 p-4">
                <h3 className="text-caption font-semibold uppercase tracking-caps text-label-2">{t("proDash.trendDetail", "Trend Detail")}</h3>
                <div className="mt-4 h-72">
                  {chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} unit="M" />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                          formatter={(value: number, name: string) => [formatLkrCompact(Number(value) * 1_000_000), name]}
                        />
                        <Line type="monotone" dataKey="median" name="Median" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
                        <Line type="monotone" dataKey="avg" name="Average" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border text-footnote text-label-2">
                      {t("proDash.trendHistoryIsNotDeep", "Trend history is not deep enough for this selection yet.")}
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-3 rounded-control border border-border bg-surface-2 p-4">
                <h3 className="text-caption font-semibold uppercase tracking-caps text-label-2">{t("proDash.mix", "Mix")}</h3>
                {[...detail.source_mix, ...detail.district_mix].slice(0, 8).map((row) => (
                  <div key={`${row.label}-${row.count}`} className="rounded-control border border-border bg-surface-1 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-footnote font-semibold text-foreground">{row.label}</p>
                      <p className="text-caption font-semibold text-primary">{row.share_pct.toFixed(1)}%</p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, row.share_pct)}%` }} />
                    </div>
                  </div>
                ))}
              </section>
            </div>

            <section>
              <h3 className="mb-3 text-caption font-semibold uppercase tracking-caps text-label-2">{t("proDash.sampleListings", "Sample Listings")}</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {detail.sample_listings.map((listing) => (
                  <Link
                    key={listing.id}
                    to={`/listing/${listing.id}`}
                    className="rounded-control border border-border bg-surface-2 p-4 no-underline transition-colors hover:border-primary/25"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-footnote font-semibold text-foreground">{listing.title}</p>
                        <p className="mt-1 text-caption font-semibold uppercase tracking-caps text-label-2">
                          {listing.district || "Sri Lanka"} · {listing.source}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <p className="text-footnote font-semibold text-primary num">{fmtMoney(listing.price_lkr)}</p>
                        <VelocityBadge firstSeenAt={listing.first_seen_at ?? null} lastSeenAt={listing.last_seen_at ?? null} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="space-y-3 p-4">
            <DialogHeader>
              <DialogTitle className="text-title3 font-semibold tracking-normal">{t("proDash.loadingDetail", "Loading detail")}</DialogTitle>
              <DialogDescription className="text-footnote text-label-2">{t("proDash.preparingTheSelectedProIntelligence", "Preparing the selected Pro intelligence view.")}</DialogDescription>
            </DialogHeader>
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ProDashboard() {
  const { user, logout, hasProAccess } = useAuth();
  const { t } = useAppPreferences();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [snapshot, setSnapshot] = useState<ProMarketSnapshot | null>(null);
  const [lanes, setLanes] = useState<ProVehicleLane[]>([]);
  const [districts, setDistricts] = useState<ProDistrictProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [laneSearch, setLaneSearch] = useState("");
  const [laneDistrictFilter, setLaneDistrictFilter] = useState("all");
  const [laneSourceFilter, setLaneSourceFilter] = useState("all");
  const [laneFocus, setLaneFocus] = useState<LaneFocus>("all");
  const [detail, setDetail] = useState<ProDetailPayload | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [trendLaneKey, setTrendLaneKey] = useState("");
  const [trendDetail, setTrendDetail] = useState<ProDetailPayload | null>(null);
  const [reportScope, setReportScope] = useState<ReportScope>("market");
  const [reportFormat, setReportFormat] = useState<ProExportFormat>("pdf");
  const [reportTheme, setReportTheme] = useState<ProReportTheme>("executive-dark");
  const [reportSections, setReportSections] = useState<ProReportSectionId[]>([
    "metrics",
    "breakdowns",
    "trends",
    "listings",
    "table",
    "filters",
    "disclaimer",
  ]);
  const [reportVehicleKey, setReportVehicleKey] = useState("");
  const [reportDistrict, setReportDistrict] = useState("");
  const [reportSource, setReportSource] = useState("");
  const [reportTitle, setReportTitle] = useState("");
  const [reportSubtitle, setReportSubtitle] = useState("");
  const [reportPreparedFor, setReportPreparedFor] = useState("");
  const [reportNotes, setReportNotes] = useState("");
  const [reportListingLimit, setReportListingLimit] = useState(12);
  const [buildingReport, setBuildingReport] = useState(false);
  const [arbitrageLaneKey, setArbitrageLaneKey] = useState("");
  const [arbitrageGaps, setArbitrageGaps] = useState<ProArbitrageGap[]>([]);
  const [loadingArbitrage, setLoadingArbitrage] = useState(false);
  const [eraData, setEraData] = useState<ImportEraSplitData | null>(null);
  const [loadingEra, setLoadingEra] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setError(null);
    // Each panel settles independently. A single failed request (the market
    // snapshot is by far the heaviest of the three) must not discard the lanes
    // and districts that did load — otherwise one 5xx blanks the whole workspace
    // and every metric reads zero with "Generated pending".
    const [snapshotResult, lanesResult, districtsResult] = await Promise.allSettled([
      getProMarketSnapshot(),
      getProVehicleLanes({ limit: 80 }),
      getProDistricts(),
    ]);

    let loaded = 0;
    if (snapshotResult.status === "fulfilled") {
      setSnapshot(snapshotResult.value);
      loaded += 1;
    }
    if (lanesResult.status === "fulfilled") {
      const nextLanes = lanesResult.value;
      setLanes(nextLanes);
      setTrendLaneKey((current) => current || (nextLanes[0] ? `${nextLanes[0].make}|||${nextLanes[0].model}` : ""));
      loaded += 1;
    }
    if (districtsResult.status === "fulfilled") {
      setDistricts(districtsResult.value);
      loaded += 1;
    }

    // Only a total failure is a workspace-level error. When at least one panel
    // loaded, keep it on screen; the panels that failed render their own empty
    // state and the user can retry, instead of the whole command center reading
    // as zeroed-out and "Generated pending".
    if (loaded === 0) {
      setError(t("pro.loadError", "Unable to load the Pro workspace. Refresh or check the API connection."));
    }

    setLoading(false);
    setRefreshing(false);
  }, [t]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!trendLaneKey) {
      setTrendDetail(null);
      return;
    }
    const [make, model] = trendLaneKey.split("|||");
    if (!make || !model) return;

    let cancelled = false;
    getProVehicleLaneDetail({ make, model })
      .then((next) => {
        if (!cancelled) setTrendDetail(next);
      })
      .catch(() => {
        if (!cancelled) setTrendDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [trendLaneKey]);

  useEffect(() => {
    setReportVehicleKey((current) => current || (lanes[0] ? `${lanes[0].make}|||${lanes[0].model}` : ""));
    setReportDistrict((current) => current || districts[0]?.district || "");
    setReportSource((current) => current || snapshot?.source_coverage?.[0]?.label || "");
    setArbitrageLaneKey((current) => current || (lanes[0] ? `${lanes[0].make}|||${lanes[0].model}` : ""));
  }, [districts, lanes, snapshot]);

  useEffect(() => {
    if (!arbitrageLaneKey) {
      setArbitrageGaps([]);
      return;
    }
    const [make, model] = arbitrageLaneKey.split("|||");
    if (!make || !model) return;

    let cancelled = false;
    setLoadingArbitrage(true);
    getProArbitrageGaps(make, model)
      .then((gaps) => {
        if (!cancelled) setArbitrageGaps(gaps);
      })
      .catch(() => {
        if (!cancelled) setArbitrageGaps([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingArbitrage(false);
      });
    return () => {
      cancelled = true;
    };
  }, [arbitrageLaneKey]);

  useEffect(() => {
    if (activeTab !== "trends" || eraData) return;
    let cancelled = false;
    setLoadingEra(true);
    getImportEraSplit()
      .then((data) => { if (!cancelled) setEraData(data); })
      .catch(() => { if (!cancelled) setEraData(null); })
      .finally(() => { if (!cancelled) setLoadingEra(false); });
    return () => { cancelled = true; };
  }, [activeTab, eraData]);

  const filteredLanes = useMemo(() => {
    const query = laneSearch.trim().toLowerCase();
    return lanes.filter((lane) => {
      const searchable = `${lane.make} ${lane.model} ${lane.top_district || ""} ${lane.top_source || ""}`.toLowerCase();
      if (query && !searchable.includes(query)) return false;
      if (laneDistrictFilter !== "all" && lane.top_district !== laneDistrictFilter) return false;
      if (laneSourceFilter !== "all" && lane.top_source !== laneSourceFilter) return false;
      if (laneFocus === "hot" && (lane.avg_deal_score || 0) < 80) return false;
      if (laneFocus === "coverage" && lane.source_count < 2) return false;
      if (laneFocus === "fresh" && !lane.latest_seen_at) return false;
      return true;
    });
  }, [laneDistrictFilter, laneFocus, laneSearch, laneSourceFilter, lanes]);

  const openVehicleDetail = async (lane: ProVehicleLane) => {
    setDetail(null);
    setDetailOpen(true);
    try {
      setDetail(await getProVehicleLaneDetail({
        make: lane.make,
        model: lane.model,
        district: laneDistrictFilter !== "all" ? laneDistrictFilter : undefined,
      }));
    } catch {
      toast.error("Unable to load vehicle detail");
      setDetailOpen(false);
    }
  };

  const openDistrictDetail = async (district: string) => {
    setDetail(null);
    setDetailOpen(true);
    try {
      setDetail(await getProDistrictDetail(district));
    } catch {
      toast.error("Unable to load district detail");
      setDetailOpen(false);
    }
  };

  const openSourceDetail = (source: ProBreakdownPoint) => {
    if (!snapshot) return;
    setDetail({
      kind: "source",
      title: `${source.label} source detail`,
      summary: `${source.count.toLocaleString()} priced listings and ${source.share_pct.toFixed(1)}% coverage share.`,
      generated_at: new Date().toISOString(),
      metrics: [
        { label: "Listings", value: source.count.toLocaleString() },
        { label: "Coverage", value: `${source.share_pct.toFixed(1)}%` },
        { label: "Average", value: fmtMoney(source.avg_price_lkr) },
        { label: "Latest", value: fmtDate(source.latest_seen_at) },
      ],
      source_mix: snapshot.source_coverage,
      district_mix: [],
      trend_points: [],
      sample_listings: snapshot.top_opportunities.filter((item) => item.source.toLowerCase() === source.label.toLowerCase()),
    });
    setDetailOpen(true);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadWorkspace();
  };

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const resetLaneFilters = () => {
    setLaneSearch("");
    setLaneDistrictFilter("all");
    setLaneSourceFilter("all");
    setLaneFocus("all");
  };

  const toggleReportSection = (section: ProReportSectionId, checked: boolean) => {
    setReportSections((current) => {
      if (checked) return Array.from(new Set([...current, section]));
      return current.filter((item) => item !== section);
    });
  };

  const buildCustomReportPayload = async (): Promise<ProReportPayload> => {
    let base: ProReportPayload;
    let target = "All tracked market data";

    if (reportScope === "market") {
      base = marketReport(snapshot, lanes, districts);
    } else if (reportScope === "vehicle") {
      const laneKey = reportVehicleKey || (lanes[0] ? `${lanes[0].make}|||${lanes[0].model}` : "");
      const [make, model] = laneKey.split("|||");
      if (!make || !model) throw new Error("Select a vehicle lane before generating this report.");
      target = `${make} ${model}`;
      base = detailReport(await getProVehicleLaneDetail({ make, model }));
    } else if (reportScope === "district") {
      const district = reportDistrict || districts[0]?.district;
      if (!district) throw new Error("Select an area before generating this report.");
      target = district;
      base = detailReport(await getProDistrictDetail(district));
    } else if (reportScope === "source") {
      if (!snapshot) throw new Error("Source coverage is still loading.");
      const source = snapshot.source_coverage.find((item) => item.label === reportSource) || snapshot.source_coverage[0];
      if (!source) throw new Error("Select a source before generating this report.");
      target = source.label;
      base = sourceReport(snapshot, source);
    } else if (reportScope === "lanes_table") {
      const tableRows = filteredLanes.length ? filteredLanes : lanes;
      target = "Current vehicle lane table";
      base = lanesTableReport(tableRows);
    } else {
      target = "District opportunity table";
      base = districtsTableReport(districts);
    }

    const scopeLabel = REPORT_SCOPE_OPTIONS.find((item) => item.value === reportScope)?.label || "Custom report";
    return customizeProReport(
      {
        ...base,
        filters: {
          ...base.filters,
          scope: scopeLabel,
          target,
          theme: REPORT_THEME_OPTIONS.find((item) => item.value === reportTheme)?.label || reportTheme,
          listing_limit: reportListingLimit,
        },
      },
      {
        title: reportTitle,
        subtitle: reportSubtitle,
        preparedFor: reportPreparedFor,
        notes: reportNotes,
        coverSummary: reportNotes || base.coverSummary || `${scopeLabel} prepared from the current Motormila Pro workspace.`,
        theme: reportTheme,
        sections: reportSections,
        listingLimit: reportListingLimit,
        includeFilters: reportSections.includes("filters"),
        includeDisclaimer: reportSections.includes("disclaimer"),
      },
    );
  };

  const runCustomReport = async () => {
    setBuildingReport(true);
    try {
      const report = await buildCustomReportPayload();
      await exportReport(report, reportFormat);
      toast.success(`${reportFormat.toUpperCase()} custom report started`);
    } catch (error) {
      toast.error("Custom report failed", {
        description: error instanceof Error ? error.message : "Unable to create this report.",
      });
    } finally {
      setBuildingReport(false);
    }
  };

  const activeMarketReport = useMemo(() => marketReport(snapshot, lanes, districts), [districts, lanes, snapshot]);
  const trendChart = useMemo(() => trendRows(trendDetail?.trend_points || []), [trendDetail]);
  const laneDistrictOptions = useMemo(
    () => Array.from(new Set(lanes.map((lane) => lane.top_district).filter(Boolean) as string[])).sort(),
    [lanes],
  );
  const laneSourceOptions = useMemo(
    () => Array.from(new Set(lanes.map((lane) => lane.top_source).filter(Boolean) as string[])).sort(),
    [lanes],
  );
  const customReportTargetLabel = useMemo(() => {
    if (reportScope === "vehicle") {
      const [make, model] = reportVehicleKey.split("|||");
      return make && model ? `${make} ${model}` : "Select vehicle";
    }
    if (reportScope === "district") return reportDistrict || "Select area";
    if (reportScope === "source") return reportSource || "Select source";
    if (reportScope === "lanes_table") return `${fmtCount(filteredLanes.length || lanes.length)} vehicle rows`;
    if (reportScope === "districts_table") return `${fmtCount(districts.length)} area rows`;
    return "Full market";
  }, [districts.length, filteredLanes.length, lanes.length, reportDistrict, reportScope, reportSource, reportVehicleKey]);

  // Trial gate (B2-D): free visitors see 1 lane sharp, the rest blurred + locked.
  const displayLanes = hasProAccess ? filteredLanes : filteredLanes.slice(0, 1);
  const teaserLanes = hasProAccess ? [] : filteredLanes.slice(1, 3);
  const lockedLaneCount = Math.max(0, filteredLanes.length - displayLanes.length);

  const runLanePack = async (format: LanePackFormat) => {
    try {
      await exportLanePack(
        {
          lanes: displayLanes,
          gaps: arbitrageGaps,
          comps: snapshot?.top_opportunities || [],
          watermark: !hasProAccess,
          laneLabel: "vehicle lanes",
        },
        format,
      );
      toast.success(`${format.toUpperCase()} lane pack started`);
    } catch (error) {
      toast.error("Lane pack failed", {
        description: error instanceof Error ? error.message : "Unable to create this pack.",
      });
    }
  };



  // The header leads with one figure: hot deals when the snapshot has any,
  // else the priced-listing depth. The overview strip shows the other three,
  // so no number appears twice.
  const heroKind: "hot" | "listings" | null = snapshot
    ? (snapshot.hot_deal_count ?? 0) > 0
      ? "hot"
      : (snapshot.total_listings ?? 0) > 0
        ? "listings"
        : null
    : null;
  const pricedStat = {
    label: t("pro.metric.pricedListings", "Priced Listings"),
    value: fmtCount(snapshot?.total_listings),
    numeric: snapshot?.total_listings,
    detail: t("pro.metric.pricedListingsDetail", "Non-outlier market depth"),
  };
  const hotStat = {
    label: t("pro.metric.hotDeals", "Hot Deals"),
    value: fmtCount(snapshot?.hot_deal_count),
    numeric: snapshot?.hot_deal_count,
    detail: t("pro.metric.hotDealsDetail", "Deal score qualified"),
  };
  const heroStat = heroKind === "hot" ? hotStat : heroKind === "listings" ? pricedStat : null;
  const stripStats = [
    heroKind === "hot" ? pricedStat : hotStat,
    {
      label: t("pro.metric.medianPrice", "Median Price"),
      value: fmtMoney(snapshot?.median_price_lkr),
      numeric: null,
      detail: t("pro.metric.medianPriceDetail", "Current market center"),
    },
    {
      label: t("pro.metric.new7Days", "New 7 Days"),
      value: fmtCount(snapshot?.new_listings_7d),
      numeric: snapshot?.new_listings_7d,
      detail: t("pro.metric.new7DaysDetail", "Fresh supply signal"),
    },
  ];

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={containerVariants}
      className="relative min-h-screen bg-background"
    >
      {/* Workspace bar: the ink of the header below it, so the two read as one stage. */}
      <div className="cine-topbar theme-dark sticky top-0 z-50 text-foreground">
        <div className="mx-auto flex min-h-14 max-w-[1320px] items-center justify-between gap-4 px-5 py-2 sm:px-6">
          <Link to="/" className="flex min-w-0 shrink-0 items-center gap-2 no-underline">
            <img src="/logo.png" alt="Motormila" className="h-7 w-7 rounded-full ring-1 ring-border" />
            <div>
              <p className="text-footnote font-semibold text-white">Motormila</p>
              <p className="whitespace-nowrap text-caption font-medium text-white/60">{t("pro.workspace", "Pro Workspace")}</p>
            </div>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleRefresh} disabled={refreshing || loading}>
              <RefreshCw className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden /> {t("common.refresh", "Refresh")}
            </Button>
            <Badge variant="info" className="hidden sm:inline-flex">
              <Crown aria-hidden /> {user?.plan || "pro"}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              aria-label={t("nav.signOut", "Sign out")}
              className="text-white/70 hover:text-deal-high-text"
            >
              <LogOut aria-hidden /> <span className="hidden sm:inline">{t("nav.signOut", "Sign out")}</span>
            </Button>
          </div>
        </div>
      </div>

      <CineHeader
        className="[--nav-offset:0px]"
        eyebrow={t("pro.eyebrow", "Professional intelligence")}
        lead={t("pro.title", "Pro dashboard.")}
        body={t("pro.description", "The entire Sri Lankan market as a live terminal — priced inventory, lane-level trends, cross-district arbitrage, and board-ready exports in one workspace.")}
      >
        <div className="min-h-[5.5rem]" aria-live="polite">
          {loading ? (
            <div className="space-y-3" aria-hidden>
              <Skeleton shape="text" className="h-3 w-40 bg-foreground/10" />
              <Skeleton shape="text" className="h-10 w-48 bg-foreground/10" />
            </div>
          ) : heroStat ? (
            <CineFigure
              label={heroStat.label}
              value={
                <>
                  <span className="sr-only">{heroStat.value}</span>
                  <span aria-hidden>
                    <AnimatedNumber value={heroStat.numeric ?? 0} locales="en-US" format={{ maximumFractionDigits: 0 }} />
                  </span>
                </>
              }
              caption={heroStat.detail}
            />
          ) : null}
        </div>
        <div className="mt-6 flex flex-col gap-4 border-t border-foreground/10 pt-5 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-footnote text-white/65">
            <span className="font-semibold text-white/85">{t("pro.dataFreshness", "Data freshness")}</span>{" "}
            {snapshot?.last_updated ? (
              <span className="content-in font-semibold tabular-nums text-white">{formatRelativeTime(snapshot.last_updated)}</span>
            ) : loading ? null : (
              <span className="text-white/50">—</span>
            )}
            <span aria-hidden className="mx-2 text-white/30">·</span>
            {t("pro.generated", "Generated {date}", { date: snapshot ? fmtDate(snapshot.generated_at) : t("pro.pending", "pending") })}
          </p>
          <ExportButtons report={activeMarketReport} />
        </div>
      </CineHeader>

      <main className="layout-shell relative z-10 space-y-10 pb-12 pt-6 lg:pt-8">
        {error && (
          <Card padding="none">
            <ErrorState body={error} onRetry={handleRefresh} className="py-8" />
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as WorkspaceTab)} className="space-y-10">
          {/* Canonical workspace-mode switcher: one segmented control for all 6 modes */}
          <TabsList
            aria-label={t("pro.modeAria", "Pro workspace mode")}
            className="grid h-auto w-full grid-cols-3 gap-1 rounded-card border border-border bg-surface-2 p-1 md:inline-flex md:w-auto md:rounded-full"
          >
            {TAB_CONFIG.map(({ id, labelKey, fallback, icon: Icon }) => (
              <TabsTrigger key={id} value={id} onClick={() => setActiveTab(id)} className="h-9 px-2 sm:px-4">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {t(labelKey, fallback)}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="space-y-12">
            <CineSection index="01" id="pro-glance" title={t("proDash.cine.glanceTitle", "Market at a glance")}>
              {loading ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}
                </div>
              ) : (
                <dl className="grid divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  {stripStats.map((stat) => (
                    <StatCell key={stat.label} label={stat.label} value={stat.value} numeric={stat.numeric} compact detail={stat.detail} />
                  ))}
                </dl>
              )}
            </CineSection>

            <div className="grid gap-12 xl:grid-cols-[1.1fr_0.9fr] xl:gap-10">
              <CineSection index="02" id="pro-opps" title={t("pro.topOpportunities", "Top opportunities")}>
                {loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <Skeleton key={index} className="h-[58px] rounded-xl" />
                    ))}
                  </div>
                ) : (snapshot?.top_opportunities?.length ?? 0) === 0 ? (
                  <EmptyState icon={Database} title={t("proDash.topOpportunitiesWillSurfaceOnce", "Top opportunities will surface once the market snapshot loads.")} className="rounded-card border border-dashed border-border" />
                ) : (
                  <ul className="cine-list border-y border-border">
                    {(snapshot?.top_opportunities || []).slice(0, 8).map((listing, i) => (
                      <li key={listing.id}>
                        <Link to={`/listing/${listing.id}`} className="cine-row group items-center">
                          <span className="w-6 shrink-0 font-display text-caption font-semibold tabular-nums text-primary">{String(i + 1).padStart(2, "0")}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-footnote font-semibold text-foreground transition-colors duration-short group-hover:text-primary">
                              {listing.make} {listing.model} {listing.year || ""}
                            </span>
                            <span className="mt-0.5 block truncate text-caption text-label-2">
                              {listing.district || "Sri Lanka"} · {listing.source}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="cine-card__price block text-footnote text-foreground">{fmtMoney(listing.price_lkr)}</span>
                            <span className="block text-caption font-semibold text-label-2">Score {listing.deal_score?.toFixed(1) || "N/A"}</span>
                            <VelocityBadge
                              firstSeenAt={listing.first_seen_at ?? null}
                              lastSeenAt={listing.last_seen_at ?? null}
                              className="mt-1"
                            />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CineSection>

              <CineSection index="03" id="pro-sources-mix" title={t("proDash.sourceMix", "Source mix")}>
                <div className="cine-panel cine-chart theme-dark h-80 p-4 text-foreground sm:p-5">
                  {loading ? (
                    <Skeleton className="h-full w-full rounded-control bg-foreground/10" />
                  ) : (snapshot?.source_coverage?.length ?? 0) === 0 ? (
                    <EmptyState icon={BarChart3} title={t("proDash.sourceCoverageWillPopulateOnce", "Source coverage will populate once the snapshot reloads.")} className="flex h-full flex-col justify-center py-8" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={snapshot?.source_coverage || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="label" interval={0} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis
                          width={40}
                          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${v}`)}
                          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: "hsl(var(--foreground))" }} />
                        <Bar dataKey="count" fill="hsl(213 100% 64%)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CineSection>
            </div>
          </TabsContent>

          <TabsContent value="vehicles" className="space-y-12">
            <CineSection index="01" id="pro-lanes" title={t("proDash.makeAndModelLanes", "Make and model lanes")}>
              <div className="grid w-full gap-2 md:grid-cols-[1.2fr_0.9fr_0.9fr_0.9fr]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-label-2" />
                  <Input
                    value={laneSearch}
                    onChange={(event) => setLaneSearch(event.target.value)}
                    placeholder={t("proDash.searchLanes", "Search lanes")}
                    className="w-full pl-10"
                  />
                </div>
                <Select value={laneDistrictFilter} onValueChange={setLaneDistrictFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("proDash.district", "District")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("proDash.allDistricts", "All districts")}</SelectItem>
                    {laneDistrictOptions.map((district) => (
                      <SelectItem key={district} value={district}>{district}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={laneSourceFilter} onValueChange={setLaneSourceFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("proDash.source", "Source")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("proDash.allSources", "All sources")}</SelectItem>
                    {laneSourceOptions.map((source) => (
                      <SelectItem key={source} value={source}>{source}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={laneFocus} onValueChange={(value) => setLaneFocus(value as LaneFocus)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("proDash.focus", "Focus")} />
                  </SelectTrigger>
                  <SelectContent>
                    {LANE_FOCUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-caption font-semibold text-label-2">
                  {hasProAccess
                    ? t("pro.mode.lanesInFocus", "{count} lanes in focus", { count: filteredLanes.length.toLocaleString() })
                    : `${t("pro.trialOneLane", "Trial: 1 lane visible")}${lockedLaneCount > 0 ? ` · ${t("pro.lockedCount", "{count} locked", { count: String(lockedLaneCount) })}` : ""}`}
                </span>
                <span className="flex-1" />
                <Button type="button" variant="secondary" size="sm" onClick={() => runLanePack("csv")} disabled={loading || displayLanes.length === 0}>
                  <Download aria-hidden />
                  {t("proDash.lanePackCsv", "Lane pack CSV")}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => runLanePack("pdf")} disabled={loading || displayLanes.length === 0}>
                  <Download aria-hidden />
                  {t("proDash.lanePackPdf", "Lane pack PDF")}
                </Button>
              </div>
              <div className="mt-4">
                {!loading && filteredLanes.length === 0 ? (
                  <EmptyState
                    icon={Search}
                    title={t("proDash.noVehicleLanesMatchThis", "No vehicle lanes match this filter.")}
                    className="rounded-card border border-dashed border-border"
                    action={
                      <Button type="button" variant="secondary" size="sm" onClick={resetLaneFilters}>
                        <RotateCcw aria-hidden="true" />
                        {t("proDash.resetFilters", "Reset filters")}
                      </Button>
                    }
                  />
                ) : (
                  <div className="cine-panel theme-dark p-1.5 text-foreground sm:p-3">
                    <TableContainer className="max-h-[40rem] border-0 bg-transparent shadow-none">
                      <Table className="min-w-[53.75rem]">
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            {["Vehicle", "Listings", "Median", "Range", "Avg Deal", "Districts", "Source"].map((heading, i) => (
                              <TableHead key={heading} numeric={i >= 1 && i <= 4}>{heading}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loading
                            ? Array.from({ length: 8 }).map((_, index) => (
                                <TableRow key={`lane-skeleton-${index}`}>
                                  {Array.from({ length: 7 }).map((__, cell) => (
                                    <TableCell key={cell}>
                                      <Skeleton shape="text" className="bg-foreground/10" />
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))
                            : displayLanes.map((lane) => (
                                <TableRow key={`${lane.make}-${lane.model}`}>
                                  <TableCell>
                                    <button
                                      type="button"
                                      onClick={() => openVehicleDetail(lane)}
                                      className="rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                      <span className="block font-semibold text-foreground hover:text-primary">{lane.make} {lane.model}</span>
                                      <span className="block text-caption text-label-2">Latest {fmtDate(lane.latest_seen_at)}</span>
                                    </button>
                                  </TableCell>
                                  <TableCell numeric>{lane.listing_count.toLocaleString()}</TableCell>
                                  <TableCell numeric className="font-medium text-primary">{fmtMoney(lane.median_price_lkr)}</TableCell>
                                  <TableCell numeric className="text-label-2">{fmtMoney(lane.min_price_lkr)} – {fmtMoney(lane.max_price_lkr)}</TableCell>
                                  <TableCell numeric>{lane.avg_deal_score?.toFixed(1) || "N/A"}</TableCell>
                                  <TableCell className="text-label-2">{lane.top_district || "N/A"} · {lane.district_count}</TableCell>
                                  <TableCell className="text-label-2">{lane.top_source || "N/A"}</TableCell>
                                </TableRow>
                              ))}
                          {teaserLanes.map((lane) => (
                            <TableRow key={`locked-${lane.make}-${lane.model}`} aria-hidden="true" className="select-none blur-sm hover:bg-transparent">
                              <TableCell className="font-semibold">{lane.make} {lane.model}</TableCell>
                              <TableCell numeric>{lane.listing_count.toLocaleString()}</TableCell>
                              <TableCell numeric className="text-primary">{fmtMoney(lane.median_price_lkr)}</TableCell>
                              <TableCell numeric className="text-label-2">{fmtMoney(lane.min_price_lkr)} – {fmtMoney(lane.max_price_lkr)}</TableCell>
                              <TableCell numeric>{lane.avg_deal_score?.toFixed(1) || "N/A"}</TableCell>
                              <TableCell className="text-label-2">{lane.top_district || "N/A"} · {lane.district_count}</TableCell>
                              <TableCell className="text-label-2">{lane.top_source || "N/A"}</TableCell>
                            </TableRow>
                          ))}
                          {lockedLaneCount > 0 && (
                            <TableRow className="bg-primary/10 hover:bg-primary/10">
                              <TableCell colSpan={7} className="text-center text-footnote font-semibold">
                                <Link to="/pricing" className="text-primary no-underline hover:underline">
                                  {lockedLaneCount} more lane{lockedLaneCount === 1 ? "" : "s"} locked — start a 7-day free trial to unlock
                                </Link>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </div>
                )}
              </div>
            </CineSection>
          </TabsContent>

          <TabsContent value="areas" className="space-y-12">
            <CineSection index="01" id="pro-districts" title={t("proDash.districtProfiles", "District profiles")}>
              {loading ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-[188px] rounded-xl" />
                  ))}
                </div>
              ) : districts.length === 0 ? (
                <EmptyState icon={MapPin} title={t("proDash.districtProfilesWillReturnOnce", "District profiles will return once the snapshot reloads.")} className="rounded-card border border-dashed border-border" />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {districts.map((district, i) => (
                    <button
                      key={district.district}
                      type="button"
                      onClick={() => openDistrictDetail(district.district)}
                      className="group flex h-full flex-col justify-between gap-4 rounded-card border border-border bg-card p-4 sm:gap-5 sm:p-5 text-left transition-[border-color,box-shadow] duration-medium ease-decelerate hover:border-primary/30 hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-caption font-semibold tabular-nums text-primary">{String(i + 1).padStart(2, "0")}</span>
                          <span className="mt-1 block text-callout font-semibold text-foreground transition-colors duration-short group-hover:text-primary">{district.district}</span>
                          <span className="mt-0.5 block text-caption text-label-2">
                            {district.source_count} sources · latest {fmtDate(district.latest_seen_at)}
                          </span>
                        </span>
                        <MapPin aria-hidden className="mt-1 h-4 w-4 shrink-0 text-label-2 group-hover:text-primary" />
                      </span>
                      <span className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                        <span>
                          <span className="block text-caption text-label-2">{t("proDash.listings", "Listings")}</span>
                          <span className="cine-card__price mt-1 block text-title3 text-foreground">{fmtCount(district.listing_count)}</span>
                        </span>
                        <span>
                          <span className="block text-caption text-label-2">{t("proDash.median", "Median")}</span>
                          <span className="cine-card__price mt-1 block text-title3 text-primary">{fmtMoney(district.median_price_lkr)}</span>
                        </span>
                      </span>
                      <span className="block text-footnote text-label-2">
                        Top model: <span className="font-semibold text-foreground">{district.top_make} {district.top_model}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CineSection>

            <CineSection
              index="02"
              id="pro-arbitrage"
              title={t("proDash.arbitrageGaps", "Arbitrage gaps")}
              body={t("proDash.crossDistrictScanner", "Cross-district scanner")}
              actions={
                <Select value={arbitrageLaneKey} onValueChange={setArbitrageLaneKey}>
                  <SelectTrigger className="w-full sm:w-[260px]">
                    <SelectValue placeholder={t("proDash.selectVehicle", "Select vehicle")} />
                  </SelectTrigger>
                  <SelectContent>
                    {lanes.slice(0, 80).map((lane) => (
                      <SelectItem key={`${lane.make}|||${lane.model}`} value={`${lane.make}|||${lane.model}`}>
                        {lane.make} {lane.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            >
              {loadingArbitrage ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-14 rounded-xl" />
                  ))}
                </div>
              ) : arbitrageGaps.length === 0 ? (
                <EmptyState icon={ArrowRightLeft} title={arbitrageLaneKey
                      ? "Not enough district data for this vehicle to compute gaps."
                      : "Select a vehicle to scan for cross-district price gaps."} className="rounded-card border border-dashed border-border" />
              ) : (
                <ArbitrageTable gaps={arbitrageGaps} visibleLimit={hasProAccess ? undefined : 3} />
              )}
            </CineSection>
          </TabsContent>

          <TabsContent value="trends" className="space-y-12">
            <CineSection
              index="01"
              id="pro-trend"
              title={t("proDash.selectedLanePriceHistory", "Selected lane price history")}
              body={t("proDash.trendStudio", "Trend studio")}
              actions={
                <Select value={trendLaneKey} onValueChange={setTrendLaneKey}>
                  <SelectTrigger className="w-full sm:w-[320px]">
                    <SelectValue placeholder={t("proDash.selectVehicleLane", "Select vehicle lane")} />
                  </SelectTrigger>
                  <SelectContent>
                    {lanes.slice(0, 60).map((lane) => (
                      <SelectItem key={`${lane.make}|||${lane.model}`} value={`${lane.make}|||${lane.model}`}>
                        {lane.make} {lane.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            >
              <div className="cine-panel cine-chart theme-dark p-5 text-foreground sm:p-6">
                <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-title3 font-semibold text-white">{trendDetail?.title || "Select a vehicle lane"}</h3>
                    <p className="mt-1 text-footnote text-white/65">{trendDetail?.summary || "Trend depth appears here once a lane is selected."}</p>
                  </div>
                  {trendDetail && <ExportButtons report={detailReport(trendDetail)} />}
                </div>
                <div className="h-[320px] sm:h-[400px]">
                  {loading ? (
                    <Skeleton className="h-full w-full rounded-control bg-foreground/10" />
                  ) : trendChart.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis width={44} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} unit="M" />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: "hsl(var(--foreground))" }} />
                        <Line type="monotone" dataKey="median" stroke="hsl(213 100% 64%)" strokeWidth={2.5} dot={false} name="Median" />
                        <Line type="monotone" dataKey="avg" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} strokeDasharray="4 3" name="Average" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState icon={TrendingUp} title={t("proDash.noTrendDataAvailableFor", "No trend data available for this lane yet.")} className="flex h-full flex-col justify-center py-8" />
                  )}
                </div>
              </div>
            </CineSection>

            {/* Import-era depreciation cohort split */}
            <CineSection
              index="02"
              id="pro-era"
              title={t("proDash.preFreezeVsPostFreeze", "Pre-freeze vs post-freeze cohorts")}
              body={t("proDash.importEraMarket", "Import-era market")}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-deal-caution/20 bg-deal-caution/10 px-2.5 py-1 text-caption font-semibold text-deal-caution-text">
                    Pre-freeze ≤2024
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-caption font-semibold text-primary">
                    Post-freeze ≥2025
                  </span>
                </div>
              }
            >
              <div className="cine-panel cine-chart theme-dark p-5 text-foreground sm:p-6" aria-label={t("proDash.importEraSplitChart", "Import era split chart")} role="group">
                <p className="mb-5 max-w-3xl text-footnote leading-relaxed text-white/65">
                  Median asking price comparison per make between pre-2025 import cohort (older stock, higher supply) and
                  post-2025 cohort (restricted imports, supply premium). Only priced, non-outlier listings with a known
                  manufacture year are included.
                </p>
                <div className="h-[300px] sm:h-[340px]">
                  {loadingEra ? (
                    <Skeleton className="h-full w-full rounded-control bg-foreground/10" />
                  ) : (eraData?.makes?.length ?? 0) === 0 ? (
                    <EmptyState icon={TrendingUp} title={t("proDash.importEraSplitDataIs", "Import-era split data is not yet available.")} className="flex h-full flex-col justify-center py-8" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={(eraData?.makes ?? []).map((row) => ({
                          make: row.make,
                          pre: row.pre_freeze.median_price_lkr !== null ? row.pre_freeze.median_price_lkr / 1_000_000 : null,
                          post: row.post_freeze.median_price_lkr !== null ? row.post_freeze.median_price_lkr / 1_000_000 : null,
                          preCount: row.pre_freeze.count,
                          postCount: row.post_freeze.count,
                        }))}
                        margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="make" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis width={44} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} unit="M" />
                        <Tooltip
                          cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                          contentStyle={CHART_TOOLTIP_STYLE}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                          formatter={(value: unknown, name: string, props: { payload?: Record<string, unknown> }) => {
                            const numVal = typeof value === "number" ? value : null;
                            const isPost = name === "post";
                            const count = isPost ? (props.payload?.postCount ?? 0) : (props.payload?.preCount ?? 0);
                            const label = isPost ? "Post-freeze ≥2025" : "Pre-freeze ≤2024";
                            return [numVal !== null ? `${formatLkrCompact(numVal * 1_000_000)} (${count} listings)` : "—", label];
                          }}
                        />
                        <Bar dataKey="pre" name="Pre-freeze ≤2024" fill="hsl(var(--deal-amber))" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="post" name="Post-freeze ≥2025" fill="hsl(var(--signal-cyan))" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                {(eraData?.makes?.length ?? 0) > 0 && (
                  <TableContainer className="mt-5 border-0 bg-transparent shadow-none" aria-label={t("proDash.importEraSplitTable", "Import era split table")}>
                    <Table className="min-w-[36.25rem] [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                      <TableHeader className="bg-transparent">
                        <TableRow className="hover:bg-transparent">
                          {["Make", "Pre-freeze count", "Pre-freeze median", "Post-freeze count", "Post-freeze median", "Premium"].map((h, i) => (
                            <TableHead key={h} numeric={i > 0}>{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(eraData?.makes ?? []).map((row) => {
                          const preMed = row.pre_freeze.median_price_lkr;
                          const postMed = row.post_freeze.median_price_lkr;
                          const premium = preMed && postMed ? ((postMed - preMed) / preMed) * 100 : null;
                          return (
                            <TableRow key={row.make}>
                              <TableCell className="font-semibold">{row.make}</TableCell>
                              <TableCell numeric className="text-label-2">{row.pre_freeze.count.toLocaleString()}</TableCell>
                              <TableCell numeric>{preMed !== null ? fmtMoney(preMed) : "—"}</TableCell>
                              <TableCell numeric className="text-label-2">{row.post_freeze.count.toLocaleString()}</TableCell>
                              <TableCell numeric>{postMed !== null ? fmtMoney(postMed) : "—"}</TableCell>
                              <TableCell numeric className={`font-semibold ${premium === null ? "text-label-2" : premium >= 0 ? "text-primary" : "text-deal-caution-text"}`}>
                                {premium !== null ? `${premium >= 0 ? "+" : ""}${premium.toFixed(1)}%` : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </div>
            </CineSection>
          </TabsContent>

          <TabsContent value="sources" className="space-y-12">
            <CineSection
              index="01"
              id="pro-source-coverage"
              title={t("proDash.sourceCoverageAndFreshness", "Source coverage and freshness")}
              body={t("pro.mode.liveSources", "{count} live sources", { count: String(snapshot?.source_count || 0) })}
            >
              {loading ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-[150px] rounded-xl" />
                  ))}
                </div>
              ) : (snapshot?.source_coverage?.length ?? 0) === 0 ? (
                <EmptyState icon={Database} title={t("proDash.sourceCoverageWillReturnOnce", "Source coverage will return once the snapshot reloads.")} className="rounded-card border border-dashed border-border" />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(snapshot?.source_coverage || []).map((source, i) => (
                    <button
                      key={source.label}
                      type="button"
                      onClick={() => openSourceDetail(source)}
                      className="group flex h-full flex-col justify-between gap-5 rounded-card border border-border bg-card p-5 text-left transition-[border-color,box-shadow] duration-medium ease-decelerate hover:border-primary/30 hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex items-start justify-between gap-4">
                        <span className="min-w-0">
                          <span className="block text-caption font-semibold tabular-nums text-primary">{String(i + 1).padStart(2, "0")}</span>
                          <span className="mt-1 block text-callout font-semibold text-foreground transition-colors duration-short group-hover:text-primary">{source.label}</span>
                          <span className="mt-0.5 block text-caption text-label-2">Latest {fmtDate(source.latest_seen_at)}</span>
                        </span>
                        <Database aria-hidden className="mt-1 h-4 w-4 shrink-0 text-label-2 group-hover:text-primary" />
                      </span>
                      <span className="block">
                        <span className="cine-card__price block text-title1 leading-none text-foreground">{source.count.toLocaleString()}</span>
                        <span className="cine-bar mt-3" aria-hidden>
                          <span className="cine-bar__reveal" style={{ "--i": i } as CSSProperties}>
                            <span style={{ "--w": Math.min(1, Math.max(0, source.share_pct / 100)) } as CSSProperties} />
                          </span>
                        </span>
                        <span className="mt-2 block text-caption font-semibold text-label-2">{source.share_pct.toFixed(1)}% of priced coverage · {fmtMoney(source.avg_price_lkr)} avg</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CineSection>
            <CineSection index="02" id="pro-source-quality" title={t("proDash.sourceQualityScorecard", "Source quality scorecard")} body={t("proDash.qualityMetrics", "Quality metrics")}>
              <SourceQualityScorecard />
            </CineSection>
          </TabsContent>

          <TabsContent value="reports" className="space-y-12">
            <CineSection
              index="01"
              id="pro-report-studio"
              title={t("proDash.buildACustomProReport", "Build a custom Pro report")}
              body={t("proDash.reportStudio", "Report studio")}
              actions={
                <Button type="button" onClick={runCustomReport} disabled={loading} loading={buildingReport}>
                  <Download aria-hidden />
                  {t("proDash.downloadCustomReport", "Download Custom Report")}
                </Button>
              }
            >
              <div className="overflow-hidden rounded-card border border-border bg-card">
                <div className="grid gap-0 xl:grid-cols-[1.05fr_0.95fr]">
                  <div className="border-b border-border p-5 sm:p-6 xl:border-b-0 xl:border-r">
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <p className="cine-eyebrow text-primary">{t("proDash.customScope", "Custom scope")}</p>
                        <h3 className="mt-2 text-title3 font-semibold text-foreground">{t("proDash.reportComposer", "Report composer")}</h3>
                      </div>
                      <Settings2 aria-hidden className="h-5 w-5 text-label-2" />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-caption font-semibold text-label-2">{t("proDash.reportScope", "Report scope")}</label>
                        <Select value={reportScope} onValueChange={(value) => setReportScope(value as ReportScope)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {REPORT_SCOPE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-caption font-semibold text-label-2">{t("proDash.target", "Target")}</label>
                        {reportScope === "vehicle" ? (
                          <Select value={reportVehicleKey} onValueChange={setReportVehicleKey}>
                            <SelectTrigger>
                              <SelectValue placeholder={t("proDash.selectVehicle", "Select vehicle")} />
                            </SelectTrigger>
                            <SelectContent>
                              {lanes.slice(0, 120).map((lane) => (
                                <SelectItem key={`${lane.make}|||${lane.model}`} value={`${lane.make}|||${lane.model}`}>
                                  {lane.make} {lane.model}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : reportScope === "district" ? (
                          <Select value={reportDistrict} onValueChange={setReportDistrict}>
                            <SelectTrigger>
                              <SelectValue placeholder={t("proDash.selectArea", "Select area")} />
                            </SelectTrigger>
                            <SelectContent>
                              {districts.map((district) => (
                                <SelectItem key={district.district} value={district.district}>{district.district}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : reportScope === "source" ? (
                          <Select value={reportSource} onValueChange={setReportSource}>
                            <SelectTrigger>
                              <SelectValue placeholder={t("proDash.selectSource", "Select source")} />
                            </SelectTrigger>
                            <SelectContent>
                              {(snapshot?.source_coverage || []).map((source) => (
                                <SelectItem key={source.label} value={source.label}>{source.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="flex h-10 items-center rounded-control border border-border bg-surface-2 px-3.5 text-body font-semibold text-foreground">
                            {customReportTargetLabel}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-caption font-semibold text-label-2">{t("proDash.format", "Format")}</label>
                        <Select value={reportFormat} onValueChange={(value) => setReportFormat(value as ProExportFormat)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EXPORT_FORMATS.map((item) => (
                              <SelectItem key={item.format} value={item.format}>{item.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-caption font-semibold text-label-2">{t("proDash.designStyle", "Design style")}</label>
                        <Select value={reportTheme} onValueChange={(value) => setReportTheme(value as ProReportTheme)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {REPORT_THEME_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label htmlFor="report-title" className="text-caption font-semibold text-label-2">{t("proDash.customTitle", "Custom title")}</label>
                        <Input
                          id="report-title"
                          value={reportTitle}
                          onChange={(event) => setReportTitle(event.target.value)}
                          placeholder={t("proDash.motormilaProMarketBrief", "Motormila Pro market brief")}
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="report-prepared-for" className="text-caption font-semibold text-label-2">{t("proDash.preparedFor", "Prepared for")}</label>
                        <Input
                          id="report-prepared-for"
                          value={reportPreparedFor}
                          onChange={(event) => setReportPreparedFor(event.target.value)}
                          placeholder={t("proDash.dealerLenderClientBoard", "Dealer, lender, client, board")}
                        />
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <label htmlFor="report-subtitle" className="text-caption font-semibold text-label-2">{t("proDash.subtitle", "Subtitle")}</label>
                      <Input
                        id="report-subtitle"
                        value={reportSubtitle}
                        onChange={(event) => setReportSubtitle(event.target.value)}
                        placeholder={t("proDash.professionalSriLankaVehicleMarket", "Professional Sri Lanka vehicle market intelligence")}
                      />
                    </div>

                    <div className="mt-4 space-y-2">
                      <label htmlFor="report-notes" className="text-caption font-semibold text-label-2">{t("proDash.analystNote", "Analyst note")}</label>
                      <Textarea
                        id="report-notes"
                        value={reportNotes}
                        onChange={(event) => setReportNotes(event.target.value)}
                        placeholder={t("proDash.optionalContextOrRecommendationTo", "Optional context or recommendation to place on the report cover")}
                        className="h-auto min-h-24"
                      />
                    </div>
                  </div>

                  <div className="p-5 sm:p-6">
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <p className="cine-eyebrow text-primary">{t("proDash.contents", "Contents")}</p>
                        <h3 className="mt-2 text-title3 font-semibold text-foreground">{t("proDash.chooseSections", "Choose sections")}</h3>
                      </div>
                      <SlidersHorizontal aria-hidden className="h-5 w-5 text-label-2" />
                    </div>

                    <ul className="cine-list border-y border-border">
                      {REPORT_SECTION_OPTIONS.map((section) => {
                        const checked = reportSections.includes(section.id);
                        return (
                          <li key={section.id}>
                            <label className="flex cursor-pointer items-start gap-3 py-3">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) => toggleReportSection(section.id, Boolean(value))}
                                className="mt-0.5 border-input data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                              />
                              <span className="min-w-0">
                                <span className={`block text-footnote font-semibold ${checked ? "text-foreground" : "text-label-2"}`}>{section.label}</span>
                                <span className="mt-0.5 block text-caption leading-5 text-label-2">{section.detail}</span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="mt-5 grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
                      <div className="space-y-2">
                        <label htmlFor="report-listing-limit" className="text-caption font-semibold text-label-2">{t("proDash.listingRows", "Listing rows")}</label>
                        <Input
                          id="report-listing-limit"
                          type="number"
                          min={1}
                          max={80}
                          value={reportListingLimit}
                          onChange={(event) => setReportListingLimit(Number(event.target.value) || 1)}
                        />
                      </div>

                      <div className="cine-panel theme-dark p-4 text-foreground">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-caption font-semibold text-white/55">{t("proDash.preview", "Preview")}</p>
                            <p className="mt-1 truncate text-callout font-semibold text-white">{customReportTargetLabel}</p>
                          </div>
                          <Palette aria-hidden className="h-5 w-5 shrink-0 text-white/55" />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {reportSections.slice(0, 7).map((section) => (
                            <span key={section} className="inline-flex items-center gap-1 rounded-full border border-foreground/10 px-2 py-0.5 text-caption font-semibold text-white/80">
                              <CheckCircle2 aria-hidden className="h-3 w-3 text-[hsl(213_100%_70%)]" />
                              {REPORT_SECTION_OPTIONS.find((item) => item.id === section)?.label || section}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CineSection>

            <CineSection index="02" id="pro-quick-packs" title={t("proDash.downloadProfessionalPacks", "Download professional packs")} body={t("proDash.quickPacks", "Quick packs")}>
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {[
                  {
                    title: "Executive market pack",
                    detail: "KPIs, source coverage, opportunities, and lane table.",
                    icon: FileBarChart,
                    report: activeMarketReport,
                  },
                  {
                    title: "Vehicle lane table",
                    detail: "All make/model lanes with counts, median, range, and coverage.",
                    icon: TableProperties,
                    report: lanesTableReport(lanes),
                  },
                  {
                    title: "District opportunity pack",
                    detail: "Area price bands, top models, sample listings, and source mix.",
                    icon: FileSpreadsheet,
                    report: districtsTableReport(districts),
                  },
                ].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.title} className="flex h-full list-none flex-col justify-between gap-5 rounded-card border border-border bg-card p-5">
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-caption font-semibold tabular-nums text-primary">{String(i + 1).padStart(2, "0")}</span>
                          <Icon aria-hidden className="h-4 w-4 text-label-2" />
                        </div>
                        <h3 className="mt-3 text-callout font-semibold text-foreground">{item.title}</h3>
                        <p className="mt-1 text-footnote text-label-2">{item.detail}</p>
                      </div>
                      <ExportButtons report={item.report} />
                    </li>
                  );
                })}
              </ul>
            </CineSection>
          </TabsContent>
        </Tabs>

        <footer className="flex flex-col gap-3 border-t border-border pt-6 text-caption text-label-2 md:flex-row md:items-center md:justify-between">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck aria-hidden className="h-4 w-4" />
            {t("proDash.proDataIsAggregatedFrom", "Pro data is aggregated from public Sri Lanka vehicle marketplaces for commercial analysis.")}
          </span>
          <span>{user?.email}</span>
        </footer>
      </main>

      <DetailDialog detail={detail} open={detailOpen} onOpenChange={setDetailOpen} />
    </motion.div>
  );
}
