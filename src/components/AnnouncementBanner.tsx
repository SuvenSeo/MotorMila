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
  // Translucent ink card floating over the hero: `theme-dark` scopes the dark
  // tokens so colours stay AA in light mode too.
  return (
    <div className="theme-dark text-foreground">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-background px-3.5 py-2 shadow-soft sm:px-4">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-deal-good/15">
          <TrendingDown className="h-4 w-4 text-deal-good-text" aria-hidden />
        </span>
        <p className="min-w-0 flex-1 truncate text-footnote font-medium">
          {t(
            "banner.marketUpdate",
            "Market update — fresh underpriced listings flagged daily across ikman, riyasewana and patpat.",
          )}
        </p>
        <Link
          to="/best-picks"
          className="hidden shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-footnote font-semibold text-primary-foreground no-underline transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:inline-block"
        >
          {t("banner.viewDeals", "View deals")}
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("banner.dismiss", "Dismiss announcement")}
          className="shrink-0 rounded-full p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
