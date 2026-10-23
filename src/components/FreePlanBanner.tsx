import { Link } from "react-router-dom";
import { Bell, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";

/** Compact plan callout for free users browsing the gated product. */
export function FreePlanBanner() {
  const { user, hasProAccess, isAdmin } = useAuth();
  const { t } = useAppPreferences();
  if (!user || hasProAccess || isAdmin) return null;

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-background px-3.5 py-2 shadow-soft sm:px-4">
        <p className="flex items-center gap-2.5 text-caption font-medium text-foreground">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
          </span>
          <span>
            {t("shell.pro.freeBanner", "MotorMila is free during beta. Pro tools like full history and exports are coming soon.")}
          </span>
        </p>
        <Link
          to="/pricing#get-started"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-caption font-semibold text-primary-foreground no-underline shadow-soft transition-ui hover:bg-primary/95 active:scale-[0.98]"
        >
          <Bell className="h-3.5 w-3.5" aria-hidden />
          {t("shell.pro.notify", "Notify me")}
        </Link>
      </div>
    </div>
  );
}
