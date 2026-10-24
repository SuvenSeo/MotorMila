import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Bell, ChevronDown, ShieldCheck, Upload } from "lucide-react";
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
import { fadeIn, fadeUp, listItem, listStagger, spring, usePrefersReducedMotionOrLowData } from "@/lib/motion";
import { PageCanvas } from "@/components/PageCanvas";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
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

const TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius-control)",
  fontSize: "12px",
  color: "hsl(var(--foreground))",
  boxShadow: "var(--shadow-e2)",
} as const;

const TOOLTIP_LABEL_STYLE = { color: "hsl(var(--muted-foreground))" } as const;

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

function WidgetShell({
  title,
  subtitle,
  collapsed,
  onToggle,
  loading,
  error,
  onRetry,
  emptyMessage,
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
  children: React.ReactNode;
}) {
  const calm = usePrefersReducedMotionOrLowData();
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-callout font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-footnote text-label-2">{subtitle}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onToggle}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          aria-expanded={!collapsed}
        >
          <m.span animate={{ rotate: collapsed ? 0 : 180 }} transition={calm ? { duration: 0 } : spring.snappy} className="inline-flex">
            <ChevronDown aria-hidden />
          </m.span>
        </Button>
      </div>
      {!collapsed && (
        <div className="mt-4 border-t border-separator pt-4">
          {loading ? (
            <Skeleton shape="chart" className="h-[13rem]" />
          ) : error ? (
            <ErrorState body={error} onRetry={onRetry} className="py-8" />
          ) : emptyMessage ? (
            <EmptyState icon={BarChart3} title={emptyMessage} className="py-8" />
          ) : (
            <div className="content-in">{children}</div>
          )}
        </div>
      )}
    </Card>
  );
}

