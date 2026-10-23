import { computeSellSpeed, type SellSpeedBand, type SellSpeedListingLike } from "@/lib/sellSpeed";
import { cn } from "@/lib/utils";

interface SellSpeedChipProps {
  listing: SellSpeedListingLike;
  className?: string;
}

const TONE: Record<SellSpeedBand, string> = {
  fast: "border-deal-good/25 bg-deal-good/10 text-deal-good-text",
  moderate: "border-deal-caution/25 bg-deal-caution/10 text-deal-caution-text",
  slow: "border-deal-high/25 bg-deal-high/10 text-deal-high-text",
};

export function SellSpeedChip({ listing, className }: SellSpeedChipProps) {
  const result = computeSellSpeed(listing);

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
      Sell speed
    </span>
  );
}
