import { memo } from "react";
import type { PricePoint } from "@/lib/priceHistory";
import { cn } from "@/lib/utils";

interface PriceSparklineProps {
  points: PricePoint[];
  width?: number;
  height?: number;
  className?: string;
  /** Accessible summary, e.g. "Price fell from Rs 9.1M to Rs 8.7M". */
  label: string;
}

/**
 * Dependency-free SVG sparkline (no chart vendor on the card path).
 * Step line, since asking prices change in discrete edits.
 * Colour: Deal Green when the path ends lower, brand blue otherwise.
 */
export const PriceSparkline = memo(function PriceSparkline({
  points,
  width = 72,
  height = 22,
  className,
  label,
}: PriceSparklineProps) {
  if (points.length < 2) return null;
  const pad = 2;
  const minT = points[0].at;
  const maxT = points[points.length - 1].at;
  const prices = points.map((p) => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const spanT = Math.max(1, maxT - minT);
  const spanP = Math.max(1, maxP - minP);
  const x = (t: number) => pad + ((t - minT) / spanT) * (width - pad * 2);
  const y = (p: number) => pad + (1 - (p - minP) / spanP) * (height - pad * 2);

  let d = `M${x(points[0].at).toFixed(1)},${y(points[0].price).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` H${x(points[i].at).toFixed(1)} V${y(points[i].price).toFixed(1)}`;
  }
  const ended = points[points.length - 1];
  const down = ended.price < points[0].price;

  return (
    <svg
      role="img"
      aria-label={label}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("shrink-0 overflow-visible", down ? "text-deal-green" : "text-primary", className)}
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(ended.at)} cy={y(ended.price)} r={2.2} fill="currentColor" />
    </svg>
  );
});
