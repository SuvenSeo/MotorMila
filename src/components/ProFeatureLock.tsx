import { type ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";
import { Bell, Lock } from "lucide-react";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";

type ProFeatureLockProps = {
  children: ReactNode;
  /** Short name of the locked feature, shown in the "coming with Pro" line */
  label?: string;
  className?: string;
  /** Compact lock for inline controls (selects, chips) — no long trial copy. */
  density?: "default" | "compact";
  /** When true, always show content (e.g. admin preview). Defaults to hasProAccess. */
  unlocked?: boolean;
};

/**
 * Gates Pro surfaces for free-plan users. Locked content is not rendered (no
 * blurred teasers); a short "Pro · coming soon — Notify me" line takes its place.
 * Admins and Pro/Enterprise subscribers see the real content.
 */
export function ProFeatureLock({
  children,
  label = "Pro feature",
  className,
  density = "default",
  unlocked,
}: ProFeatureLockProps) {
  const { hasProAccess, isAdmin } = useAuth();
  const { t } = useAppPreferences();
  const open = unlocked ?? (hasProAccess || isAdmin);

  // Paywall funnel: fire once per label when the lock is actually shown.
  useEffect(() => {
    if (open) return;
    trackEvent("paywall_view", { source: "pro_feature_lock", label, density });
  }, [open, label, density]);

  const onCtaClick = () => {
    trackEvent("paywall_click", { source: "pro_feature_lock", label, density, cta: "notify_me" });
  };

  if (open) {
    return <>{children}</>;
  }

  // Locked: no blurred teaser of content we won't show. One honest line instead,
  // in the site-wide Pro voice: free during beta, Pro coming soon, notify me.
  if (density === "compact") {
    return (
      <Link
        to="/pricing#get-started"
        onClick={onCtaClick}
        className={cn(
          "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-dashed border-border bg-foreground/[0.02] px-3 text-caption font-semibold text-muted-foreground no-underline transition-colors hover:border-primary/30 hover:text-foreground",
          className,
        )}
        title={t("shell.pro.lockBody", "This will be part of Pro. Everything else on MotorMila is free during beta.")}
      >
        <Lock className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
        {/* Never "Pro · Pro" when the label already is the plan name. */}
        {label.trim().toLowerCase() !== t("common.pro", "Pro").trim().toLowerCase() ? (
          <span className="shrink-0 text-caption font-medium text-muted-foreground/80">· {t("common.pro", "Pro")}</span>
        ) : null}
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-foreground/[0.02] px-4 py-3.5",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-footnote font-semibold text-foreground">
            {label}{" "}
            <span className="ml-1 rounded-full border border-border px-2 py-0.5 text-caption font-medium text-muted-foreground">
              {t("shell.pro.badge", "Pro · coming soon")}
            </span>
          </p>
          <p className="mt-1 text-caption leading-relaxed text-muted-foreground">
            {t("shell.pro.lockBody", "This will be part of Pro. Everything else on MotorMila is free during beta.")}
          </p>
        </div>
      </div>
      <Link
        to="/pricing#get-started"
        onClick={onCtaClick}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-caption font-semibold text-foreground no-underline transition-colors hover:border-primary/35"
      >
        <Bell className="h-3.5 w-3.5" aria-hidden />
        {t("shell.pro.notify", "Notify me")}
      </Link>
    </div>
  );
}
