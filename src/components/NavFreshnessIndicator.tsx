import { useMemo } from "react";
import { Clock3 } from "lucide-react";
import { usePipelineStatus } from "@/hooks/usePipelineStatus";
import { useAppPreferences } from "@/lib/appPreferences";
import { formatRelativeTimeI18n } from "@/lib/formatting";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Header data-freshness hint. Renders nothing while listings are current or
 * the status is loading. When updates are behind it is a small neutral clock
 * icon with a dot and an explanatory tooltip; it only turns amber once the
 * last successful update is more than 24h old.
 */
export function NavFreshnessIndicator({ className }: { className?: string }) {
  const status = usePipelineStatus();
  const { t } = useAppPreferences();

  const latestSyncIso = useMemo(() => {
    if (!status?.jobs?.length) return null;
    return (
      status.jobs
        .map((job) => job.last_success || job.last_run)
        .filter((v): v is string => Boolean(v))
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null
    );
  }, [status]);

  if (status?.overall_status !== "delayed") return null;

  const ageMs = latestSyncIso ? Date.now() - new Date(latestSyncIso).getTime() : null;
  const stale = ageMs === null || ageMs > STALE_MS;
  const ago = latestSyncIso ? formatRelativeTimeI18n(latestSyncIso, t) : null;
  const short = stale ? t("shell.fresh.stale", "Listings may be out of date") : t("shell.fresh.short", "Updates behind");
  const explain = ago
    ? t("shell.fresh.explainAgo", "Listings last updated {ago}. New ads and price changes can take a few hours to show here.", { ago })
    : t("shell.fresh.explain", "Listing updates are running behind. New ads and price changes can take a few hours to show here.");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-stale={stale}
          className={cn("nav-control nav-control--icon relative hidden md:inline-flex", className)}
          aria-label={`${short}. ${explain}`}
        >
          <Clock3 className="h-4 w-4" aria-hidden />
          <span
            aria-hidden
            className={cn(
              "absolute right-[7px] top-[7px] h-1.5 w-1.5 rounded-full ring-2 ring-background",
              stale ? "bg-deal-caution" : "bg-muted-foreground/60",
            )}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[260px] text-caption leading-relaxed">
        <p className="font-semibold">{ago ? t("shell.fresh.updatedAgo", "Updated {ago}", { ago }) : short}</p>
        <p className="mt-0.5 text-muted-foreground">{explain}</p>
      </TooltipContent>
    </Tooltip>
  );
}
