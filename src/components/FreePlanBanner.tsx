import { Link } from "react-router-dom";
import { Crown, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";

/** Compact plan callout for free users browsing the gated product. */
export function FreePlanBanner() {
  const { user, hasProAccess, isAdmin } = useAuth();
  const { t } = useAppPreferences();
  if (!user || hasProAccess || isAdmin) return null;

  return (
    <div className="relative border-b border-primary/15 bg-[linear-gradient(90deg,hsl(var(--primary)/0.08),hsl(var(--primary)/0.03)_45%,hsl(var(--primary)/0.08))]">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
        <p className="flex items-center gap-2.5 text-[12px] font-medium text-foreground">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
          </span>
          <span>
            {t("freeBanner.body", "Free plan: every page is open, with soft limits on depth. Pro unlocks full feeds, scores, history, and exports.")}
          </span>
        </p>
        <Link
          to="/pricing"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground no-underline shadow-soft transition-all hover:bg-primary/95 active:scale-[0.98]"
        >
          <Crown className="h-3.5 w-3.5" aria-hidden />
          {t("common.upgrade", "Upgrade")}
        </Link>
      </div>
    </div>
  );
}
