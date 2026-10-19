import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Crown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppPreferences } from "@/lib/appPreferences";
import { trackEvent } from "@/lib/analytics";

type UpgradePromptProps = {
  title: string;
  body: string;
  className?: string;
  /** Compact inline strip vs full card */
  variant?: "card" | "strip";
  ctaLabel?: string;
};

/** Premium upgrade nudge used at free-plan ceilings. */
export function UpgradePrompt({
  title,
  body,
  className,
  variant = "card",
  ctaLabel,
}: UpgradePromptProps) {
  const { t } = useAppPreferences();
  const resolvedCta = ctaLabel ?? t("upgrade.cta", "Join the waitlist");

  // Paywall funnel: one view event per prompt mount.
  useEffect(() => {
    trackEvent("paywall_view", { source: "upgrade_prompt", variant, title });
  }, [variant, title]);

  const onCtaClick = () => {
    trackEvent("paywall_click", { source: "upgrade_prompt", variant, title, cta: "join_waitlist" });
  };

  if (variant === "strip") {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-[linear-gradient(105deg,hsl(var(--primary)/0.10),hsl(var(--primary)/0.03)_55%,transparent)] px-4 py-3.5 shadow-soft",
          className,
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{body}</p>
          </div>
        </div>
        <Link
          to="/pricing"
          onClick={onCtaClick}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground no-underline shadow-soft transition-all hover:bg-primary/95 active:scale-[0.98]"
        >
          <Crown className="h-3.5 w-3.5" aria-hidden />
          {resolvedCta}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div className={cn("premium-surface p-6 text-center shadow-soft-lg sm:p-8", className)}>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[12px] font-semibold text-primary-bright">
        <Crown className="h-3 w-3" aria-hidden />
        {t("upgrade.proUnlock", "Pro unlock")}
      </span>
      <h3 className="mt-4 font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      <Link
        to="/pricing"
        onClick={onCtaClick}
        className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-[13px] font-semibold text-primary-foreground no-underline shadow-soft transition-all hover:bg-primary/95 active:scale-[0.98]"
      >
        {resolvedCta}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
