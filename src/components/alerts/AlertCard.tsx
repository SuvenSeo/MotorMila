import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { formatPrice, type ServerMarketAlert } from "@/services/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TargetPriceChip } from "@/components/alerts/MatchedListingRow";
import { trackEvent } from "@/lib/analytics";
import { useAppPreferences } from "@/lib/appPreferences";

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

export interface AlertMatchSummary {
  count: number;
  cheapest: number | null;
}

interface AlertCardProps {
  alert: ServerMarketAlert;
  match?: AlertMatchSummary;
  onDelete: (id: number) => void;
  onChannelsChange?: (id: number, data: { channels?: string[]; delivery_mode?: "instant" | "digest" }) => Promise<unknown>;
}

/** One saved search: what it watches, the target vs the cheapest live match, and its delivery channels. */
export function AlertCard({ alert, match, onDelete, onChannelsChange }: AlertCardProps) {
  const { t } = useAppPreferences();
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savingChannels, setSavingChannels] = useState(false);
  const activeChannels = parseChannels(alert.notify_channels);
  const deliveryMode = alert.delivery_mode === "digest" ? "digest" : "instant";

  const handleDelete = useCallback(async () => {
    setConfirmOpen(false);
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
      setSavingChannels(true);
      try {
        await onChannelsChange(alert.id, { channels: Array.from(next) });
      } catch (err) {
        toast.error(
          t("alerts.channelsUpdateFailed", "Couldn't update channels. Your alert is unchanged."),
          { description: err instanceof Error ? err.message : undefined },
        );
      } finally {
        setSavingChannels(false);
      }
    },
    [alert.id, activeChannels, onChannelsChange, savingChannels, t],
  );

  const cycleDelivery = useCallback(async () => {
    if (!onChannelsChange || savingChannels) return;
    setSavingChannels(true);
    try {
      await onChannelsChange(alert.id, { delivery_mode: deliveryMode === "digest" ? "instant" : "digest" });
    } catch (err) {
      toast.error(
        t("alerts.deliveryUpdateFailed", "Couldn't change delivery mode. Your alert is unchanged."),
        { description: err instanceof Error ? err.message : undefined },
      );
    } finally {
      setSavingChannels(false);
    }
  }, [alert.id, deliveryMode, onChannelsChange, savingChannels, t]);

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
  const channelSummary = ALL_CHANNELS.filter((channel) => activeChannels.has(channel))
    .map(channelLabel)
    .join(", ");

  return (
    <Card padding="none" data-testid="alert-row" className="overflow-hidden transition-colors duration-short hover:border-foreground/20">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate font-display text-callout font-semibold tracking-tight text-foreground">
              {label}
            </h3>
            {alert.active === false ? <Badge variant="neutral">{t("alerts.paused", "Paused")}</Badge> : null}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-label-2">
            <span>{alert.district || t("common.allDistricts", "All districts")}</span>
            <span aria-hidden>·</span>
            <span className="num">
              {alert.max_price
                ? t("alerts.underPrice", "Under {price}", { price: formatPrice(alert.max_price) })
                : t("alerts.anyPrice", "Any price")}
            </span>
            {match?.cheapest ? (
              <>
                <span aria-hidden>·</span>
                <span className="num">{t("alerts.cheapestNow", "Cheapest now {price}", { price: formatPrice(match.cheapest) })}</span>
              </>
            ) : null}
          </p>
          {match && match.count > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="info" className="num">
                {t("alerts.matchesCount", "{n} matches", { n: match.count.toLocaleString() })}
              </Badge>
              {alert.max_price && match.cheapest ? (
                <TargetPriceChip targetPrice={alert.max_price} cheapest={match.cheapest} />
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
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
            onClick={() => setConfirmOpen(true)}
            disabled={deleting}
            aria-label={t("alerts.deleteAria", "Delete alert for {label}", { label })}
            className="text-label-2 hover:bg-deal-high/10 hover:text-deal-high-text"
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>

      <details className="group border-t border-separator">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-caption font-semibold uppercase tracking-caps text-label-2 transition-colors duration-short hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0">{t("alerts.perAlertChannels", "Channels")}</span>
            <span className="truncate font-medium normal-case tracking-normal text-foreground">{channelSummary}</span>
            <span className="num shrink-0 font-medium tracking-normal text-label-2">
              · {deliveryMode === "digest" ? t("alerts.digestMode", "Digest (07:00 daily)") : t("alerts.instantMode", "Instant")}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className="h-4 w-4 shrink-0 transition-transform duration-short ease-standard group-open:rotate-180"
          />
        </summary>
        <div className="space-y-3 px-4 pb-4 pt-1 sm:px-5">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("alerts.perAlertChannels", "Channels")}>
            {ALL_CHANNELS.map((channel) => (
              <Chip
                key={channel}
                selected={activeChannels.has(channel)}
                disabled={!onChannelsChange || savingChannels}
                onClick={() => void toggleChannel(channel)}
                className="h-8 px-3 text-caption"
              >
                {channelLabel(channel)}
              </Chip>
            ))}
            <Chip
              disabled={!onChannelsChange || savingChannels}
              onClick={() => void cycleDelivery()}
              aria-label={`${t("alerts.deliveryMode", "Delivery")}: ${deliveryMode === "digest" ? t("alerts.digestMode", "Digest (07:00 daily)") : t("alerts.instantMode", "Instant")}`}
              title={t(
                "alerts.quietHoursNote",
                "Quiet hours 21:00–07:00 Asia/Colombo: email, WhatsApp, Telegram & push queue for the 07:00 digest. In-app always delivers.",
              )}
              className="num h-8 px-3 text-caption"
            >
              {deliveryMode === "digest" ? t("alerts.digestMode", "Digest (07:00 daily)") : t("alerts.instantMode", "Instant")}
            </Chip>
          </div>
          {alert.notify_phone || alert.notify_email || alert.notify_telegram_chat_id ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {alert.notify_phone ? <Badge variant="success" className="num">WhatsApp {alert.notify_phone}</Badge> : null}
              {alert.notify_email ? <Badge variant="info">{alert.notify_email}</Badge> : null}
              {alert.notify_telegram_chat_id ? <Badge variant="info">Telegram {alert.notify_telegram_chat_id}</Badge> : null}
            </div>
          ) : null}
        </div>
      </details>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("alerts.deleteTitle", "Delete this alert?")}</DialogTitle>
            <DialogDescription>
              {t("alerts.deleteBody", "“{label}” will stop watching the market. This can’t be undone.", { label })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button type="button" variant="destructive" loading={deleting} onClick={() => void handleDelete()}>
              {t("common.delete", "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
