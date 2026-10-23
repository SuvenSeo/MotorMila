import { computeSellSpeed, type SellSpeedBand, type SellSpeedListingLike } from "@/lib/sellSpeed";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface SellSpeedChipProps {
  listing: SellSpeedListingLike;
  className?: string;
}

const TONE: Record<SellSpeedBand, "success" | "warning" | "danger"> = {
  fast: "success",
  moderate: "warning",
  slow: "danger",
};

export function SellSpeedChip({ listing, className }: SellSpeedChipProps) {
  const result = computeSellSpeed(listing);

  return (
    <Badge title={result.detail} variant={TONE[result.band]} className={cn("gap-1", className)}>
      <span className="num normal-case tracking-normal">{result.score}</span>
      Sell speed
    </Badge>
  );
}
