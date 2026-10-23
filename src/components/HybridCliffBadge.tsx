import { getHybridCliffBadge } from "@/lib/importTaxModel";
import { cn } from "@/lib/utils";

interface HybridCliffBadgeProps {
  fuelType?: string | null;
  engineCc?: number | null;
  className?: string;
  compact?: boolean;
}

export function HybridCliffBadge({
  fuelType,
  engineCc,
  className,
  compact = false,
}: HybridCliffBadgeProps) {
  const badge = getHybridCliffBadge(fuelType, engineCc);
  if (!badge) return null;

  const tone =
    badge.kind === "tax_safe"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : badge.kind === "at_cliff"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
        : "border-rose-500/30 bg-rose-500/10 text-rose-300";

  return (
    <span
      title={badge.detail}
      className={cn(
        "inline-flex items-center rounded-full border font-semibold tracking-tight",
        compact ? "px-1.5 py-0.5 text-caption" : "px-2 py-1 text-caption",
        tone,
        className,
      )}
    >
      {badge.label}
    </span>
  );
}
