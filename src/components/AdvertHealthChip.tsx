import {
  computeAdvertHealth,
  type AdvertHealthBand,
  type AdvertHealthListingLike,
} from "@/lib/advertHealth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface AdvertHealthChipProps {
  listing: AdvertHealthListingLike;
  className?: string;
}

const TONE: Record<AdvertHealthBand, "success" | "warning" | "danger"> = {
  strong: "success",
  fair: "warning",
  weak: "danger",
};

export function AdvertHealthChip({ listing, className }: AdvertHealthChipProps) {
  const result = computeAdvertHealth(listing);

  return (
    <Badge title={result.detail} variant={TONE[result.band]} className={cn("gap-1", className)}>
      <span className="num normal-case tracking-normal">{result.score}</span>
      Ad health
    </Badge>
  );
}
