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
      ? "border-deal-good/30 bg-deal-good/10 text-deal-good-text"
      : badge.kind === "at_cliff"
        ? "border-deal-caution/30 bg-deal-caution/10 text-deal-caution-text"
        : "border-deal-high/30 bg-deal-high/10 text-deal-high-text";

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
