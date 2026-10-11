import { TrendingDown, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAppPreferences } from "@/lib/appPreferences";

/**
 * Dismissible market-update strip at the top of the homepage.
 * HyperUI "announcement banner" pattern, Apex M tokens (deliberate dark strip).
 */
export function AnnouncementBanner() {
  const { t } = useAppPreferences();
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="bg-[#09090B] text-white">
      <div className="mx-auto flex max-w-[1560px] items-center gap-3 px-5 py-2.5 sm:px-6">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-deal-green/15">
          <TrendingDown className="h-4 w-4 text-deal-green" aria-hidden />
        </span>
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {t(
            "banner.marketUpdate",
            "Market update — fresh underpriced listings flagged daily across ikman, riyasewana and patpat.",
          )}
        </p>
        <Link
          to="/best-picks"
          className="hidden shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-white no-underline transition hover:bg-primary/90 sm:inline-block"
        >
          {t("banner.viewDeals", "View deals")}
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("banner.dismiss", "Dismiss announcement")}
          className="shrink-0 rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
