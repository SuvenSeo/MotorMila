import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, BarChart3, Bell, ChevronDown, ShieldCheck, Upload } from "lucide-react";
import {
  benchmarkDealerUrls,
  claimDealerProfile,
  formatPrice,
  getDashboardInsights,
  getDealerProfile,
  getDistrictPrices,
  getProMarketSnapshot,
  getStats,
  getStoredDealerClaimToken,
  storeDealerClaimToken,
  type DealerClaimProfile,
} from "@/services/api";
import type { UrlBenchmarkResult } from "@/services/api";
import { getStoredAuthToken } from "@/lib/authToken";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import {
  freePlanText,
  hasFullPlatformAccess,
} from "@/lib/planLimits";
import type { ProMarketSnapshot } from "@/types/pro";
import { fadeIn, spring, usePrefersReducedMotionOrLowData } from "@/lib/motion";
import { PageCanvas } from "@/components/PageCanvas";
import { PageBody } from "@/components/PageBody";
import { CineHeader } from "@/components/CineHeader";
import { CineFigure, CineSection } from "@/components/CineSection";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PLAN_PRICES, formatLkr } from "@/lib/pricingContent";
import { FreePlanBanner } from "@/components/FreePlanBanner";
import { ProFeatureLock } from "@/components/ProFeatureLock";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import {
  buildDealerNotifications,
  buildDistrictDemandRows,
  buildDistrictPriceGaps,
  buildTurnoverSeries,
} from "@/lib/dealerDashboardData";
import { DEALER_PLAYBOOK, DEALER_QUICK_TOOLS } from "@/lib/dealerPlaybook";
import { trackEvent } from "@/lib/analytics";

type WidgetKey = "turnover" | "priceGap" | "districtDemand" | "inventoryBenchmark";

/** Recharts tooltip on the dark chart panels (tokens resolve inside .theme-dark). */
const TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: "12px",
  color: "hsl(var(--foreground))",
} as const;

const TOOLTIP_LABEL_STYLE = { color: "hsl(var(--muted-foreground))" } as const;

/** One blue for every plot on the dark panels (matches the Pro workspace). */
const CHART_BLUE = "hsl(213 100% 64%)";

/** Section anchors for the segmented jump bar. */
const SECTION_IDS = {
  glance: "dealer-glance",
  yard: "dealer-yard",
  analytics: "dealer-analytics",
  playbook: "dealer-playbook",
  plans: "dealer-plans",
} as const;

/** "1,234" that rolls on change; plain text stays for screen readers (and tests). */
function Num({ value }: { value: number }) {
  return (
    <>
      <span className="sr-only">{value.toLocaleString()}</span>
      <span aria-hidden>
        <AnimatedNumber value={value} />
      </span>
    </>
  );
}

