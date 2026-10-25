import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { Bell, BellOff, ChevronRight, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useServerMarketAlerts } from "@/hooks/useServerMarketAlerts";
import { usePush } from "@/hooks/usePush";
import { trackEvent } from "@/lib/analytics";
import { loadMarketAlerts } from "@/lib/marketAlerts";
import { useAppPreferences } from "@/lib/appPreferences";
import { isValidNotifyPhone } from "@/lib/notifyPhone";
import { matchAlerts, formatPrice, type AlertMatchResponse, type ServerMarketAlert } from "@/services/api";
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
import { duration, ease, listItem, listStagger, spring, useReducedMotionOrLowData } from "@/lib/motion";
import { useAuth } from "@/lib/authContext";
import { FREE_ALERTS_LIMIT, freePlanCopy, hasFullPlatformAccess } from "@/lib/planLimits";

/** Section heading used on this page (eyebrow + title2), same rhythm as the kit PageHeader. */
function SectionTitle({ id, eyebrow, title, aside }: { id: string; eyebrow: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="mb-1 text-footnote font-semibold text-primary">{eyebrow}</p>
        <h2 id={id} className="text-title2 font-semibold text-foreground">
          {title}
        </h2>
      </div>
      {aside}
    </div>
  );
}

const ALL_CHANNELS = ["inapp", "email", "whatsapp", "telegram", "push"] as const;
type ChannelName = (typeof ALL_CHANNELS)[number];

function parseChannels(raw: string | null | undefined): Set<ChannelName> {
  const out = new Set<ChannelName>();
  if (!raw) return out;
  for (const part of raw.split(",")) {
    const token = part.trim().toLowerCase();
    if ((ALL_CHANNELS as readonly string[]).includes(token)) out.add(token as ChannelName);
  }
  return out;
}