function gapTone(pct: number | null): string {
  if (pct === null) return "text-label-2";
  if (pct <= -5) return "text-deal-good-text";
  if (pct >= 5) return "text-deal-high-text";
  return "text-deal-caution-text";
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
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-footnote font-semibold text-primary">{t("dealer.claimYard", "Claim your yard")}</p>
          <h2 className="mt-1 text-callout font-semibold text-foreground">{t("dealer.profile", "Dealer profile")}</h2>
          <p className="mt-1 max-w-xl text-footnote text-label-2">
            {t("dealer.claimHint", "Claim a seller name so Motormila can match your live inventory and show pricing vs market.")}
          </p>
        </div>
        {profile && (
          <div className="content-in flex flex-wrap items-center gap-2">
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
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((f) => (
          <div key={f.id} className="space-y-2">
            <Label htmlFor={f.id}>{f.label}</Label>
            <Input id={f.id} value={f.value} onChange={(e) => f.set(e.target.value)} placeholder={f.placeholder} inputMode={f.inputMode} />
          </div>
        ))}
      </div>
      {error && <p role="alert" className="content-in mt-3 text-footnote font-medium text-deal-high-text">{error}</p>}
      <Button type="button" className="mt-5" onClick={() => void handleClaim()} loading={saving}>
        {profile ? t("dealer.updateClaim", "Update claim") : t("dealer.claimProfile", "Claim profile")}
      </Button>
    </Card>
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
            {urlCount > 0 ? `${urlCount} URL${urlCount === 1 ? "" : "s"}` : t("dealer.pasteUrls", "Paste URLs above")}
          </span>
          <div className="flex items-center gap-2">
            {(results !== null || urlsText) && (
              <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
                Clear
              </Button>
            )}
            <Button type="button" size="sm" onClick={() => void handleSubmit()} disabled={!urlCount} loading={loading}>
              <Upload aria-hidden />
              Benchmark
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton shape="row" className="h-10" />
          <Skeleton shape="row" className="h-12" />
          <Skeleton shape="row" className="h-12" />
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
                  <TableCell numeric className="font-medium">
                    {row.listing_price != null ? formatPrice(row.listing_price) : <span className="text-label-3">—</span>}
                  </TableCell>
                  <TableCell numeric className="font-medium">
                    {row.market_median != null ? (
                      <span title={`${row.comparable_count} comparables`}>
                        {formatPrice(row.market_median)}
                        <span className="ml-1 text-caption text-label-2">({row.comparable_count})</span>
                      </span>
                    ) : (
                      <span className="text-label-3">—</span>
                    )}
                  </TableCell>
                  <TableCell numeric className={`font-semibold ${gapTone(row.price_gap_pct)}`}>
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

  return (
    <PageCanvas ambient="none">
      <PageHeader
        size="compact"
        eyebrow={t("dealer.eyebrow", "Dealer workspace")}
        eyebrowIcon={BarChart3}
        title={t("dealer.commandCenter", "Dealer command center")}
        description={t("dealer.description", "Arbitrage, demand mapping, and lead flow intelligence.")}
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link to="/#market">{t("dealer.openPublicInventory", "Open public inventory")}</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/pricing">{t("dealer.plans", "Dealer plans")}</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/official-pulse">{t("nav.officialPulse", "Official Pulse")}</Link>
            </Button>
          </>
        }
      />

      <FreePlanBanner />

      <div className="layout-shell pb-20">
        {!fullAccess ? (
          <UpgradePrompt className="mb-6" title={freePlanText(t, "dealerTitle")} body={freePlanText(t, "dealerBody")} variant="strip" />
        ) : null}

        {dashboardError ? (
          <Card padding="none" className="mb-6">
            <ErrorState title={t("dealer.unavailable", "Dealer data unavailable")} body={dashboardError} onRetry={retryAll} className="py-10" />
          </Card>
        ) : null}

        <m.div variants={fadeUp} className="mb-6">
          <ClaimYardCard />
        </m.div>

        <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <m.div variants={fadeUp}>
              <Card padding="sm">
                <h2 className="text-callout font-semibold text-foreground">{t("dealer.commandStack", "Command stack")}</h2>
                <ul className="mt-3 divide-y divide-separator" aria-label={t("dealer.commandStack", "Command stack")}>
                  {[
                    { label: t("dealer.turnover", "Inventory Turnover"), meta: turnoverData.length ? t("dealer.meta.models", "{count} models", { count: String(turnoverData.length) }) : null },
                    { label: t("dealer.priceGapScanner", "Price Gap Scanner"), meta: priceGaps.length ? t("dealer.meta.districts", "{count} districts", { count: String(priceGaps.length) }) : null },
                    { label: t("dealer.districtDemand", "District Demand"), meta: districtDemand.length ? t("dealer.meta.zones", "{count} zones", { count: String(districtDemand.length) }) : null },
                    { label: t("dealer.leadNotifications", "Lead Notifications"), meta: notifications.length > 1 ? t("common.live", "Live") : t("dealer.meta.standby", "standby") },
                    { label: t("dealer.benchmark", "Inventory Benchmark"), meta: t("dealer.meta.urlUpload", "URL upload") },
                  ].map((i) => (
                    <li key={i.label} className="flex items-center justify-between gap-2 py-2.5">
                      <span className="text-footnote text-foreground">{i.label}</span>
                      {dashboardLoading && i.meta === null ? (
                        <Skeleton shape="text" className="h-3 w-14" />
                      ) : (
                        <span className="text-footnote font-medium tabular-nums text-label-2">{i.meta ?? "—"}</span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mb-1 mt-4 text-caption font-semibold uppercase tracking-caps text-label-2">{t("dealer.quickTools", "Quick tools")}</p>
                <ul className="space-y-1">
                  {DEALER_QUICK_TOOLS.map((tool) => (
                    <li key={tool.id}>
                      <Link
                        to={tool.to}
                        className="block rounded-control px-2 py-2 no-underline transition-colors duration-short ease-standard hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="block text-footnote font-medium text-foreground">{t(`dealerTools.${tool.id}.title`, tool.title)}</span>
                        <span className="block text-caption text-label-2">{t(`dealerTools.${tool.id}.description`, tool.description)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </m.div>
            <m.div variants={fadeUp}>
              <Card padding="sm">
                <p className="flex items-center gap-1.5 text-footnote font-semibold text-primary">
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                  {t("dealer.trustTier", "Trust tier")}
                </p>
                {dashboardLoading ? (
                  <Skeleton className="mt-3 h-12 w-full" />
                ) : trustScore != null ? (
                  <div className="content-in">
                    <p className="mt-2 flex items-baseline gap-1">
                      <span className="text-title2 font-semibold text-foreground">
                        <Num value={trustScore} />
                      </span>
                      <span className="text-footnote text-label-2">/100</span>
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <m.div
                        className="h-full origin-left rounded-full bg-primary"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: trustScore / 100 }}
                        transition={spring.smooth}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-footnote text-label-2">{t("dealerDash.trustScoreNeedsListingVolume", "Trust score needs listing volume data.")}</p>
                )}
              </Card>
            </m.div>
          </aside>

          <div className="min-w-0 space-y-6">
            {/* KPI bento: the primary metric spans two columns */}
            <m.div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" variants={listStagger}>
              {metrics.map((metric, idx) => {
                const featured = idx === 0;
                return (
                  <m.div key={metric.label} variants={listItem} custom={idx} className={featured ? "sm:col-span-2" : undefined}>
                    <Card padding={featured ? "md" : "sm"} className="h-full">
                      <p className="text-footnote font-medium text-label-2">{metric.label}</p>
                      {dashboardLoading ? (
                        <Skeleton className={featured ? "mt-3 h-12 w-28" : "mt-3 h-8 w-16"} />
                      ) : (
                        <p className={`content-in mt-2 font-semibold text-foreground ${featured ? "font-display text-large" : "text-title2"}`}>
                          {metric.value != null ? <Num value={metric.value} /> : <span className="text-label-3">—</span>}
                        </p>
                      )}
                      <p className={`mt-1 text-footnote font-medium ${metric.tone}`}>{metric.delta}</p>
                    </Card>
                  </m.div>
                );
              })}
            </m.div>

            <Card padding="sm" className="flex items-start gap-3" aria-live="polite">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
                <Bell className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-footnote font-semibold text-primary">{t("dealerDash.leadNotification", "Lead notification")}</p>
                <AnimatePresence mode="wait" initial={false}>
                  <m.p key={activeNotif} variants={fadeIn} initial="hidden" animate="show" exit="exit" className="mt-0.5 text-footnote text-foreground">
                    {activeNotif}
                  </m.p>
                </AnimatePresence>
              </div>
            </Card>

            <section className="pt-4">
              <p className="text-footnote font-semibold text-primary">{t("dealerDash.playbook", "Playbook")}</p>
              <h2 className="mt-1 font-display text-title2 font-semibold text-foreground">{t("dealerDash.whatDealersAndBrokersUse", "What dealers and brokers use this for")}</h2>
              <p className="mt-1 max-w-2xl text-body text-label-2">{t("dealerDash.operatorWorkflowsFromStockPricing", "Operator workflows from stock pricing to import duty, alerts, and weekly yard review.")}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {DEALER_PLAYBOOK.map((item) => (
                  <Card key={item.id} className="flex flex-col">
                    <p className="text-footnote font-medium text-primary">{t(`dealerPlaybook.for.${item.forWhom}`, item.forWhom)}</p>
                    <h3 className="mt-1 text-body font-semibold text-foreground">{t(`dealerPlaybook.${item.id}.title`, item.title)}</h3>
                    <p className="mt-2 text-footnote text-label-2">{t(`dealerPlaybook.${item.id}.problem`, item.problem)}</p>
                    <p className="mt-2 flex-1 text-footnote text-label-1">{t(`dealerPlaybook.${item.id}.does`, item.whatMotormilaDoes)}</p>
                    <Button asChild variant="tertiary" size="sm" className="-ml-3 mt-3 self-start">
                      <Link to={item.whereToGo.to}>{t(`dealerPlaybook.${item.id}.cta`, item.whereToGo.label)} →</Link>
                    </Button>
                  </Card>
                ))}
              </div>
            </section>

            <section className="pt-4">
              <p className="text-footnote font-semibold text-primary">{t("dealerDash.analytics", "Analytics")}</p>
              <h2 className="mt-1 font-display text-title2 font-semibold text-foreground">{t("dealerDash.inventoryBenchmarkAnalytics", "Inventory & benchmark analytics")}</h2>
              <p className="mb-5 mt-1 max-w-2xl text-body text-label-2">{t("dealerDash.momentumPriceSpreadAndDistrict", "Momentum, price spread, and district demand across your live market feed.")}</p>

              {fullAccess ? (
                <div className="space-y-5">
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
                    <div className="h-[16.25rem]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={turnoverData}>
                          <defs>
                            <linearGradient id="turnoverArea" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="week" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                          <Area type="monotone" dataKey="sellThrough" name={t("dealerDash.momentumIndex", t("dealerDash.momentumIndex", "Momentum index"))} stroke="hsl(var(--primary))" fill="url(#turnoverArea)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </WidgetShell>

                  <WidgetShell
                    title={t("dealer.priceGaps", "Price Gaps")}
                    subtitle={t("dealerDash.priceGapSub", t("dealerDash.priceGapSub", "District spread vs national median"))}
                    collapsed={collapsed.priceGap}
                    onToggle={() => toggle("priceGap")}
                    loading={districtsQuery.isPending}
                    error={districtsQuery.isError ? t("dealerDash.priceGapError", "Unable to load district pricing.") : null}
                    onRetry={() => void districtsQuery.refetch()}
                    emptyMessage={!districtsQuery.isPending && !priceGaps.length ? t("dealerDash.priceGapEmpty", "No district price gaps mapped yet.") : undefined}
                  >
                    <div className="h-[15rem]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={priceGaps}>
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
                          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => [`${v.toFixed(1)}%`, t("dealerDash.gap", "Gap")]} />
                          <Bar dataKey="gapPct" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </WidgetShell>

                  <WidgetShell
                    title={t("dealer.districtDemand", "District Demand")}
                    subtitle={t("dealerDash.demandSub", t("dealerDash.demandSub", "Supply concentration and average deal floor"))}
                    collapsed={collapsed.districtDemand}
                    onToggle={() => toggle("districtDemand")}
                    loading={districtsQuery.isPending}
                    error={districtsQuery.isError ? t("dealerDash.demandError", "Unable to load district demand.") : null}
                    onRetry={() => void districtsQuery.refetch()}
                    emptyMessage={!districtsQuery.isPending && !districtDemand.length ? t("dealerDash.demandEmpty", "No district demand data yet.") : undefined}
                  >
                    <div className="grid gap-2 sm:grid-cols-2">
                      {districtDemand.map((d) => (
                        <div key={d.district} className="rounded-control bg-surface-2 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-footnote font-semibold text-foreground">{d.district}</p>
                            <span className="text-footnote font-semibold tabular-nums text-primary">Demand {d.demandScore}</span>
                          </div>
                          <dl className="mt-2 space-y-1 text-footnote">
                            <div className="flex justify-between gap-2"><dt className="text-label-2">{t("dealerDash.topModel", "Top model")}</dt><dd className="text-foreground">{d.topModel}</dd></div>
                            <div className="flex justify-between gap-2"><dt className="text-label-2">{t("dealerDash.avgPrice", "Avg price")}</dt><dd className="tabular-nums text-foreground">{d.avgPrice > 0 ? formatPrice(d.avgPrice) : "—"}</dd></div>
                          </dl>
                          <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
                            <div className="h-full origin-left rounded-full bg-primary" style={{ transform: `scaleX(${Math.max(0, Math.min(100, d.demandScore)) / 100})` }} />
                          </div>
                        </div>
                      ))}
                    </div>
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
            </section>

            <Card>
              <p className="text-footnote font-semibold text-primary">{t("dealer.plans", "Dealer plans")}</p>
              <h3 className="mt-1 text-callout font-semibold text-foreground">
                {t("acct.dealer.planTitle", "The full dealer workspace is part of the Dealer plans, from {price}/mo", {
                  price: formatLkr(PLAN_PRICES.dealer_starter.monthly),
                })}
              </h3>
              <p className="mt-2 max-w-xl text-footnote text-label-2">
                {t("dealerDash.keepUsingTheCommandCenter", "Keep using the command center today. Upgrade when you want billed seats, saved yard workflows, and priority market sync.")}
              </p>
              <Button asChild variant="secondary" className="mt-4">
                <Link to="/pricing#for-dealers">{t("dealerDash.viewDealerPlans", "View dealer plans")}</Link>
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </PageCanvas>
  );
}