/** A dark instrument panel (both themes) with a collapsible body. */
function WidgetShell({
  title,
  subtitle,
  collapsed,
  onToggle,
  loading,
  error,
  onRetry,
  emptyMessage,
  className,
  children,
}: {
  title: string;
  subtitle: string;
  collapsed: boolean;
  onToggle: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyMessage?: string;
  className?: string;
  children: ReactNode;
}) {
  const calm = usePrefersReducedMotionOrLowData();
  return (
    <div className={`cine-panel cine-chart theme-dark p-4 text-foreground sm:p-6 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display text-callout font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-footnote text-label-2">{subtitle}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onToggle}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          aria-expanded={!collapsed}
          className="shrink-0"
        >
          <m.span animate={{ rotate: collapsed ? 0 : 180 }} transition={calm ? { duration: 0 } : spring.snappy} className="inline-flex">
            <ChevronDown aria-hidden />
          </m.span>
        </Button>
      </div>
      {!collapsed && (
        <div className="mt-4 border-t border-border pt-4">
          {loading ? (
            <Skeleton shape="chart" className="h-[13rem] bg-foreground/10" />
          ) : error ? (
            <ErrorState body={error} onRetry={onRetry} className="py-8" />
          ) : emptyMessage ? (
            <EmptyState icon={BarChart3} title={emptyMessage} className="py-8" />
          ) : (
            <div className="content-in">{children}</div>
          )}
        </div>
      )}
    </div>
  );
}

function gapTone(pct: number | null): string {
  if (pct === null) return "text-label-2";
  if (pct <= -5) return "text-deal-good-text";
  if (pct >= 5) return "text-deal-high-text";
  return "text-deal-caution-text";
}

/** One cell of the at-a-glance strip: label, big figure, quiet detail. */
function GlanceCell({ label, children, detail, detailTone = "text-label-2", loading }: { label: string; children: ReactNode; detail?: ReactNode; detailTone?: string; loading?: boolean }) {
  return (
    <div className="min-w-0 py-4 sm:px-6 sm:first:pl-0">
      <dt className="text-caption font-medium text-label-2">{label}</dt>
      <dd className="mt-2">
        {loading ? <Skeleton className="h-8 w-20" /> : <span className="content-in cine-card__price block text-title1 leading-none text-foreground">{children}</span>}
      </dd>
      {detail ? <dd className={`mt-2 text-footnote font-medium ${detailTone}`}>{detail}</dd> : null}
    </div>
  );
}

function ClaimYardCard() {
  const { t } = useAppPreferences();
  const [profile, setProfile] = useState<DealerClaimProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [pattern, setPattern] = useState("");
  const [claimedUrl, setClaimedUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredDealerClaimToken();
    if (!token) return;
    void getDealerProfile(token)
      .then((data) => {
        setProfile(data);
        setDisplayName(data.display_name);
        setPattern(data.seller_name_pattern || "");
        setClaimedUrl(data.claimed_url || "");
        setPhone(data.contact_phone || "");
      })
      .catch(() => {
        storeDealerClaimToken(null);
      });
  }, []);

  const handleClaim = async () => {
    if (!displayName.trim()) {
      setError(t("dealer.yardRequired", "Yard / seller name is required."));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await claimDealerProfile({
        display_name: displayName.trim(),
        seller_name_pattern: pattern.trim() || undefined,
        claimed_url: claimedUrl.trim() || undefined,
        contact_phone: phone.trim() || undefined,
        claim_token: getStoredDealerClaimToken() || undefined,
      });
      storeDealerClaimToken(data.claim_token);
      setProfile(data);
      trackEvent("dealer_claim_success", { status: data.status });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dealer.claimFailed", "Claim failed"));
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { id: "dealer-name", label: t("dealerDash.yardName", "Yard / brand name"), value: displayName, set: setDisplayName, placeholder: "Colombo Auto Hub" },
    { id: "dealer-pattern", label: t("dealerDash.sellerName", "Seller name on ads"), value: pattern, set: setPattern, placeholder: "Auto Hub LK" },
    { id: "dealer-url", label: t("dealerDash.yardUrl", "Listing / yard URL"), value: claimedUrl, set: setClaimedUrl, placeholder: "https://ikman.lk/en/shops/...", inputMode: "url" as const },
    { id: "dealer-phone", label: t("dealerDash.phone", "WhatsApp / phone"), value: phone, set: setPhone, placeholder: "0771234567", inputMode: "tel" as const },
  ];

  return (
    <div className="grid gap-8 rounded-card border border-border bg-card p-5 sm:p-7 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-12">
      <div className="min-w-0">
        <p className="cine-eyebrow text-primary">{t("dealer.claimYard", "Claim your yard")}</p>
        <h3 className="mt-3 font-display text-title3 font-semibold text-foreground">{t("dealer.profile", "Dealer profile")}</h3>
        <p className="mt-2 text-footnote leading-relaxed text-label-2 [text-wrap:pretty]">
          {t("dealer.claimHint", "Claim a seller name so Motormila can match your live inventory and show pricing vs market.")}
        </p>
        {profile && (
          <div className="content-in mt-4 flex flex-wrap items-center gap-2">
            {profile.status === "verified" && (
              <Badge variant="success">
                <ShieldCheck aria-hidden />
                {t("dealer.verified", "Verified dealer")}
              </Badge>
            )}
            <Badge variant="neutral">
              {profile.status} · {profile.matched_listings} matched
              {profile.subscription_status && profile.subscription_status !== "none"
                ? ` · ${profile.plan || "dealer"}/${profile.subscription_status}`
                : ""}
            </Badge>
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.id} className="min-w-0 space-y-2">
              <Label htmlFor={f.id}>{f.label}</Label>
              <Input id={f.id} value={f.value} onChange={(e) => f.set(e.target.value)} placeholder={f.placeholder} inputMode={f.inputMode} />
            </div>
          ))}
        </div>
        {error && <p role="alert" className="content-in mt-3 text-footnote font-medium text-deal-high-text">{error}</p>}
        <div className="mt-5 border-t border-border pt-5">
          <Button type="button" onClick={() => void handleClaim()} loading={saving}>
            {profile ? t("dealer.updateClaim", "Update claim") : t("dealer.claimProfile", "Claim profile")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function InventoryBenchmark() {
  const { t } = useAppPreferences();
  const [urlsText, setUrlsText] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UrlBenchmarkResult[] | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    const urls = urlsText.split("\n").map((u) => u.trim()).filter(Boolean);
    if (!urls.length) return;
    setLoading(true);
    setSubmitError(null);
    setResults(null);
    try {
      const data = await benchmarkDealerUrls(urls);
      setResults(data);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t("dealerDash.requestFailed", "Request failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setUrlsText("");
    setResults(null);
    setSubmitError(null);
    textareaRef.current?.focus();
  };

  const urlCount = urlsText.split("\n").filter((l) => l.trim()).length;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="benchmark-urls">
          {t("dealerDash.listingUrls", "Listing URLs")} <span className="font-normal text-label-2">{t("dealerDash.onePerLineMax50", "(one per line, max 50)")}</span>
        </Label>
        <Textarea
          id="benchmark-urls"
          ref={textareaRef}
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          placeholder={"https://ikman.lk/en/ad/toyota-vitz-2018-for-sale-...\nhttps://riyasewana.com/listing/..."}
          rows={5}
          className="resize-none font-code text-footnote"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-footnote font-medium tabular-nums text-label-2">
            {urlCount > 0 ? t("dealer.cine.urlCount", "URLs: {n}", { n: String(urlCount) }) : t("dealer.pasteUrls", "Paste URLs above")}
          </span>
          <div className="flex items-center gap-2">
            {(results !== null || urlsText) && (
              <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
                {t("dealer.cine.clear", "Clear")}
              </Button>
            )}
            <Button type="button" size="sm" onClick={() => void handleSubmit()} disabled={!urlCount} loading={loading}>
              <Upload aria-hidden />
              {t("dealer.cine.runBenchmark", "Benchmark")}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton shape="row" className="h-10 bg-foreground/10" />
          <Skeleton shape="row" className="h-12 bg-foreground/10" />
          <Skeleton shape="row" className="h-12 bg-foreground/10" />
        </div>
      ) : null}

      {submitError && (
        <div role="alert" className="content-in rounded-control border border-deal-high/30 bg-deal-high/10 px-3 py-2.5 text-footnote font-medium text-deal-high-text">
          {submitError}
        </div>
      )}

      {results !== null && results.length > 0 && (
        <TableContainer className="content-in">
          <Table className="min-w-[37.5rem]">
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>{t("dealerDash.vehicle", "Vehicle")}</TableHead>
                <TableHead numeric>{t("dealerDash.listingPrice", "Listing price")}</TableHead>
                <TableHead numeric>{t("dealerDash.marketMedian", "Market median")}</TableHead>
                <TableHead numeric>{t("dealerDash.gap", "Gap")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((row, idx) => (
                <TableRow key={row.url + String(idx)}>
                  <TableCell className="max-w-[11.25rem]">
                    <a href={row.url} target="_blank" rel="noopener noreferrer" className="block truncate font-medium text-primary hover:underline" title={row.url}>
                      {row.url.replace(/^https?:\/\//, "").slice(0, 45)}
                      {row.url.length > 50 ? "…" : ""}
                    </a>
                    {row.error && <span className="mt-0.5 block text-caption text-deal-high-text">{row.error}</span>}
                  </TableCell>
                  <TableCell className="font-medium">
                    {row.make ? (
                      <span>
                        {row.make}
                        {row.model ? ` ${row.model}` : ""}
                        {row.year ? ` (${row.year})` : ""}
                      </span>
                    ) : (
                      <span className="text-label-3">—</span>
                    )}
                  </TableCell>
                  <TableCell numeric className="whitespace-nowrap font-medium">
                    {row.listing_price != null ? formatPrice(row.listing_price) : <span className="text-label-3">—</span>}
                  </TableCell>
                  <TableCell numeric className="whitespace-nowrap font-medium">
                    {row.market_median != null ? (
                      <span title={`${row.comparable_count} comparables`}>
                        {formatPrice(row.market_median)}
                        <span className="ml-1 text-caption text-label-2">({row.comparable_count})</span>
                      </span>
                    ) : (
                      <span className="text-label-3">—</span>
                    )}
                  </TableCell>
                  <TableCell numeric className={`whitespace-nowrap font-semibold ${gapTone(row.price_gap_pct)}`}>
                    {row.price_gap_pct != null ? (
                      `${row.price_gap_pct > 0 ? "+" : ""}${row.price_gap_pct.toFixed(1)}%`
                    ) : (
                      <span className="font-normal text-label-3">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {results !== null && results.length === 0 && (
        <EmptyState icon={Upload} title={t("dealer.noResults", "No results returned.")} className="py-8" />
      )}
    </div>
  );
}

export default function DealerDashboard() {
  const { t } = useAppPreferences();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  const [collapsed, setCollapsed] = useState<Record<WidgetKey, boolean>>({ turnover: false, priceGap: false, districtDemand: false, inventoryBenchmark: false });
  const [notifIdx, setNotifIdx] = useState(0);
  const hasAuthToken = Boolean(getStoredAuthToken());

  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: getStats, retry: 1 });
  const insightsQuery = useQuery({ queryKey: ["dealer-insights"], queryFn: getDashboardInsights, retry: 1 });
  const districtsQuery = useQuery({ queryKey: ["dealer-district-prices"], queryFn: getDistrictPrices, retry: 1 });
  const proSnapshotQuery = useQuery({
    queryKey: ["dealer-pro-snapshot"],
    queryFn: getProMarketSnapshot,
    retry: false,
    enabled: hasAuthToken,
  });

  const stats = statsQuery.data ?? null;
  const insights = insightsQuery.data ?? null;
  const districts = useMemo(() => districtsQuery.data ?? [], [districtsQuery.data]);
  const proSnapshot: ProMarketSnapshot | null = proSnapshotQuery.isSuccess ? proSnapshotQuery.data : null;

  const turnoverData = useMemo(() => buildTurnoverSeries(insights), [insights]);
  const priceGaps = useMemo(() => buildDistrictPriceGaps(districts), [districts]);
  const isMobile = useIsMobile();
  const districtDemand = useMemo(() => buildDistrictDemandRows(districts), [districts]);
  const notifications = useMemo(() => buildDealerNotifications(insights, stats, t), [insights, stats, t]);

  const metrics = useMemo(() => {
    const liveLeads = insights?.new_listings_24h ?? stats?.listings_this_week ?? proSnapshot?.new_listings_7d ?? null;
    const arbitrageAlerts = proSnapshot?.hot_deal_count ?? stats?.good_deals_count ?? insights?.hot_deals?.length ?? null;
    const financeReady = insights?.hot_deals?.filter((deal) => deal.deal_score >= 8).length ?? null;
    const topGapDistrict = priceGaps.length
      ? priceGaps.reduce((best, row) => (row.gapPct > best.gapPct ? row : best), priceGaps[0]).district
      : null;

    return [
      {
        label: t("dealerDash.liveLeads", "Live leads"),
        value: liveLeads,
        delta: stats?.listings_this_week ? t("dealerDash.thisWeek", "{n} this week", { n: stats.listings_this_week.toLocaleString() }) : t("dealerDash.syncingFeed", "Syncing market feed"),
        tone: liveLeads != null ? "text-deal-good-text" : "text-label-2",
      },
      {
        label: t("dealerDash.arbitrageAlerts", "Arbitrage alerts"),
        value: arbitrageAlerts,
        delta: topGapDistrict ? t("dealerDash.highestGap", "Highest gap in {district}", { district: topGapDistrict }) : t("dealerDash.scanningSpreads", "Scanning district spreads"),
        tone: "text-label-2",
      },
      {
        label: t("dealerDash.financeReady", "Finance ready"),
        value: financeReady,
        delta: financeReady != null ? t("dealerDash.highDealScore", "High deal-score listings") : t("dealerDash.awaitingSignals", "Awaiting deal signals"),
        tone: "text-label-2",
      },
    ];
  }, [insights, stats, proSnapshot, priceGaps, t]);

  const trustScore = useMemo(() => {
    if (!stats?.total_listings) return null;
    const ratio = stats.good_deals_count / Math.max(stats.total_listings, 1);
    return Math.min(100, Math.round(68 + ratio * 320));
  }, [stats]);

  const dashboardLoading = statsQuery.isPending || insightsQuery.isPending || districtsQuery.isPending;
  const dashboardError =
    statsQuery.isError && insightsQuery.isError && districtsQuery.isError
      ? t("dealer.loadError", "Unable to load dealer intelligence.")
      : null;

  useEffect(() => {
    if (notifications.length <= 1) return undefined;
    const timer = window.setInterval(() => setNotifIdx((i) => (i + 1) % notifications.length), 5500);
    return () => window.clearInterval(timer);
  }, [notifications.length]);

  useEffect(() => {
    setNotifIdx(0);
  }, [notifications]);

  const activeNotif =
    notifications[notifIdx] ??
    notifications[0] ??
    t("dealerDash.notifFallback", "Market intelligence syncs from live listing data when available.");
  const toggle = (k: WidgetKey) => setCollapsed((p) => ({ ...p, [k]: !p[k] }));

  const retryAll = () => {
    void statsQuery.refetch();
    void insightsQuery.refetch();
    void districtsQuery.refetch();
    if (hasAuthToken) void proSnapshotQuery.refetch();
  };

  const [heroMetric, ...glanceMetrics] = metrics;

  const commandStack = [
    { label: t("dealer.turnover", "Inventory Turnover"), meta: turnoverData.length ? t("dealer.meta.models", "{count} models", { count: String(turnoverData.length) }) : null },
    { label: t("dealer.priceGapScanner", "Price Gap Scanner"), meta: priceGaps.length ? t("dealer.meta.districts", "{count} districts", { count: String(priceGaps.length) }) : null },
    { label: t("dealer.districtDemand", "District Demand"), meta: districtDemand.length ? t("dealer.meta.zones", "{count} zones", { count: String(districtDemand.length) }) : null },
    { label: t("dealer.leadNotifications", "Lead Notifications"), meta: notifications.length > 1 ? t("common.live", "Live") : t("dealer.meta.standby", "standby") },
    { label: t("dealer.benchmark", "Inventory Benchmark"), meta: t("dealer.meta.urlUpload", "URL upload") },
  ];

  const sections = [
    { id: SECTION_IDS.glance, label: t("dealer.cine.glance", "At a glance") },
    { id: SECTION_IDS.yard, label: t("dealer.cine.yard", "Your yard") },
    { id: SECTION_IDS.analytics, label: t("dealerDash.analytics", "Analytics") },
    { id: SECTION_IDS.playbook, label: t("dealerDash.playbook", "Playbook") },
    { id: SECTION_IDS.plans, label: t("dealer.plans", "Dealer plans") },
  ];
  const n = (i: number) => String(i + 1).padStart(2, "0");

  return (
    <PageCanvas ambient="none">
      <CineHeader
        eyebrow={t("dealer.eyebrow", "Dealer workspace")}
        lead={t("dealer.cine.lead", "Dealer command")}
        accent={t("dealer.cine.accent", "center.")}
        body={t("dealer.description", "Arbitrage, demand mapping, and lead flow intelligence.")}
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-end lg:gap-10">
          <div className="min-h-[5.5rem]">
            {dashboardLoading ? (
              <div className="space-y-3" aria-hidden>
                <Skeleton shape="text" className="h-3 w-32 bg-foreground/10" />
                <Skeleton shape="text" className="h-10 w-28 bg-foreground/10" />
              </div>
            ) : (
              <CineFigure
                label={heroMetric.label}
                value={heroMetric.value != null ? <Num value={heroMetric.value} /> : <span className="text-white/50">—</span>}
                caption={heroMetric.delta}
              />
            )}
          </div>
          <div className="dealer-notif flex items-start gap-3 rounded-card border border-foreground/10 bg-foreground/[0.03] p-4" aria-live="polite">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-foreground/10 text-[hsl(213_100%_72%)]">
              <Bell className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="dealer-kicker text-white/60">
                {t("dealerDash.leadNotification", "Lead notification")}
              </p>
              <AnimatePresence mode="wait" initial={false}>
                <m.p key={activeNotif} variants={fadeIn} initial="hidden" animate="show" exit="exit" className="mt-1 text-footnote leading-snug text-white">
                  {activeNotif}
                </m.p>
              </AnimatePresence>
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2 border-t border-foreground/10 pt-5">
          <Button asChild variant="secondary" size="sm">
            <Link to="/#market">{t("dealer.openPublicInventory", "Open public inventory")}</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/pricing">{t("dealer.plans", "Dealer plans")}</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/official-pulse">{t("nav.officialPulse", "Official Pulse")}</Link>
          </Button>
        </div>
      </CineHeader>

      <PageBody className="cine-dealer space-y-14 pb-20 pt-6 lg:space-y-20 lg:pt-8">
        <div className="space-y-4">
          <FreePlanBanner />
          {!fullAccess ? (
            <UpgradePrompt title={freePlanText(t, "dealerTitle")} body={freePlanText(t, "dealerBody")} variant="strip" />
          ) : null}
          {dashboardError ? (
            <Card padding="none">
              <ErrorState title={t("dealer.unavailable", "Dealer data unavailable")} body={dashboardError} onRetry={retryAll} className="py-10" />
            </Card>
          ) : null}

          {/* Segmented jump bar: one control for the five sections below. */}
          <nav aria-label={t("dealer.cine.sectionsAria", "Dealer workspace sections")} className="dealer-seg -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <ol className="inline-flex min-w-max gap-1 rounded-full border border-border bg-surface-2 p-1">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="flex h-9 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-footnote font-medium text-label-2 no-underline transition-colors duration-short hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span aria-hidden className="font-display text-caption font-semibold tabular-nums text-primary">{n(i)}</span>
                    {s.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        <CineSection index={n(0)} id={SECTION_IDS.glance} title={t("dealer.cine.glance", "At a glance")}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-12">
            <dl className="grid self-start divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {glanceMetrics.map((metric) => (
                <GlanceCell key={metric.label} label={metric.label} loading={dashboardLoading} detail={metric.delta} detailTone={metric.tone}>
                  {metric.value != null ? <Num value={metric.value} /> : <span className="text-label-3">—</span>}
                </GlanceCell>
              ))}
              <GlanceCell
                label={t("dealer.trustTier", "Trust tier")}
                loading={dashboardLoading}
                detail={
                  trustScore != null ? (
                    <span className="cine-bar mt-1" aria-hidden>
                      <span className="cine-bar__reveal">
                        <span style={{ "--w": trustScore / 100 } as CSSProperties} />
                      </span>
                    </span>
                  ) : (
                    t("dealerDash.trustScoreNeedsListingVolume", "Trust score needs listing volume data.")
                  )
                }
              >
                {trustScore != null ? (
                  <span className="inline-flex items-baseline gap-1">
                    <Num value={trustScore} />
                    <span className="font-sans text-footnote font-medium text-label-2">/100</span>
                  </span>
                ) : (
                  <span className="text-label-3">—</span>
                )}
              </GlanceCell>
            </dl>

            <div className="min-w-0">
              <h3 className="cine-eyebrow text-label-2">{t("dealer.commandStack", "Command stack")}</h3>
              <ul className="cine-list mt-3 border-y border-border" aria-label={t("dealer.commandStack", "Command stack")}>
                {commandStack.map((i) => (
                  <li key={i.label} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 text-footnote text-foreground">{i.label}</span>
                    {dashboardLoading && i.meta === null ? (
                      <Skeleton shape="text" className="h-3 w-14" />
                    ) : (
                      <span className="shrink-0 text-footnote font-medium tabular-nums text-label-2">{i.meta ?? "—"}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CineSection>

        <CineSection index={n(1)} id={SECTION_IDS.yard} title={t("dealer.cine.yard", "Your yard")}>
          <ClaimYardCard />
        </CineSection>

        <CineSection
          index={n(2)}
          id={SECTION_IDS.analytics}
          title={t("dealerDash.inventoryBenchmarkAnalytics", "Inventory & benchmark analytics")}
          body={t("dealerDash.momentumPriceSpreadAndDistrict", "Momentum, price spread, and district demand across your live market feed.")}
        >
          {fullAccess ? (
            <div className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-2">
                <WidgetShell
                  title={t("dealer.turnover", "Inventory Turnover")}
                  subtitle={turnoverData.length ? t("dealerDash.turnoverSub", "Trending model momentum and listing volume") : t("dealerDash.turnoverSubInsights", "Trending model momentum from market insights")}
                  collapsed={collapsed.turnover}
                  onToggle={() => toggle("turnover")}
                  loading={insightsQuery.isPending}
                  error={insightsQuery.isError ? t("dealerDash.turnoverError", "Unable to load turnover insights.") : null}
                  onRetry={() => void insightsQuery.refetch()}
                  emptyMessage={!insightsQuery.isPending && !turnoverData.length ? t("dealerDash.turnoverEmpty", "No trending model data yet.") : undefined}
                >
                  <div className="h-[15rem]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={turnoverData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                        <defs>
                          <linearGradient id="turnoverArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={CHART_BLUE} stopOpacity={0.22} />
                            <stop offset="100%" stopColor={CHART_BLUE} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="week" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                        <Area type="monotone" dataKey="sellThrough" name={t("dealerDash.momentumIndex", "Momentum index")} stroke={CHART_BLUE} fill="url(#turnoverArea)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </WidgetShell>

                <WidgetShell
                  title={t("dealer.priceGaps", "Price Gaps")}
                  subtitle={t("dealerDash.priceGapSub", "District spread vs national median")}
                  collapsed={collapsed.priceGap}
                  onToggle={() => toggle("priceGap")}
                  loading={districtsQuery.isPending}
                  error={districtsQuery.isError ? t("dealerDash.priceGapError", "Unable to load district pricing.") : null}
                  onRetry={() => void districtsQuery.refetch()}
                  emptyMessage={!districtsQuery.isPending && !priceGaps.length ? t("dealerDash.priceGapEmpty", "No district price gaps mapped yet.") : undefined}
                >
                  <div className="h-[15rem]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={priceGaps} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis
                          dataKey="district"
                          interval={0}
                          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                          // Five district names don't fit side by side on a phone; slant them.
                          angle={isMobile ? -35 : 0}
                          textAnchor={isMobile ? "end" : "middle"}
                          height={isMobile ? 56 : 30}
                        />
                        <YAxis width={44} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => [`${v.toFixed(1)}%`, t("dealerDash.gap", "Gap")]} />
                        <Bar dataKey="gapPct" fill={CHART_BLUE} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </WidgetShell>
              </div>

              <WidgetShell
                title={t("dealer.districtDemand", "District Demand")}
                subtitle={t("dealerDash.demandSub", "Supply concentration and average deal floor")}
                collapsed={collapsed.districtDemand}
                onToggle={() => toggle("districtDemand")}
                loading={districtsQuery.isPending}
                error={districtsQuery.isError ? t("dealerDash.demandError", "Unable to load district demand.") : null}
                onRetry={() => void districtsQuery.refetch()}
                emptyMessage={!districtsQuery.isPending && !districtDemand.length ? t("dealerDash.demandEmpty", "No district demand data yet.") : undefined}
              >
                <ul className="dealer-cells">
                  {districtDemand.map((d, i) => (
                    <li key={d.district} className="min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="min-w-0 truncate text-footnote font-semibold text-foreground">{d.district}</p>
                        <span className="shrink-0 whitespace-nowrap text-caption font-semibold tabular-nums text-[hsl(213_100%_72%)]">
                          {t("dealer.cine.demand", "Demand {score}", { score: String(d.demandScore) })}
                        </span>
                      </div>
                      <dl className="mt-3 space-y-1.5 text-footnote">
                        <div className="flex justify-between gap-3">
                          <dt className="shrink-0 text-label-2">{t("dealerDash.topModel", "Top model")}</dt>
                          <dd className="min-w-0 truncate text-right text-foreground">{d.topModel}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="shrink-0 text-label-2">{t("dealerDash.avgPrice", "Avg price")}</dt>
                          <dd className="cine-card__price whitespace-nowrap text-right text-foreground">{d.avgPrice > 0 ? formatPrice(d.avgPrice) : "—"}</dd>
                        </div>
                      </dl>
                      <span className="cine-bar mt-3" aria-hidden>
                        <span className="cine-bar__reveal" style={{ "--i": i } as CSSProperties}>
                          <span style={{ "--w": Math.max(0, Math.min(100, d.demandScore)) / 100 } as CSSProperties} />
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </WidgetShell>

              <div id="benchmark">
                <WidgetShell
                  title={t("dealer.benchmark", "Inventory Benchmark")}
                  subtitle={t("dealer.benchmarkSubtitle", "Paste listing URLs to benchmark against the current market")}
                  collapsed={collapsed.inventoryBenchmark}
                  onToggle={() => toggle("inventoryBenchmark")}
                >
                  <InventoryBenchmark />
                </WidgetShell>
              </div>
            </div>
          ) : (
            <ProFeatureLock label={freePlanText(t, "dealerTitle")} className="min-h-[18rem]">
              <Card padding="lg" className="opacity-80">
                <p className="text-callout font-semibold text-foreground">{t("dealer.turnover", "Inventory Turnover")}</p>
                <p className="mt-2 text-footnote text-label-2">{freePlanText(t, "dealerBody")}</p>
              </Card>
            </ProFeatureLock>
          )}
        </CineSection>

        <CineSection
          index={n(3)}
          id={SECTION_IDS.playbook}
          title={t("dealerDash.whatDealersAndBrokersUse", "What dealers and brokers use this for")}
          body={t("dealerDash.operatorWorkflowsFromStockPricing", "Operator workflows from stock pricing to import duty, alerts, and weekly yard review.")}
        >
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-14">
            <ol className="cine-list border-y border-border" aria-label={t("dealerDash.playbook", "Playbook")}>
              {DEALER_PLAYBOOK.map((item, i) => (
                <li key={item.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 py-5 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
                  <span aria-hidden className="pt-0.5 font-display text-footnote font-semibold tabular-nums text-primary">{n(i)}</span>
                  <div className="min-w-0">
                    <p className="text-caption font-semibold text-label-2">{t(`dealerPlaybook.for.${item.forWhom}`, item.forWhom)}</p>
                    <h3 className="mt-1 text-body font-semibold text-foreground">{t(`dealerPlaybook.${item.id}.title`, item.title)}</h3>
                    <div className="mt-2 grid gap-2 md:grid-cols-2 md:gap-6">
                      <p className="text-footnote leading-relaxed text-label-2">{t(`dealerPlaybook.${item.id}.problem`, item.problem)}</p>
                      <p className="text-footnote leading-relaxed text-label-1">{t(`dealerPlaybook.${item.id}.does`, item.whatMotormilaDoes)}</p>
                    </div>
                    <Link
                      to={item.whereToGo.to}
                      className="group mt-3 inline-flex items-center gap-1.5 text-footnote font-semibold text-primary no-underline hover:underline"
                    >
                      {t(`dealerPlaybook.${item.id}.cta`, item.whereToGo.label)}
                      <ArrowRight aria-hidden className="cine-row__arrow h-3.5 w-3.5 !mt-0" />
                    </Link>
                  </div>
                </li>
              ))}
            </ol>

            <aside className="min-w-0 lg:sticky lg:top-[calc(var(--nav-offset,64px)+1.5rem)] lg:self-start" aria-labelledby="dealer-quick-tools">
              <h3 id="dealer-quick-tools" className="cine-eyebrow text-label-2">{t("dealer.quickTools", "Quick tools")}</h3>
              <ul className="cine-list mt-3 border-y border-border">
                {DEALER_QUICK_TOOLS.map((tool) => (
                  <li key={tool.id}>
                    <Link to={tool.to} className="cine-row group items-center gap-3 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-footnote font-medium text-foreground transition-colors duration-short group-hover:text-primary">{t(`dealerTools.${tool.id}.title`, tool.title)}</span>
                        <span className="mt-0.5 block text-caption text-label-2">{t(`dealerTools.${tool.id}.description`, tool.description)}</span>
                      </span>
                      <ArrowRight aria-hidden className="cine-row__arrow h-4 w-4 !mt-0 text-label-2" />
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </CineSection>

        <CineSection index={n(4)} id={SECTION_IDS.plans} title={t("dealer.plans", "Dealer plans")}>
          <div className="cine-panel theme-dark flex flex-col gap-6 p-6 text-foreground sm:p-8 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 max-w-2xl">
              <p className="cine-eyebrow text-white/60">{t("dealer.plans", "Dealer plans")}</p>
              <h3 className="mt-3 font-display text-title3 font-semibold text-white [text-wrap:balance]">
                {t("acct.dealer.planTitle", "The full dealer workspace is part of the Dealer plans, from {price}/mo", {
                  price: formatLkr(PLAN_PRICES.dealer_starter.monthly),
                })}
              </h3>
              <p className="mt-2 max-w-xl text-footnote leading-relaxed text-white/70">
                {t("dealerDash.keepUsingTheCommandCenter", "Keep using the command center today. Upgrade when you want billed seats, saved yard workflows, and priority market sync.")}
              </p>
            </div>
            <Button asChild className="shrink-0 self-start md:self-auto">
              <Link to="/pricing#for-dealers">
                {t("dealerDash.viewDealerPlans", "View dealer plans")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </CineSection>
      </PageBody>
    </PageCanvas>
  );
}
