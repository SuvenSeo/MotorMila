import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { Bell, BellOff, Plus, RefreshCw, Search } from "lucide-react";
import { useServerMarketAlerts } from "@/hooks/useServerMarketAlerts";
import { usePush } from "@/hooks/usePush";
import { trackEvent } from "@/lib/analytics";
import { loadMarketAlerts } from "@/lib/marketAlerts";
import { useAppPreferences } from "@/lib/appPreferences";
import { isValidNotifyPhone } from "@/lib/notifyPhone";
import { matchAlerts, formatPrice, type AlertMatchResponse } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { friendlyApiError } from "@/lib/apiErrorText";
import { PageHeader } from "@/components/ui/page-header";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { AlertsSectionHeader } from "@/components/alerts/AlertsSectionHeader";
import { AlertCard, type AlertMatchSummary } from "@/components/alerts/AlertCard";
import { MatchedListingRow } from "@/components/alerts/MatchedListingRow";
import { duration, ease, listItem, listStagger, spring, useReducedMotionOrLowData } from "@/lib/motion";
import { useAuth } from "@/lib/authContext";
import { FREE_ALERTS_LIMIT, freePlanCopy, hasFullPlatformAccess } from "@/lib/planLimits";

function DeliverySection() {
  const { t } = useAppPreferences();
  const push = usePush();
  return (
    <Card padding="md" aria-label={t("alerts.channelCenter", "Channel center")} role="region">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-title3 font-semibold tracking-tight text-foreground">
            {t("alerts.channelCenter", "Channel center")}
          </h2>
          <p className="mt-1 text-footnote text-label-2">
            {t("alerts.channelsHint", "Pick where each alert pings you. In-app always delivers.")}
          </p>
        </div>
        {push.supported ? (
          <Button
            type="button"
            variant={push.subscribed ? "secondary" : "primary"}
            size="sm"
            loading={push.subscribing}
            onClick={() => (push.subscribed ? void push.unsubscribe() : void push.subscribe())}
          >
            <Bell aria-hidden />
            {push.subscribed ? t("alerts.pushOn", "Push on") : t("alerts.pushEnable", "Enable push")}
          </Button>
        ) : (
          <span className="max-w-xs text-footnote text-label-2">
            {push.vapidMissing
              ? t("alerts.pushUnsupported", "Browser push isn't available here yet; alerts still show in the app.")
              : t("alerts.pushOff", "Push off — enable in your browser for price-drop pings.")}
          </span>
        )}
      </div>
      <p className="mt-4 rounded-control bg-surface-2 px-3.5 py-3 text-footnote text-label-2">
        {t(
          "alerts.quietHoursNote",
          "Quiet hours 21:00–07:00 Asia/Colombo: email, WhatsApp, Telegram & push queue for the 07:00 digest. In-app always delivers.",
        )}
      </p>
    </Card>
  );
}

