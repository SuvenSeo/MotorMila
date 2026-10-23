import { FAST_DOM_DAYS, SLOW_DOM_DAYS, resolveVelocity, type VelocityBand } from "@/lib/velocity";
import { cn } from "@/lib/utils";

export interface VelocityBadgeProps {
  /** Stats-provided median days-on-market (preferred when available). */
  medianDomDays?: number | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  className?: string;
}

const TONE: Record<Exclude<VelocityBand, "unknown">, string> = {
  fast: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  steady: "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  slow: "border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-300",
};

const LABEL: Record<Exclude<VelocityBand, "unknown">, string> = {
  fast: `Fast <${FAST_DOM_DAYS}d`,
  steady: "Steady",
  slow: `Slow >${SLOW_DOM_DAYS}d`,
};

/**
 * Liquidity badge: Fast <21d / Slow >65d from stats median DOM,
 * falling back to listing first/last-seen DOM lengths. Renders nothing
 * when no velocity signal is available.
 */
export function VelocityBadge({ medianDomDays, firstSeenAt, lastSeenAt, className }: VelocityBadgeProps) {
  const { domDays, band } = resolveVelocity({ medianDomDays, firstSeenAt, lastSeenAt });
  if (band === "unknown") return null;

  return (
    <span
      title={domDays !== null ? `~${domDays} days on market` : "Velocity signal"}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-caption font-medium",
        TONE[band],
        className,
      )}
    >
      {LABEL[band]}
    </span>
  );
}
