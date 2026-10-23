import { computeSellSpeed, type SellSpeedBand, type SellSpeedListingLike } from "@/lib/sellSpeed";
import { cn } from "@/lib/utils";

interface SellSpeedChipProps {
  listing: SellSpeedListingLike;
  className?: string;
}

const TONE: Record<SellSpeedBand, string> = {
  fast: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  moderate: "border-amber-500/25 bg-amber-500/10 text-amber-200",
  slow: "border-rose-500/25 bg-rose-500/10 text-rose-300",
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