function MatchesSection({
  matchData,
  loading,
  error,
  onRefresh,
}: {
  matchData: AlertMatchResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const { t } = useAppPreferences();

  return (
    <section aria-labelledby="match-results-heading" className="scroll-mt-24">
      <AlertsSectionHeader
        id="match-results-heading"
        eyebrow={t("alerts.liveResults", "Live results")}
        title={t("alerts.currentMatches", "Current matches")}
        aside={
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            aria-label={t("alerts.refreshAria", "Refresh matches")}
            className="shrink-0 text-label-2"
          >
            <RefreshCw className={loading ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden />
            {t("common.refresh", "Refresh")}
          </Button>
        }
      />

      {error && !loading ? (
        <Card padding="none">
          <ErrorState body={error} onRetry={onRefresh} />
        </Card>
      ) : null}

      {!error && matchData && matchData.results.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={BellOff}
            title={t("alerts.noMatchesTitle", "Nothing matches yet")}
            body={t("alerts.noMatches", "No matching listings for your alerts right now.")}
          />
        </Card>
      ) : null}

      {!error && matchData && matchData.results.length > 0 ? (
        <div className="content-in space-y-3">
          {matchData.results.map((result) => (
            <Card key={result.alert_id} padding="none" className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-separator px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate font-display text-callout font-semibold tracking-tight text-foreground">
                    {[result.make, result.model].filter(Boolean).join(" ") || t("alerts.allVehicles", "All vehicles")}
                    {result.district ? (
                      <span className="font-sans text-footnote font-normal tracking-normal text-label-2"> · {result.district}</span>
                    ) : null}
                  </p>
                  {result.max_price ? (
                    <p className="num mt-0.5 text-caption text-label-2">
                      {t("alerts.underPrice", "Under {price}", { price: formatPrice(result.max_price) })}
                    </p>
                  ) : null}
                </div>
                <Badge variant="info" className="num shrink-0">
                  {t("alerts.found", "{count} found", { count: result.matching_count.toLocaleString() })}
                </Badge>
              </div>
              {result.listings.length > 0 ? (
                <ul className="divide-y divide-separator">
                  {result.listings.slice(0, 5).map((listing) => (
                    <MatchedListingRow key={listing.id} listing={listing} />
                  ))}
                </ul>
              ) : null}
            </Card>
          ))}
          <p className="num text-right text-caption text-label-2">
            {t("alerts.checkedAt", "Checked {time}", { time: new Date(matchData.checked_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) })}
          </p>
        </div>
      ) : null}

      {loading && !matchData ? (
        <div className="space-y-3" aria-hidden>
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : null}
    </section>
  );
}

interface CreateAlertFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  token: string;
  alertCount: number;
  fullAccess: boolean;
  onCreate: (data: {
    make?: string;
    model?: string;
    district?: string;
    max_price?: number;
    notify_phone?: string;
    notify_email?: string;
    notify_telegram_chat_id?: string;
    notify_channels?: string;
    delivery_mode?: "instant" | "digest";
    quiet_hours_enabled?: boolean;
  }) => Promise<unknown>;
}

function CreateAlertForm({ open, onOpenChange, onCreated, onCreate, alertCount, fullAccess }: CreateAlertFormProps) {
  const { t } = useAppPreferences();
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [district, setDistrict] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [notifyPhone, setNotifyPhone] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyTelegram, setNotifyTelegram] = useState("");
  const [channelWhatsApp, setChannelWhatsApp] = useState(false);
  const [channelEmail, setChannelEmail] = useState(false);
  const [channelTelegram, setChannelTelegram] = useState(false);
  const [channelPush, setChannelPush] = useState(false);
  const [channelInApp, setChannelInApp] = useState(true);
  const [deliveryMode, setDeliveryMode] = useState<"instant" | "digest">("instant");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const atFreeLimit = !fullAccess && alertCount >= FREE_ALERTS_LIMIT;

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullAccess && alertCount >= FREE_ALERTS_LIMIT) {
      setFormError(t("alerts.freeLimitError", "Free plan includes {n} alert. Upgrade to Pro for more.", { n: FREE_ALERTS_LIMIT }));
      return;
    }
    if (!make.trim() && !model.trim() && !district.trim() && !maxPrice.trim()) {
      setFormError(t("alerts.needFilter", "Provide at least one filter."));
      return;
    }
    const hasAnyChannel = channelWhatsApp || channelEmail || channelTelegram || channelPush;
    if (!fullAccess && hasAnyChannel) {
      setFormError(t("alerts.notifyProError", "Notification channels unlock with Pro."));
      return;
    }
    if (!isValidNotifyPhone(notifyPhone)) {
      setFormError(t("alerts.invalidPhone", "Enter a valid WhatsApp number (e.g. 0771234567 or +94771234567)."));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const price = Number(maxPrice.replace(/[^\d]/g, ""));
      const channels: string[] = [];
      if (channelInApp) channels.push("inapp");
      if (channelWhatsApp) channels.push("whatsapp");
      if (channelEmail) channels.push("email");
      if (channelTelegram) channels.push("telegram");
      if (channelPush) channels.push("push");
      await onCreate({
        make: make.trim() || undefined,
        model: model.trim() || undefined,
        district: district.trim() || undefined,
        max_price: Number.isFinite(price) && price > 0 ? price : undefined,
        notify_phone: fullAccess && channelWhatsApp ? (notifyPhone.trim() || undefined) : undefined,
        notify_email: fullAccess && channelEmail ? (notifyEmail.trim() || undefined) : undefined,
        notify_telegram_chat_id: fullAccess && channelTelegram ? (notifyTelegram.trim() || undefined) : undefined,
        notify_channels: fullAccess && channels.length > 0 ? channels.join(",") : undefined,
        delivery_mode: fullAccess ? deliveryMode : undefined,
        quiet_hours_enabled: fullAccess ? true : undefined,
      });
      setMake(""); setModel(""); setDistrict(""); setMaxPrice("");
      setNotifyPhone(""); setNotifyEmail(""); setNotifyTelegram("");
      setChannelWhatsApp(false); setChannelEmail(false); setChannelTelegram(false);
      setChannelPush(false); setChannelInApp(true); setDeliveryMode("instant");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("alerts.saveFailed", "Failed to save alert"));
    } finally {
      setSaving(false);
    }
  }, [make, model, district, maxPrice, notifyPhone, notifyEmail, notifyTelegram, channelWhatsApp, channelEmail, channelTelegram, channelPush, channelInApp, deliveryMode, onCreate, onCreated, onOpenChange, fullAccess, alertCount, t]);

  if (atFreeLimit) {
    return (
      <UpgradePrompt
        variant="strip"
        title={t("plan.alertsTitle", freePlanCopy.alertsTitle)}
        body={t("plan.alertsBody", freePlanCopy.alertsBody)}
      />
    );
  }

  if (!open) return null;

  const label = "mb-1.5 block text-caption font-semibold uppercase tracking-caps text-label-2";
  const channelChips: Array<{ on: boolean; set: (v: boolean) => void; text: string }> = [
    { on: channelInApp, set: setChannelInApp, text: t("alerts.channelInApp", "In-app") },
    { on: channelWhatsApp, set: setChannelWhatsApp, text: t("alerts.channelWhatsApp", "WhatsApp") },
    { on: channelEmail, set: setChannelEmail, text: t("alerts.channelEmail", "Email") },
    { on: channelTelegram, set: setChannelTelegram, text: t("alerts.channelTelegram", "Telegram") },
    { on: channelPush, set: setChannelPush, text: t("alerts.channelPush", "Push") },
  ];

  return (
    <Card padding="none" className="content-in">
      <form onSubmit={handleSubmit} aria-label={t("alerts.formAria", "Create alert form")} className="p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-title3 font-semibold tracking-tight text-foreground">
            {t("alerts.newAlert", "New alert")}
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => { onOpenChange(false); setFormError(null); }}>
            {t("common.cancel", "Cancel")}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="alert-make" className={label}>{t("common.make", "Make")}</label>
            <Input id="alert-make" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Toyota" />
          </div>
          <div>
            <label htmlFor="alert-model" className={label}>{t("common.model", "Model")}</label>
            <Input id="alert-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Aqua" />
          </div>
          <div>
            <label htmlFor="alert-district" className={label}>{t("common.district", "District")}</label>
            <Input id="alert-district" value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Colombo" />
          </div>
          <div>
            <label htmlFor="alert-price" className={label}>{t("alerts.maxPrice", "Max price (LKR)")}</label>
            <Input
              id="alert-price"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="5000000"
              className="num"
            />
          </div>
        </div>
        {fullAccess ? (
          <div className="mt-5 space-y-4 border-t border-separator pt-5">
            <div>
              <p className={label}>{t("alerts.notifyChannels", "Notify me via (Pro)")}</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("alerts.notifyChannels", "Notify me via (Pro)")}>
                {channelChips.map((c) => (
                  <Chip key={c.text} selected={c.on} onClick={() => c.set(!c.on)}>
                    {c.text}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className={label}>{t("alerts.deliveryMode", "Delivery")}</p>
              <SegmentedControl
                value={deliveryMode}
                onValueChange={(v: "instant" | "digest") => setDeliveryMode(v)}
                semantics="radio"
                aria-label={t("alerts.deliveryMode", "Delivery")}
                className="max-w-sm"
                options={[
                  { value: "instant", label: t("alerts.instantMode", "Instant") },
                  { value: "digest", label: t("alerts.digestMode", "Digest (07:00 daily)") },
                ]}
              />
            </div>
            <p className="text-footnote text-label-2">
              {t(
                "alerts.quietHoursNote",
                "Quiet hours 21:00–07:00 Asia/Colombo: email, WhatsApp, Telegram & push queue for the 07:00 digest. In-app always delivers.",
              )}
            </p>
            {channelWhatsApp && (
              <div className="content-in">
                <label htmlFor="alert-whatsapp" className={label}>
                  {t("alerts.notifyWhatsapp", "WhatsApp number")}
                </label>
                <Input id="alert-whatsapp" value={notifyPhone} onChange={(e) => setNotifyPhone(e.target.value)} placeholder="0771234567" inputMode="tel" />
                <p className="mt-1.5 text-caption text-label-2">
                  {t("alerts.whatsappHint", "Get a WhatsApp ping when new matches appear (requires Twilio on the server).")}
                </p>
              </div>
            )}
            {channelEmail && (
              <div className="content-in">
                <label htmlFor="alert-email" className={label}>
                  {t("alerts.notifyEmail", "Email address")}
                </label>
                <Input id="alert-email" type="email" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} placeholder="you@example.com" />
              </div>
            )}
            {channelTelegram && (
              <div className="content-in">
                <label htmlFor="alert-telegram" className={label}>
                  {t("alerts.notifyTelegram", "Telegram chat ID or @username")}
                </label>
                <Input id="alert-telegram" value={notifyTelegram} onChange={(e) => setNotifyTelegram(e.target.value)} placeholder={t("alerts.telegramPlaceholder", "123456789 or @mychannel")} />
                <p className="mt-1.5 text-caption text-label-2">
                  {t("alerts.telegramHint", "Send /start to your bot first to get a chat ID.")}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-5 rounded-control bg-primary/5 px-3.5 py-3 text-footnote text-label-2">
            {t("alerts.notifyPro", "WhatsApp, Email & Telegram match pings unlock with Pro.")}
          </p>
        )}
        {formError && (
          <p role="alert" className="content-in mt-4 text-footnote font-medium text-destructive">{formError}</p>
        )}
        <div className="mt-5 flex gap-2 border-t border-separator pt-4">
          <Button type="submit" loading={saving} className="flex-1 sm:flex-none">
            {t("alerts.save", "Save alert")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => { onOpenChange(false); setFormError(null); }}>
            {t("common.cancel", "Cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function Alerts() {
  const { t } = useAppPreferences();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  const hookResult = useServerMarketAlerts();
  const { alerts, loading, error, token, refresh, create, remove } = hookResult;
  const updateChannels = hookResult.updateChannels
    ?? (async () => {
      throw new Error("channel update unavailable");
    });

  const [createOpen, setCreateOpen] = useState(false);
  const [matchData, setMatchData] = useState<AlertMatchResponse | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);

  const runMatch = useCallback(async () => {
    if (!token) return;
    setMatchLoading(true);
    setMatchError(null);
    try {
      const result = await matchAlerts(token);
      setMatchData(result);
      trackEvent("saved_search", { matches: result.results.length });
    } catch (err) {
      setMatchError(friendlyApiError(err, t("alerts.matchFailed", "Failed to fetch matches"), t));
    } finally {
      setMatchLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    void runMatch();
  }, [runMatch]);

  const matchSummaries = useMemo(() => {
    const summaries = new Map<number, AlertMatchSummary>();
    for (const result of matchData?.results ?? []) {
      const prices = result.listings
        .map((listing) => Number(listing.price_lkr))
        .filter((price) => Number.isFinite(price) && price > 0);
      summaries.set(result.alert_id, {
        count: result.matching_count,
        cheapest: prices.length ? Math.min(...prices) : null,
      });
    }
    return summaries;
  }, [matchData]);

  const localAlerts = loadMarketAlerts();
  const showFallback = !loading && error !== null && alerts.length === 0 && localAlerts.length > 0;
  const calm = useReducedMotionOrLowData();
  const atFreeLimit = !fullAccess && alerts.length >= FREE_ALERTS_LIMIT;

  return (
    <PageCanvas ambient="subtle">
      <PageHeader
        className="max-w-5xl"
        eyebrow={t("alerts.eyebrow", "Market watch")}
        eyebrowIcon={Bell}
        title={t("alerts.title", "Market Alerts")}
        description={t("alerts.description", "Get notified when vehicles matching your criteria appear on the market.")}
        actions={
          atFreeLimit ? undefined : (
            <Button type="button" onClick={() => setCreateOpen(true)} aria-label={t("alerts.createAria", "Create new alert")}>
              <Plus aria-hidden />
              {t("alerts.newAlert", "New alert")}
            </Button>
          )
        }
        stats={[
          {
            label: t("alerts.highlightActive", "Active"),
            value: loading ? <Skeleton shape="text" className="mt-1.5 h-5 w-10" /> : <AnimatedNumber value={alerts.length} />,
            hint: fullAccess ? t("alerts.highlightActiveHint", "Saved alert rules") : t("alerts.highlightFreeLimit", "Free limit {n}", { n: FREE_ALERTS_LIMIT }),
          },
          { label: t("alerts.highlightSync", "Sync"), value: token ? t("common.on", "On") : t("common.local", "Local"), hint: t("alerts.highlightSyncHint", "Server or device storage") },
        ]}
      />

      <PageBody narrow className="pb-16 pt-2 sm:pt-4 lg:pt-4">
        <m.div initial="hidden" animate="show" variants={listStagger} className="space-y-10">
          {createOpen || atFreeLimit ? (
            <m.div variants={listItem} custom={0}>
              <CreateAlertForm
                open={createOpen}
                onOpenChange={setCreateOpen}
                token={token}
                onCreated={refresh}
                onCreate={create}
                alertCount={alerts.length}
                fullAccess={fullAccess}
              />
            </m.div>
          ) : null}

          <m.section variants={listItem} custom={1} aria-labelledby="active-alerts-heading" className="relative z-10">
            <AlertsSectionHeader
              id="active-alerts-heading"
              eyebrow={t("alerts.yourWatchlist", "Your watchlist")}
              title={t("alerts.active", "Active alerts")}
              aside={
                !loading && alerts.length > 0 ? (
                  <Badge variant="info" className="num shrink-0">
                    <AnimatedNumber value={alerts.length} />
                  </Badge>
                ) : undefined
              }
            />

            {loading && (
              <div className="space-y-2" aria-label={t("alerts.loadingAria", "Loading alerts")} aria-busy="true">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            )}

            {!loading && error && alerts.length === 0 && (
              <Card padding="none">
                <ErrorState body={friendlyApiError(error, t("alerts.loadFailed", "Couldn't load your alerts."), t)} onRetry={refresh} />
              </Card>
            )}

            {!loading && !error && alerts.length === 0 && (
              <Card padding="none">
                <EmptyState
                  icon={BellOff}
                  title={t("alerts.emptyTitle", "No alerts yet")}
                  body={t("alerts.empty", "No active alerts. Create one above to get started.")}
                  action={
                    <Button type="button" onClick={() => setCreateOpen(true)}>
                      <Plus aria-hidden />
                      {t("alerts.createFirst", "Create your first alert")}
                    </Button>
                  }
                />
              </Card>
            )}

            {!loading && alerts.length > 0 && (
              <ul className="content-in space-y-2">
                <AnimatePresence initial={false}>
                  {alerts.map((alert) => (
                    <m.li
                      key={alert.id}
                      layout={!calm}
                      initial={{ opacity: 0, y: calm ? 0 : 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: calm ? 1 : 0.98, transition: { duration: duration.short, ease: ease.accelerate } }}
                      transition={calm ? { duration: duration.micro } : spring.snappy}
                    >
                      <AlertCard
                        alert={alert}
                        match={matchSummaries.get(alert.id)}
                        onDelete={remove}
                        onChannelsChange={updateChannels}
                      />
                    </m.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}

            {showFallback && (
              <Card padding="none" className="mt-4 overflow-hidden">
                <p className="border-b border-separator px-4 py-2.5 text-caption font-semibold uppercase tracking-caps text-label-2 sm:px-5">
                  {t("alerts.localSaved", "Locally saved (offline)")}
                </p>
                <ul className="divide-y divide-separator">
                  {localAlerts.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                      <div className="min-w-0">
                        <p className="truncate text-body font-medium text-foreground">{a.label}</p>
                        {a.target_price_lkr ? (
                          <p className="num mt-0.5 text-caption text-label-2">
                            {t("alerts.underPrice", "Under {price}", { price: formatPrice(a.target_price_lkr) })}
                          </p>
                        ) : null}
                      </div>
                      <Button asChild variant="tertiary" size="sm">
                        <Link
                          to={`/?${new URLSearchParams(Object.fromEntries(Object.entries(a.filters).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString()}#market`}
                          className="no-underline"
                        >
                          <Search aria-hidden />
                          {t("common.browse", "Browse")}
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </m.section>

          {token ? (
            <m.div variants={listItem} custom={2}>
              <MatchesSection matchData={matchData} loading={matchLoading} error={matchError} onRefresh={runMatch} />
            </m.div>
          ) : null}

          <m.div variants={listItem} custom={3}>
            <DeliverySection />
          </m.div>
        </m.div>
      </PageBody>
    </PageCanvas>
  );
}