function ChannelCenterSection({ alertCount }: { alertCount: number }) {
  const { t } = useAppPreferences();
  const push = usePush();
  void alertCount;
  return (
    <Card padding="md" aria-label={t("alerts.channelCenter", "Channel center")} role="region">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-callout font-semibold text-foreground">{t("alerts.channelCenter", "Channel center")}</h2>
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

function AlertMatchSection({ token }: { token: string }) {
  const { t } = useAppPreferences();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  const [matchData, setMatchData] = useState<AlertMatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runMatch = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await matchAlerts(token);
      setMatchData(result);
      trackEvent("saved_search", { matches: result.results.length });
    } catch (err) {
      setError(friendlyApiError(err, t("alerts.matchFailed", "Failed to fetch matches"), t));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    runMatch();
  }, [runMatch]);

  if (!token) return null;

  return (
    <section aria-labelledby="match-results-heading" className="scroll-mt-24">
      <SectionTitle
        id="match-results-heading"
        eyebrow={t("alerts.liveResults", "Live results")}
        title={t("alerts.currentMatches", "Current matches")}
        aside={
          <Button
            variant="ghost"
            size="sm"
            onClick={runMatch}
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
          <ErrorState body={error} onRetry={runMatch} />
        </Card>
      ) : null}

      {!error && matchData && matchData.results.length === 0 && (
        <Card padding="none">
          <EmptyState
            icon={BellOff}
            title={t("alerts.noMatchesTitle", "Nothing matches yet")}
            body={t("alerts.noMatches", "No matching listings for your alerts right now.")}
          />
        </Card>
      )}

      {!error && matchData && matchData.results.length > 0 && (
        <div className="content-in space-y-4">
          {matchData.results.map((result) => (
            <Card key={result.alert_id} padding="none" className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-separator px-4 py-3.5 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate text-body font-semibold text-foreground">
                    {[result.make, result.model].filter(Boolean).join(" ") || t("alerts.allVehicles", "All vehicles")}
                    {result.district ? ` · ${result.district}` : ""}
                  </p>
                  {result.max_price ? (
                    <p className="num mt-0.5 text-footnote text-label-2">
                      {t("alerts.underPrice", "Under {price}", { price: formatPrice(result.max_price) })}
                    </p>
                  ) : null}
                </div>
                <Badge variant="info" className="num shrink-0">
                  {t("alerts.found", "{count} found", { count: result.matching_count.toLocaleString() })}
                </Badge>
              </div>
              {result.listings.length > 0 && (
                <ul className="divide-y divide-separator">
                  {result.listings.slice(0, 5).map((listing) => (
                    <li key={listing.id}>
                      <Link
                        to={`/listing/${listing.id}`}
                        aria-label={t("alerts.viewListingAria", "View listing {title}", { title: listing.title || listing.id })}
                        className="group flex items-center justify-between gap-3 px-4 py-3 no-underline transition-colors duration-short hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-body font-medium text-foreground">
                            {listing.title || `${listing.make} ${listing.model}`}
                            {listing.year && !(listing.title ?? "").includes(String(listing.year)) ? ` ${listing.year}` : ""}
                          </p>
                          <p className="mt-0.5 text-footnote text-label-2">
                            {listing.district || "LK"}
                            {fullAccess && listing.deal_score !== null ? ` ${t("alerts.dealSuffix", "· +{score} deal", { score: Number(listing.deal_score).toFixed(0) })}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {listing.price_lkr !== null && (
                            <span className="num text-body font-semibold text-foreground">{formatPrice(listing.price_lkr)}</span>
                          )}
                          <ChevronRight aria-hidden className="h-4 w-4 text-label-2 transition-transform duration-short ease-standard group-hover:translate-x-0.5" />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
          <p className="num text-right text-caption text-label-2">
            {t("alerts.checkedAt", "Checked {time}", { time: new Date(matchData.checked_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) })}
          </p>
        </div>
      )}

      {loading && !matchData && (
        <div className="space-y-3" aria-hidden>
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      )}
    </section>
  );
}

interface CreateAlertFormProps {
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

function CreateAlertForm({ onCreated, onCreate, alertCount, fullAccess }: CreateAlertFormProps) {
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
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      onCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("alerts.saveFailed", "Failed to save alert"));
    } finally {
      setSaving(false);
    }
  }, [make, model, district, maxPrice, notifyPhone, notifyEmail, notifyTelegram, channelWhatsApp, channelEmail, channelTelegram, channelPush, channelInApp, deliveryMode, onCreate, onCreated, fullAccess, alertCount, t]);

  if (atFreeLimit) {
    return (
      <UpgradePrompt
        variant="strip"
        title={t("plan.alertsTitle", freePlanCopy.alertsTitle)}
        body={t("plan.alertsBody", freePlanCopy.alertsBody)}
      />
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("alerts.createAria", "Create new alert")}
      >
        <Plus aria-hidden />
        {t("alerts.newAlert", "New alert")}
      </Button>
    );
  }

  const label = "mb-1.5 block text-footnote font-medium text-label-2";
  const channelChips: Array<{ on: boolean; set: (v: boolean) => void; text: string }> = [
    { on: channelInApp, set: setChannelInApp, text: t("alerts.channelInApp", "In-app") },
    { on: channelWhatsApp, set: setChannelWhatsApp, text: t("alerts.channelWhatsApp", "WhatsApp") },
    { on: channelEmail, set: setChannelEmail, text: t("alerts.channelEmail", "Email") },
    { on: channelTelegram, set: setChannelTelegram, text: t("alerts.channelTelegram", "Telegram") },
    { on: channelPush, set: setChannelPush, text: t("alerts.channelPush", "Push") },
  ];

  return (
    <Card padding="none" className="content-in">
    <form
      onSubmit={handleSubmit}
      aria-label={t("alerts.formAria", "Create alert form")}
      className="space-y-5 p-5 sm:p-6"
    >
      <h2 className="text-callout font-semibold text-foreground">{t("alerts.newAlert", "New alert")}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        <div className="space-y-4 border-t border-separator pt-5">
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
        <p className="rounded-control bg-primary/5 px-3.5 py-3 text-footnote text-label-2">
          {t("alerts.notifyPro", "WhatsApp, Email & Telegram match pings unlock with Pro.")}
        </p>
      )}
      {formError && (
        <p role="alert" className="content-in text-footnote font-medium text-destructive">{formError}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" loading={saving} className="flex-1 sm:flex-none">
          {t("alerts.save", "Save alert")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => { setOpen(false); setFormError(null); }}>
          {t("common.cancel", "Cancel")}
        </Button>
      </div>
    </form>
    </Card>
  );
}

function AlertRow({
  alert,
  onDelete,
  onChannelsChange,
}: {
  alert: ServerMarketAlert;
  /** Kept for call-site compatibility; the row itself does not need it. */
  token?: string;
  onDelete: (id: number) => void;
  onChannelsChange?: (id: number, data: { channels?: string[]; delivery_mode?: "instant" | "digest" }) => Promise<unknown>;
}) {
  const { t } = useAppPreferences();
  const [deleting, setDeleting] = useState(false);
  const [savingChannels, setSavingChannels] = useState(false);
  const activeChannels = parseChannels(alert.notify_channels);
  const deliveryMode = alert.delivery_mode === "digest" ? "digest" : "instant";

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      onDelete(alert.id);
    } finally {
      setDeleting(false);
    }
  }, [alert.id, onDelete]);

  const toggleChannel = useCallback(
    async (channel: ChannelName) => {
      if (!onChannelsChange || savingChannels) return;
      const next = new Set(activeChannels);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      // In-app is the fail-open baseline: keep at least one channel entry.
      setSavingChannels(true);
      try {
        await onChannelsChange(alert.id, { channels: Array.from(next) });
      } catch {
        // fail silently — toggles are non-critical
      } finally {
        setSavingChannels(false);
      }
    },
    [alert.id, activeChannels, onChannelsChange, savingChannels],
  );

  const cycleDelivery = useCallback(async () => {
    if (!onChannelsChange || savingChannels) return;
    setSavingChannels(true);
    try {
      await onChannelsChange(alert.id, { delivery_mode: deliveryMode === "digest" ? "instant" : "digest" });
    } catch {
      // fail silently
    } finally {
      setSavingChannels(false);
    }
  }, [alert.id, deliveryMode, onChannelsChange, savingChannels]);

  const label = [alert.make, alert.model].filter(Boolean).join(" ") || t("alerts.allVehicles", "All vehicles");
  const channelLabel = (channel: ChannelName) =>
    channel === "inapp"
      ? t("alerts.channelInApp", "In-app")
      : channel === "email"
        ? t("alerts.channelEmail", "Email")
        : channel === "whatsapp"
          ? t("alerts.channelWhatsApp", "WhatsApp")
          : channel === "telegram"
            ? t("alerts.channelTelegram", "Telegram")
            : t("alerts.channelPush", "Push");

  return (
    <Card padding="sm" className="transition-colors duration-short hover:border-foreground/20" data-testid="alert-row">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-foreground">{label}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-footnote text-label-2">
            {alert.district && <span>{alert.district}</span>}
            {alert.district && alert.max_price ? <span aria-hidden>·</span> : null}
            {alert.max_price && <span className="num">{t("alerts.underPrice", "Under {price}", { price: formatPrice(alert.max_price) })}</span>}
            {alert.notify_phone && <Badge variant="success" className="num">WhatsApp {alert.notify_phone}</Badge>}
            {alert.notify_email && <Badge variant="info">{alert.notify_email}</Badge>}
            {alert.notify_telegram_chat_id && <Badge variant="info">Telegram {alert.notify_telegram_chat_id}</Badge>}
            {!alert.district && !alert.max_price && !alert.notify_phone && !alert.notify_email && !alert.notify_telegram_chat_id && (
              <span>{t("alerts.anyPriceAllDistricts", "Any price · All districts")}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button asChild variant="tertiary" size="sm">
            <Link
              to={`/?make=${encodeURIComponent(alert.make || "")}&model=${encodeURIComponent(alert.model || "")}${alert.district ? `&district=${encodeURIComponent(alert.district)}` : ""}${alert.max_price ? `&price_max=${alert.max_price}` : ""}#market`}
              onClick={() => trackEvent("listing_view", { alert_id: alert.id })}
              className="no-underline"
            >
              {t("common.browse", "Browse")}
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleDelete}
            disabled={deleting}
            aria-label={t("alerts.deleteAria", "Delete alert for {label}", { label })}
            className="text-label-2 hover:bg-deal-high/10 hover:text-deal-high-text"
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-separator pt-3" role="group" aria-label={t("alerts.perAlertChannels", "Channels")}>
        <span className="mr-1 text-footnote font-medium text-label-2">{t("alerts.perAlertChannels", "Channels")}</span>
        {ALL_CHANNELS.map((channel) => {
          const on = activeChannels.has(channel);
          return (
            <Chip
              key={channel}
              selected={on}
              disabled={!onChannelsChange || savingChannels}
              onClick={() => void toggleChannel(channel)}
              className="h-7 px-3 text-caption"
            >
              {channelLabel(channel)}
            </Chip>
          );
        })}
        <Chip
          disabled={!onChannelsChange || savingChannels}
          onClick={() => void cycleDelivery()}
          aria-pressed={undefined}
          aria-label={`${t("alerts.deliveryMode", "Delivery")}: ${deliveryMode === "digest" ? t("alerts.digestMode", "Digest (07:00 daily)") : t("alerts.instantMode", "Instant")}`}
          title={t(
            "alerts.quietHoursNote",
            "Quiet hours 21:00–07:00 Asia/Colombo: email, WhatsApp, Telegram & push queue for the 07:00 digest. In-app always delivers.",
          )}
          className="num h-7 px-3 text-caption"
        >
          {deliveryMode === "digest" ? t("alerts.digestMode", "Digest (07:00 daily)") : t("alerts.instantMode", "Instant")}
        </Chip>
      </div>
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

  const localAlerts = loadMarketAlerts();
  const showFallback = !loading && error !== null && alerts.length === 0 && localAlerts.length > 0;
  const calm = useReducedMotionOrLowData();

  return (
    <PageCanvas ambient="subtle">
      <PageHeader
        className="max-w-5xl"
        eyebrow={t("alerts.eyebrow", "Market watch")}
        eyebrowIcon={Bell}
        title={t("alerts.title", "Market Alerts")}
        description={t("alerts.description", "Get notified when vehicles matching your criteria appear on the market.")}
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
        <m.div initial="hidden" animate="show" variants={listStagger} className="space-y-12">
          <m.div variants={listItem} custom={0} className="space-y-4">
            <ChannelCenterSection alertCount={alerts.length} />
            <CreateAlertForm
              token={token}
              onCreated={refresh}
              onCreate={create}
              alertCount={alerts.length}
              fullAccess={fullAccess}
            />
          </m.div>

          {/* Active alerts */}
          <m.section variants={listItem} custom={1} aria-labelledby="active-alerts-heading" className="relative z-10">
            <SectionTitle
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
                      <AlertRow alert={alert} token={token} onDelete={remove} onChannelsChange={updateChannels} />
                    </m.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}

            {showFallback && (
              <Card padding="sm" className="mt-4">
                <p className="mb-3 text-footnote font-medium text-label-2">
                  {t("alerts.localSaved", "Locally saved (offline)")}
                </p>
                <ul className="space-y-1.5">
                  {localAlerts.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 rounded-control bg-surface-2 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-body font-semibold text-foreground">{a.label}</p>
                        {a.target_price_lkr ? (
                          <p className="num mt-0.5 text-footnote text-label-2">{t("alerts.underPrice", "Under {price}", { price: formatPrice(a.target_price_lkr) })}</p>
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

          {/* Match results */}
          <m.div variants={listItem} custom={2}>
            <AlertMatchSection token={token} />
          </m.div>
        </m.div>
      </PageBody>
    </PageCanvas>
  );
}
