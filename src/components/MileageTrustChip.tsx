import { computeMileageTrust, type MileageRiskLevel } from "@/lib/mileageTrust";
import { cn } from "@/lib/utils";

interface MileageTrustChipProps {
  mileageKm?: number | null;
  year?: number | null;
  className?: string;
}

const TONE: Record<MileageRiskLevel, string> = {
  low: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  medium: "border-amber-500/25 bg-amber-500/10 text-amber-200",
  high: "border-rose-500/25 bg-rose-500/10 text-rose-300",
  unknown: "border-border bg-surface text-muted-foreground",
};

export function MileageTrustChip({ mileageKm, year, className }: MileageTrustChipProps) {
  const trust = computeMileageTrust({ mileageKm, year });

  return (
    <span
      title={trust.detail}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-1 text-caption font-medium",
        TONE[trust.risk],
        className,
      )}
    >
      {trust.label}
    </span>
  );
}
