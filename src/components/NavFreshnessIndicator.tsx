import { useMemo } from "react";
import { Clock3 } from "lucide-react";
import { usePipelineStatus } from "@/hooks/usePipelineStatus";
import { useAppPreferences } from "@/lib/appPreferences";
import { formatRelativeTimeI18n } from "@/lib/formatting";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Small data-freshness hint for the header (replaces the unlabeled "Delayed"
 * pill). Renders nothing while listings are current or the status is still
 * loading — it only appears when updates are actually behind, and always says
 * what that means.
 */
export function NavFreshnessIndicator() {
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

  const ago = latestSyncIso ? formatRelativeTimeI18n(latestSyncIso, t) : null;
  const short = t("shell.fresh.short", "Updates behind");
  const explain = ago
    ? t("shell.fresh.explainAgo", "Listings last updated {ago}. New ads and price changes can take a few hours to show here.", { ago })
    : t("shell.fresh.explain", "Listing updates are running behind. New ads and price changes can take a few hours to show here.");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="hidden h-9 items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/[0.08] px-2.5 text-[12px] font-medium text-amber-700 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:text-amber-300 md:inline-flex"
          aria-label={`${short}. ${explain}`}
        >
          <Clock3 className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden xl:inline">{ago ? t("shell.fresh.updatedAgo", "Updated {ago}", { ago }) : short}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[260px] text-[12px] leading-relaxed">
        {explain}
      </TooltipContent>
    </Tooltip>
  );
}
