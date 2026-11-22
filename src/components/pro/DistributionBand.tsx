import { cn } from "@/lib/utils";
import { clamp01 } from "@/lib/proAnalytics";

/**
 * A price range drawn to scale: the min–max band, the interquartile block where
 * the data supports it, a median rule, and optionally the position of one
 * listing inside that band. This is the "where does this price sit" primitive —
 * far more useful to a buyer than a lone median.
 */
export function DistributionBand({
  min,
  max,
  median,
  p25,
  p75,
  marker,
  markerLabel,
  format,
  className,
  size = "md",
}: {
  min: number | null | undefined;
  max: number | null | undefined;
  median?: number | null;
  p25?: number | null;
  p75?: number | null;
  /** A value to pin inside the band (a listing's price, a district median). */
  marker?: number | null;
  markerLabel?: string;
  format: (value: number) => string;
  className?: string;
  size?: "sm" | "md";
}) {
  if (min == null || max == null || max <= min) {
    return <p className={cn("text-caption text-label-3", className)}>Range unavailable</p>;
  }
  const span = max - min;
  const at = (value: number) => clamp01((value - min) / span) * 100;
  const q1 = p25 != null && p25 > min ? at(p25) : 25;
  const q3 = p75 != null && p75 < max ? at(p75) : 75;
  const medianAt = median != null ? at(median) : null;
  const markerAt = marker != null ? at(marker) : null;
  const height = size === "sm" ? "h-1.5" : "h-2.5";
  const summary = [
    marker != null ? `${markerLabel ?? "Value"} ${format(marker)}` : null,
    `range ${format(min)} to ${format(max)}`,
    median != null ? `median ${format(median)}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className={cn("min-w-0", className)}>
      <div className={cn("relative w-full rounded-full bg-surface-3", height)} role="img" aria-label={summary} title={summary}>
        <div
          aria-hidden
          className="absolute inset-y-0 rounded-full bg-primary/25"
          style={{ left: `${q1}%`, width: `${Math.max(2, q3 - q1)}%` }}
        />
        {medianAt != null ? (
          <span aria-hidden className="absolute inset-y-0 w-px bg-foreground/55" style={{ left: `${medianAt}%` }} />
        ) : null}
        {markerAt != null ? (
          <span
            aria-hidden
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow-e1"
            style={{ left: `${markerAt}%` }}
          />
        ) : null}
      </div>
      {size === "md" ? (
        <div className="mt-1.5 flex justify-between text-caption tabular-nums text-label-3">
          <span>{format(min)}</span>
          {median != null ? <span className="font-semibold text-label-2">median {format(median)}</span> : <span />}
          <span>{format(max)}</span>
        </div>
      ) : null}
    </div>
  );
}
