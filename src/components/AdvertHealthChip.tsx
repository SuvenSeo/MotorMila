import {
  computeAdvertHealth,
  type AdvertHealthBand,
  type AdvertHealthListingLike,
} from "@/lib/advertHealth";
import { cn } from "@/lib/utils";

interface AdvertHealthChipProps {
  listing: AdvertHealthListingLike;
  className?: string;
}

const TONE: Record<AdvertHealthBand, string> = {
  strong: "border-deal-good/25 bg-deal-good/10 text-deal-good-text",
  fair: "border-deal-caution/25 bg-deal-caution/10 text-deal-caution-text",
  weak: "border-deal-high/25 bg-deal-high/10 text-deal-high-text",
};

export function AdvertHealthChip({ listing, className }: AdvertHealthChipProps) {
  const result = computeAdvertHealth(listing);

  return (
    <span
      title={result.detail}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-caption font-medium",
        TONE[result.band],
        className,
      )}
    >
      <span className="num normal-case tracking-normal">{result.score}</span>
      Ad health
    </span>
  );
}
