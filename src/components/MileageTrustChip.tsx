import { computeMileageTrust, type MileageRiskLevel } from "@/lib/mileageTrust";
import { cn } from "@/lib/utils";
import { useAppPreferences } from "@/lib/appPreferences";

interface MileageTrustChipProps {
  mileageKm?: number | null;
  year?: number | null;
  className?: string;
}

const TONE: Record<MileageRiskLevel, string> = {
  low: "border-deal-good/25 bg-deal-good/10 text-deal-good-text",
  medium: "border-deal-caution/25 bg-deal-caution/10 text-deal-caution-text",
  high: "border-deal-high/25 bg-deal-high/10 text-deal-high-text",
  unknown: "border-border bg-surface text-muted-foreground",
};

export function MileageTrustChip({ mileageKm, year, className }: MileageTrustChipProps) {
  const { t } = useAppPreferences();
  const trust = computeMileageTrust({ mileageKm, year }, t);

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
