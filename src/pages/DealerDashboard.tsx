import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BarChart3, Bell, ChevronDown, ChevronUp, RefreshCw, ShieldCheck, Upload } from "lucide-react";
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
  freePlanCopy,
  hasFullPlatformAccess,
} from "@/lib/planLimits";
import type { ProMarketSnapshot } from "@/types/pro";
import { revealItem, springSoft } from "@/lib/motion";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { FreePlanBanner } from "@/components/FreePlanBanner";
import { ProFeatureLock } from "@/components/ProFeatureLock";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { SectionHeader } from "@/components/SectionHeader";
import {
  buildDealerNotifications,
  buildDistrictDemandRows,
  buildDistrictPriceGaps,
  buildTurnoverSeries,
} from "@/lib/dealerDashboardData";
import { DEALER_PLAYBOOK, DEALER_QUICK_TOOLS } from "@/lib/dealerPlaybook";
import { visuals } from "@/lib/visualAssets";
import { trackEvent } from "@/lib/analytics";

type WidgetKey = "turnover" | "priceGap" | "districtDemand" | "inventoryBenchmark";

const TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "10px",
  fontSize: "11px",
  color: "hsl(var(--foreground))",
  boxShadow: "var(--shadow-md)",
} as const;

const TOOLTIP_LABEL_STYLE = { color: "hsl(var(--muted-foreground))" } as const;

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
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-muted-foreground/80">Dealer Intelligence</p>
          <h3 className="mt-1 font-display text-[15px] font-bold tracking-tight text-foreground">{title}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground font-medium">{subtitle}</p>
        </div>
        <button type="button" onClick={onToggle} className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground active:scale-[0.95]" aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`} aria-expanded={!collapsed}>
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>
      {!collapsed && (
        <div className="mt-4 border-t border-border pt-4">
          {loading ? (
            <div className="flex min-h-[180px] items-center justify-center">
              <div aria-hidden className="h-7 w-7 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            </div>
          ) : error ? (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-center">
              <AlertTriangle className="h-4 w-4 text-rose-500 dark:text-rose-400" />
              <p className="text-[11px] text-muted-foreground">{error}</p>
              {onRetry ? (
                <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[10px] font-semibold text-foreground transition-all hover:border-primary/40 hover:bg-surface active:scale-[0.97]">
                  <RefreshCw className="h-3 w-3" /> Retry
                </button>
              ) : null}
            </div>
          ) : emptyMessage ? (
            <p className="py-8 text-center text-[11px] text-muted-foreground">{emptyMessage}</p>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
}

function gapTone(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct <= -5) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 5) return "text-rose-600 dark:text-rose-400";
  return "text-amber-600 dark:text-amber-400";
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

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold text-primary">{t("dealer.claimYard", "Claim your yard")}</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{t("dealer.profile", "Dealer profile")}</h2>
          <p className="mt-1 max-w-xl text-[12px] text-muted-foreground">
            {t("dealer.claimHint", "Claim a seller name so Motormila can match your live inventory and show pricing vs market.")}
          </p>
        </div>
        {profile && (
          <div className="flex flex-wrap items-center gap-2">
            {profile.status === "verified" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-3 w-3" aria-hidden />
                {t("dealer.verified", "Verified dealer")}
              </span>
            )}
            <span className="rounded-full border border-border bg-surface px-3 py-1 text-[12px] font-semibold text-muted-foreground">
              {profile.status} · {profile.matched_listings} matched
              {profile.subscription_status && profile.subscription_status !== "none"
                ? ` · ${profile.plan || "dealer"}/${profile.subscription_status}`
                : ""}
            </span>
          </div>
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="dealer-name" className="mb-1 block text-[11px] font-semibold text-muted-foreground">
            Yard / brand name
          </label>
          <input
            id="dealer-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="h-9 w-full rounded-2xl border border-border bg-surface px-3 text-sm text-foreground"
            placeholder="Colombo Auto Hub"
          />
        </div>
        <div>
          <label htmlFor="dealer-pattern" className="mb-1 block text-[11px] font-semibold text-muted-foreground">
            Seller name on ads
          </label>
          <input
            id="dealer-pattern"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="h-9 w-full rounded-2xl border border-border bg-surface px-3 text-sm text-foreground"
            placeholder="Auto Hub LK"
          />
        </div>
        <div>
          <label htmlFor="dealer-url" className="mb-1 block text-[11px] font-semibold text-muted-foreground">
            Listing / yard URL
          </label>
          <input
            id="dealer-url"
            value={claimedUrl}
            onChange={(e) => setClaimedUrl(e.target.value)}
            className="h-9 w-full rounded-2xl border border-border bg-surface px-3 text-sm text-foreground"
            placeholder="https://ikman.lk/en/shops/..."
            inputMode="url"
          />
        </div>
        <div>
          <label htmlFor="dealer-phone" className="mb-1 block text-[11px] font-semibold text-muted-foreground">
            WhatsApp / phone
          </label>
          <input
            id="dealer-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-9 w-full rounded-2xl border border-border bg-surface px-3 text-sm text-foreground"
            placeholder="0771234567"
          />
        </div>
      </div>
      {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}
      <button
        type="button"
        onClick={() => void handleClaim()}
        disabled={saving}
        className="mt-4 inline-flex h-9 items-center rounded-full bg-primary px-4 text-[11px] font-bold text-white disabled:opacity-40"
      >
        {saving ? t("common.saving", "Saving…") : profile ? t("dealer.updateClaim", "Update claim") : t("dealer.claimProfile", "Claim profile")}
      </button>
    </section>
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
      setSubmitError(err instanceof Error ? err.message : "Request failed");
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
      <div className="rounded-xl border border-border bg-surface p-4">
        <label className="block text-[12px] font-semibold text-muted-foreground/80 mb-2 font-semibold">
          Listing URLs <span className="normal-case font-normal">(one per line, max 50)</span>
        </label>
        <textarea
          ref={textareaRef}
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          placeholder={"https://ikman.lk/en/ad/toyota-vitz-2018-for-sale-...\nhttps://riyasewana.com/listing/..."}
          rows={5}
          className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[10px] text-muted-foreground font-bold num">{urlCount > 0 ? `${urlCount} URL${urlCount === 1 ? "" : "s"}` : t("dealer.pasteUrls", "Paste URLs above")}</span>
          <div className="flex items-center gap-2">
            {(results !== null || urlsText) && (
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex h-8 items-center rounded-full border border-border bg-surface px-3 text-[10px] font-bold text-muted-foreground transition-all hover:text-foreground hover:bg-card active:scale-[0.97]"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={loading || !urlCount}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-4 text-[10px] font-bold text-white shadow-soft transition-all hover:bg-primary/95 active:scale-[0.97] disabled:opacity-40"
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-3 w-3 animate-spin rounded-full border border-current/30 border-t-current" />
                  Benchmarking…
                </span>
              ) : (
                <>
                  <Upload className="h-3 w-3" />
                  Benchmark
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {submitError && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500 dark:text-rose-400" />
          <p className="text-[11px] text-rose-700 dark:text-rose-300 font-medium">{submitError}</p>
        </div>
      )}

      {results !== null && results.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[600px] text-[11px]">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-3 py-2.5 text-left font-bold text-muted-foreground/80">URL</th>
                <th className="px-3 py-2.5 text-left font-bold text-muted-foreground/80">Vehicle</th>
                <th className="px-3 py-2.5 text-right font-bold text-muted-foreground/80">Listing price</th>
                <th className="px-3 py-2.5 text-right font-bold text-muted-foreground/80">Market median</th>
                <th className="px-3 py-2.5 text-right font-bold text-muted-foreground/80">Gap</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row, idx) => (
                <tr key={row.url + String(idx)} className="border-b border-border last:border-0 transition-colors hover:bg-card">
                  <td className="max-w-[180px] px-3 py-2.5">
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-primary hover:underline font-medium"
                      title={row.url}
                    >
                      {row.url.replace(/^https?:\/\//, "").slice(0, 45)}{row.url.length > 50 ? "…" : ""}
                    </a>
                    {row.error && (
                      <span className="mt-0.5 block text-[9px] text-rose-600 dark:text-rose-400">{row.error}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-foreground font-medium">
                    {row.make ? (
                      <span>
                        {row.make}{row.model ? ` ${row.model}` : ""}{row.year ? ` (${row.year})` : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right num text-foreground font-medium">
                    {row.listing_price != null ? formatPrice(row.listing_price) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right num text-foreground font-medium">
                    {row.market_median != null ? (
                      <span title={`${row.comparable_count} comparables`}>
                        {formatPrice(row.market_median)}
                        <span className="ml-1 text-[9px] text-muted-foreground">({row.comparable_count})</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={`px-3 py-2.5 text-right num font-bold ${gapTone(row.price_gap_pct)}`}>
                    {row.price_gap_pct != null ? (
                      `${row.price_gap_pct > 0 ? "+" : ""}${row.price_gap_pct.toFixed(1)}%`
                    ) : (
                      <span className="font-normal text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results !== null && results.length === 0 && (
        <p className="py-6 text-center text-[11px] text-muted-foreground">{t("dealer.noResults", "No results returned.")}</p>
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
  const districtDemand = useMemo(() => buildDistrictDemandRows(districts), [districts]);
  const notifications = useMemo(() => buildDealerNotifications(insights, stats), [insights, stats]);

  const metrics = useMemo(() => {
    const liveLeads = insights?.new_listings_24h ?? stats?.listings_this_week ?? proSnapshot?.new_listings_7d ?? null;
    const arbitrageAlerts = proSnapshot?.hot_deal_count ?? stats?.good_deals_count ?? insights?.hot_deals?.length ?? null;
    const financeReady = insights?.hot_deals?.filter((deal) => deal.deal_score >= 8).length ?? null;
    const topGapDistrict = priceGaps.length
      ? priceGaps.reduce((best, row) => (row.gapPct > best.gapPct ? row : best), priceGaps[0]).district
      : null;

    return [
      {
        label: "Live leads",
        value: liveLeads != null ? liveLeads.toLocaleString() : "—",
        delta: stats?.listings_this_week ? `${stats.listings_this_week.toLocaleString()} this week` : "Syncing market feed",
        tone: liveLeads != null ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
      },
      {
        label: "Arbitrage alerts",
        value: arbitrageAlerts != null ? arbitrageAlerts.toLocaleString() : "—",
        delta: topGapDistrict ? `Highest gap in ${topGapDistrict}` : "Scanning district spreads",
        tone: "text-muted-foreground",
      },
      {
        label: "Finance ready",
        value: financeReady != null ? financeReady.toLocaleString() : "—",
        delta: financeReady != null ? "High deal-score listings" : "Awaiting deal signals",
        tone: "text-muted-foreground",
      },
    ];
  }, [insights, stats, proSnapshot, priceGaps]);

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
    "Market intelligence syncs from live listing data when available.";
  const toggle = (k: WidgetKey) => setCollapsed((p) => ({ ...p, [k]: !p[k] }));

  const retryAll = () => {
    void statsQuery.refetch();
    void insightsQuery.refetch();
    void districtsQuery.refetch();
    if (hasAuthToken) void proSnapshotQuery.refetch();
  };

  return (
    <PageCanvas>
      <PageHero
        theme="dealer"
        eyebrow={t("dealer.eyebrow", "Dealer workspace")}
        watermarkIcon={BarChart3}
        title={<>{t("dealer.commandCenter", "Dealer command center")}<span className="text-sheen">.</span></>}
        description={t("dealer.description", "Arbitrage, demand mapping, and lead flow intelligence.")}
        media={visuals.pageAdminBg}
        mediaPosition="center"
        mediaTone="brand"
        highlights={[
          { label: t("common.inventory", "Inventory"), value: t("common.live", "Live"), hint: "Public market browse" },
          { label: "Pulse", value: "Gov", hint: "Official import signals" },
          { label: t("dealer.plans", "Dealer plans"), value: t("common.pro", "Pro"), hint: "Dealer workspace tiers" },
        ]}
        actions={
          <>
            <Link to="/#market" className="inline-flex h-10 items-center rounded-full border border-border bg-card px-5 text-[12px] font-semibold text-muted-foreground no-underline shadow-soft transition-all hover:border-primary/40 hover:text-foreground hover:bg-surface active:scale-[0.98]">{t("dealer.openPublicInventory", "Open public inventory")}</Link>
            <Link to="/pricing" className="inline-flex h-10 items-center rounded-full border border-border bg-card px-5 text-[12px] font-semibold text-muted-foreground no-underline shadow-soft transition-all hover:border-primary/40 hover:text-foreground hover:bg-surface active:scale-[0.98]">Dealer plans</Link>
            <Link to="/official-pulse" className="inline-flex h-10 items-center rounded-full border border-border bg-card px-5 text-[12px] font-semibold text-muted-foreground no-underline shadow-soft transition-all hover:border-primary/40 hover:text-foreground hover:bg-surface active:scale-[0.98]">Official pulse</Link>
          </>
        }
      />

      <FreePlanBanner />

      <PageBody className="py-10 lg:py-14">
        {!fullAccess ? (
          <UpgradePrompt
            className="mb-6"
            title={freePlanCopy.dealerTitle}
            body={freePlanCopy.dealerBody}
            variant="strip"
          />
        ) : null}

        {dashboardError ? (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500 dark:text-rose-400" />
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-foreground">{t("dealer.unavailable", "Dealer data unavailable")}</p>
              <p className="mt-1 text-[11px] text-muted-foreground font-medium">{dashboardError}</p>
              <button type="button" onClick={retryAll} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[10px] font-bold text-foreground transition-all hover:border-primary/40 hover:bg-card active:scale-[0.97]">
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            </div>
          </div>
        ) : null}

        <div className="mb-6">
          <ClaimYardCard />
        </div>

        <div className="grid gap-6 lg:grid-cols-[268px_1fr]">
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <motion.div variants={revealItem} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <p className="text-[12px] font-semibold text-primary-bright">Motormila</p>
              <h2 className="mt-2 font-display text-lg font-bold tracking-tight text-foreground">Command stack</h2>
              <nav className="mt-4 space-y-1" aria-label={t("dealer.commandStack", "Command stack")}>
                {[
                  { label: t("dealer.turnover", "Inventory Turnover"), meta: turnoverData.length ? `${turnoverData.length} models` : "—" },
                  { label: t("dealer.priceGapScanner", "Price Gap Scanner"), meta: priceGaps.length ? `${priceGaps.length} districts` : "—" },
                  { label: t("dealer.districtDemand", "District Demand"), meta: districtDemand.length ? `${districtDemand.length} zones` : "—" },
                  { label: t("dealer.leadNotifications", "Lead Notifications"), meta: notifications.length > 1 ? t("common.live", "Live").toLowerCase() : "standby" },
                  { label: t("dealer.benchmark", "Inventory Benchmark"), meta: "URL upload" },
                ].map((i) => (
                  <div key={i.label} className="flex items-center justify-between rounded-2xl border border-border bg-surface px-3 py-2 transition-all hover:border-primary/40 hover:bg-card">
                    <span className="text-[11px] text-foreground font-medium">{i.label}</span>
                    <span className="text-[9px] font-bold text-primary-bright num">{i.meta}</span>
                  </div>
                ))}
                <div className="pt-3">
                  <p className="mb-2 px-1 text-[11px] font-medium text-muted-foreground/80">{t("dealer.quickTools", "Quick tools")}</p>
                  {DEALER_QUICK_TOOLS.map((tool) => (
                    <Link
                      key={tool.id}
                      to={tool.to}
                      className="mb-1 flex items-center justify-between rounded-2xl border border-border bg-surface px-3 py-2 no-underline transition-all hover:border-primary/40 hover:bg-card last:mb-0"
                    >
                      <span className="min-w-0">
                        <span className="block text-[11px] text-foreground font-medium">{tool.title}</span>
                        <span className="block text-[9px] text-muted-foreground font-medium">{tool.description}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </nav>
            </motion.div>
            <motion.div variants={revealItem} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary-bright" /><p className="text-[10px] font-bold text-primary-bright">{t("dealer.trustTier", "Trust tier")}</p></div>
              {dashboardLoading ? (
                <div className="mt-3 h-8 animate-pulse rounded-full bg-surface" />
              ) : (
                <>
                  <p className="mt-2 flex items-baseline gap-1">
                    <span className="num text-2xl font-bold text-foreground">{trustScore ?? "—"}</span>
                    {trustScore != null ? <span className="text-[11px] text-muted-foreground font-bold">/100</span> : null}
                  </p>
                  {trustScore != null ? (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-primary" style={{ width: `${trustScore}%` }} /></div>
                  ) : (
                    <p className="mt-2 text-[10px] text-muted-foreground font-medium">Trust score needs listing volume data.</p>
                  )}
                </>
              )}
            </motion.div>
          </aside>

          <main className="space-y-6">
            {/* Featured KPI bento: primary metric towers over the pair */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map((m, idx) => {
                const featured = idx === 0;
                return (
                  <motion.div
                    key={m.label}
                    variants={revealItem}
                    whileHover={featured ? { y: -2 } : undefined}
                    transition={springSoft}
                    className={`group rounded-2xl border border-border bg-card shadow-soft transition-all hover:border-primary/30 ${featured ? "sm:col-span-2 p-6" : "p-5"}`}
                  >
                    <p className="text-[12px] font-semibold text-muted-foreground/80">{m.label}</p>
                    {dashboardLoading ? (
                      <div className={`mt-3 animate-pulse rounded-full bg-surface ${featured ? "h-12 w-28" : "h-8 w-16"}`} />
                    ) : (
                      <p className={`num mt-2 font-bold text-foreground ${featured ? "text-4xl sm:text-5xl" : "text-2xl"}`}>{m.value}</p>
                    )}
                    <p className={`mt-1 text-[11px] font-semibold ${m.tone}`}>{m.delta}</p>
                  </motion.div>
                );
              })}
            </div>

            <motion.div variants={revealItem} key={activeNotif} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary-bright"><Bell className="h-3.5 w-3.5" /></div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-primary-bright">Lead notification</p>
                <p className="mt-1 text-[12px] text-foreground font-medium leading-relaxed">{activeNotif}</p>
              </div>
            </motion.div>

            <div className="pt-4">
              <SectionHeader
                eyebrow="Playbook"
                title="What dealers and brokers use this for"
                description="Operator workflows from stock pricing to import duty, alerts, and weekly yard review."
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {DEALER_PLAYBOOK.map((item) => (
                  <motion.div
                    key={item.id}
                    variants={revealItem}
                    className="rounded-2xl border border-border bg-card p-5 shadow-soft transition-all hover:border-primary/30"
                  >
                    <p className="text-[11px] font-medium text-primary-bright">{item.forWhom}</p>
                    <h3 className="mt-1.5 font-display text-[14px] font-bold tracking-tight text-foreground">{item.title}</h3>
                    <p className="mt-2 text-[11px] text-muted-foreground font-medium leading-relaxed">{item.problem}</p>
                    <p className="mt-2 text-[11px] text-foreground font-medium leading-relaxed">{item.whatMotormilaDoes}</p>
                    <Link
                      to={item.whereToGo.to}
                      className="mt-4 inline-flex text-[12px] font-semibold text-primary-bright no-underline transition-colors hover:text-primary"
                    >
                      {item.whereToGo.label} →
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="pt-4">
              <SectionHeader
                eyebrow="Analytics"
                title="Inventory & benchmark analytics"
                description="Momentum, price spread, and district demand across your live market feed."
              />

              {fullAccess ? (
              <div className="space-y-5">
                <WidgetShell
                  title={t("dealer.turnover", "Inventory Turnover")}
                  subtitle={turnoverData.length ? "Trending model momentum and listing volume" : "Trending model momentum from market insights"}
                  collapsed={collapsed.turnover}
                  onToggle={() => toggle("turnover")}
                  loading={insightsQuery.isPending}
                  error={insightsQuery.isError ? "Unable to load turnover insights." : null}
                  onRetry={() => void insightsQuery.refetch()}
                  emptyMessage={!insightsQuery.isPending && !turnoverData.length ? "No trending model data yet." : undefined}
                >
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={turnoverData}>
                        <defs><linearGradient id="turnoverArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="week" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                        <Area type="monotone" dataKey="sellThrough" name="Momentum index" stroke="hsl(var(--primary))" fill="url(#turnoverArea)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </WidgetShell>

                <WidgetShell
                  title={t("dealer.priceGaps", "Price Gaps")}
                  subtitle="District spread vs national median"
                  collapsed={collapsed.priceGap}
                  onToggle={() => toggle("priceGap")}
                  loading={districtsQuery.isPending}
                  error={districtsQuery.isError ? "Unable to load district pricing." : null}
                  onRetry={() => void districtsQuery.refetch()}
                  emptyMessage={!districtsQuery.isPending && !priceGaps.length ? "No district price gaps mapped yet." : undefined}
                >
                  <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={priceGaps}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="district" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => [`${v.toFixed(1)}%`, "Gap"]} />
                        <Bar dataKey="gapPct" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </WidgetShell>

                <WidgetShell
                  title={t("dealer.districtDemand", "District Demand")}
                  subtitle="Supply concentration and average deal floor"
                  collapsed={collapsed.districtDemand}
                  onToggle={() => toggle("districtDemand")}
                  loading={districtsQuery.isPending}
                  error={districtsQuery.isError ? "Unable to load district demand." : null}
                  onRetry={() => void districtsQuery.refetch()}
                  emptyMessage={!districtsQuery.isPending && !districtDemand.length ? "No district demand data yet." : undefined}
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    {districtDemand.map((d) => (
                      <div key={d.district} className="rounded-xl border border-border bg-surface p-4 transition-all hover:border-primary/40 hover:bg-card hover:shadow-soft">
                        <div className="flex items-center justify-between">
                          <p className="text-[12px] font-bold text-foreground">{d.district}</p>
                          <span className="text-[10px] font-bold text-primary-bright num">Demand {d.demandScore}</span>
                        </div>
                        <div className="mt-2 space-y-1">
                          <div className="flex justify-between text-[10px] font-medium"><span className="text-muted-foreground">Top model</span><span className="text-foreground">{d.topModel}</span></div>
                          <div className="flex justify-between text-[10px] font-medium"><span className="text-muted-foreground">Avg price</span><span className="text-foreground num">{d.avgPrice > 0 ? formatPrice(d.avgPrice) : "—"}</span></div>
                        </div>
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-card"><div className="h-full rounded-full bg-primary" style={{ width: `${d.demandScore}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </WidgetShell>

                <div id="benchmark">
                  <WidgetShell
                    title={t("dealer.benchmark", "Inventory Benchmark")}
                    subtitle="Paste listing URLs to benchmark against the current market"
                    collapsed={collapsed.inventoryBenchmark}
                    onToggle={() => toggle("inventoryBenchmark")}
                  >
                    <InventoryBenchmark />
                  </WidgetShell>
                </div>
              </div>
              ) : (
                <ProFeatureLock label={freePlanCopy.dealerTitle} className="min-h-[18rem]">
                  <div className="rounded-2xl border border-border bg-card p-8 opacity-80">
                    <p className="font-display text-lg font-bold text-foreground">{t("dealer.turnover", "Inventory Turnover")}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{freePlanCopy.dealerBody}</p>
                  </div>
                </ProFeatureLock>
              )}
            </div>

            <motion.div
              variants={revealItem}
              className="rounded-2xl border border-border bg-card p-6 shadow-soft"
            >
              <p className="text-[12px] font-semibold text-primary-bright">Dealer plan</p>
              <h3 className="mt-2 font-display text-[15px] font-bold tracking-tight text-foreground">
                Full dealer workspace is part of Dealer plan — LKR 1,999/mo
              </h3>
              <p className="mt-2 max-w-xl text-[12px] text-muted-foreground font-medium leading-relaxed">
                Keep using the command center today. Upgrade when you want billed seats, saved yard workflows, and priority market sync.
              </p>
              <Link
                to="/pricing"
                className="mt-4 inline-flex h-10 items-center rounded-full border border-border bg-surface px-5 text-[12px] font-semibold text-foreground no-underline shadow-soft transition-all hover:border-primary/40 hover:bg-card active:scale-[0.98]"
              >
                View dealer plans
              </Link>
            </motion.div>
          </main>
        </div>
      </PageBody>
    </PageCanvas>
  );
}
