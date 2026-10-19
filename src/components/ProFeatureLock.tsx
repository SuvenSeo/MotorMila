import { type ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";
import { Crown, Lock } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";

type ProFeatureLockProps = {
  children: ReactNode;
  /** Short label shown on the blur overlay */
  label?: string;
  className?: string;
  /** Compact lock for inline controls (selects, chips) — no long trial copy. */
  density?: "default" | "compact";
  /** When true, always show content (e.g. admin preview). Defaults to hasProAccess. */
  unlocked?: boolean;
};

/**
 * Blurs / locks premium surfaces for free-plan users while keeping layout visible.
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
  const open = unlocked ?? (hasProAccess || isAdmin);

  // Paywall funnel: fire once per label when the lock is actually shown.
  useEffect(() => {
    if (open) return;
    trackEvent("paywall_view", { source: "pro_feature_lock", label, density });
  }, [open, label, density]);

  const onCtaClick = () => {
    trackEvent("paywall_click", { source: "pro_feature_lock", label, density, cta: "join_waitlist" });
  };

  if (open) {
    return <>{children}</>;
  }

  if (density === "compact") {
    return (
      <div className={cn("relative overflow-hidden rounded-full", className)}>
        <div className="pointer-events-none select-none blur-[6px] opacity-40 saturate-[0.7]" aria-hidden>
          {children}
        </div>
        <Link
          to="/pricing"
          onClick={onCtaClick}
          className="absolute inset-0 z-10 inline-flex items-center justify-center gap-1.5 rounded-full bg-background/55 px-3 text-[11px] font-semibold text-foreground no-underline backdrop-blur-[6px] transition-colors hover:bg-background/70"
        >
          <Lock className="h-3 w-3 text-primary-bright" aria-hidden />
          <span className="truncate">{label}</span>
        </Link>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-2xl", className)}>
      <div className="pointer-events-none select-none blur-[7px] opacity-55 saturate-[0.85]" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/60 px-5 text-center backdrop-blur-[3px]">
        <div className="rounded-2xl border border-primary/25 bg-card/90 px-6 py-5 shadow-soft-lg backdrop-blur-md">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[12px] font-semibold text-primary-bright">
            <Lock className="h-3 w-3" aria-hidden />
            {label}
          </span>
          <p className="mx-auto mt-3 max-w-xs text-[13px] font-medium leading-relaxed text-muted-foreground">
            Join the waitlist for full lane intelligence, exports, and deeper market tools at launch.
          </p>
          <Link
            to="/pricing"
            onClick={onCtaClick}
            className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-[12px] font-semibold text-primary-foreground no-underline shadow-soft transition-all hover:bg-primary/95 active:scale-[0.98]"
          >
            <Crown className="h-3.5 w-3.5" aria-hidden />
            Join the waitlist
          </Link>
        </div>
      </div>
    </div>
  );
}
