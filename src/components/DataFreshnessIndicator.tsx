import { AlertTriangle, Clock3 } from "lucide-react";
import { getListingDataFreshness, type ListingDataFreshness } from "@/lib/dataFreshness";
import { cn } from "@/lib/utils";
import { useStaleBannerSlot } from "@/lib/staleBannerSlot";
import { useAppPreferences } from "@/lib/appPreferences";
import type { TranslateFn } from "@/lib/translate";

type DataFreshnessIndicatorProps = {
  latestListingAt?: string | null;
  lastUpdated?: string | null;
  variant?: "badge" | "subline" | "banner";
  className?: string;
  now?: Date;
};

function toneClasses(tone: ListingDataFreshness["tone"]) {
  if (tone === "stale") {
    return {
      dot: "bg-primary",
      text: "text-primary-bright",
      border: "border-primary/25 bg-primary/10",
    };
  }
  if (tone === "live") {
    return {
      dot: "bg-primary",
      text: "text-muted-foreground",
      border: "border-border bg-foreground/[0.03]",
    };
  }
  return {
    dot: "bg-muted-foreground/70",
    text: "text-muted-foreground",
    border: "border-border bg-foreground/[0.03]",
  };
}

export function DataFreshnessIndicator({
  latestListingAt,
  lastUpdated,
  variant = "badge",
  className,
  now,
}: DataFreshnessIndicatorProps) {
  const { t } = useAppPreferences();
  const freshness = getListingDataFreshness({ latestListingAt, lastUpdated, now, t });
  const tone = toneClasses(freshness.tone);
  // Only one stale-data banner per page, whoever asks first (snapshot notice wins).
  const ownsBannerSlot = useStaleBannerSlot(variant === "banner" && freshness.isStale, 0);

  if (variant === "banner" && freshness.isStale && ownsBannerSlot) {
    return (
      <div
        className={cn(
          "flex items-start gap-2 rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-2.5",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-bright" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-caption font-semibold text-primary-bright">{freshness.staleNotice}</p>
          <p className="mt-0.5 text-caption text-muted-foreground">
            {freshness.dataAsOfLabel}
            {freshness.listingAt && freshness.statsAt && freshness.listingAt !== freshness.statsAt ? (
              <span className="ml-1">{t("freshness.statsRefreshed", "· stats refreshed {age}", { age: formatStatsNote(freshness, t, now) })}</span>
            ) : null}
          </p>
        </div>
      </div>
    );
  }

  if (variant === "banner") {
    return null;
  }

  if (variant === "subline") {
    return (
      <p
        className={cn("tech-label text-muted-foreground", className)}
        title={freshness.primaryAt ? freshness.absoluteLabel : undefined}
      >
        {freshness.dataAsOfLabel}
        {freshness.listingAt && freshness.statsAt && freshness.listingAt !== freshness.statsAt ? (
          <span>{t("freshness.statsNote", " · stats {age}", { age: formatStatsNote(freshness, t, now) })}</span>
        ) : null}
        {freshness.isStale ? <span className="text-primary-bright">{t("freshness.staleSuffix", " · stale")}</span> : null}
      </p>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-caption font-medium",
        tone.border,
        tone.text,
        className,
      )}
      title={freshness.primaryAt ? freshness.absoluteLabel : undefined}
      role="status"
      aria-live="polite"
    >
      {freshness.isStale ? (
        <Clock3 className="h-3 w-3 shrink-0 text-primary-bright" aria-hidden="true" />
      ) : (
        <span className="relative flex h-2 w-2 shrink-0">
          {freshness.tone === "live" ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          ) : null}
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", tone.dot)} />
        </span>
      )}
      {freshness.isStale ? (
        <span>{t("freshness.staleBadge", "Stale · {age} old", { age: freshness.compactLabel })}</span>
      ) : (
        <span>{freshness.dataAsOfLabel}</span>
      )}
    </span>
  );
}

function formatStatsNote(freshness: ListingDataFreshness, t: TranslateFn, now?: Date) {
  if (!freshness.statsAt) return t("freshness.pending", "pending");
  return getListingDataFreshness({ lastUpdated: freshness.statsAt, now, t }).relativeLabel;
}
