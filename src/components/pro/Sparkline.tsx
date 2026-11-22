import { memo, useId } from "react";
import { cn } from "@/lib/utils";
import { normalize } from "@/lib/proAnalytics";

type Tone = "primary" | "up" | "down" | "neutral";

const TONE_STROKE: Record<Tone, string> = {
  primary: "hsl(var(--primary))",
  up: "hsl(var(--deal-caution))",
  down: "hsl(var(--deal-good))",
  neutral: "hsl(var(--label-2))",
};

/**
 * A dependency-free SVG sparkline for table cells and KPI tiles. Monotone
 * between points (an asking price does not wobble), 1.5px stroke, no axes, no
 * dots — it reads as a shape, not a chart. `tone="down"` is Deal Green because
 * a falling asking price is good news for a buyer.
 */
export const Sparkline = memo(function Sparkline({
  values,
  tone = "primary",
  width = 84,
  height = 24,
  className,
  label,
  fill = false,
}: {
  values: number[];
  tone?: Tone;
  width?: number;
  height?: number;
  className?: string;
  /** Accessible summary; the line itself is aria-hidden. */
  label: string;
  /** Soft area under the line, for a KPI tile rather than a table cell. */
  fill?: boolean;
}) {
  const gradientId = useId();
  if (values.length < 2) {
    return <span className={cn("text-caption text-label-3", className)} aria-hidden>–</span>;
  }
  const pad = 1.5;
  const points = normalize(values).map((value, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - value * (height - pad * 2);
    return [x, y] as const;
  });

  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 1; i < points.length; i += 1) {
    const [px, py] = points[i - 1];
    const [x, y] = points[i];
    const midX = (px + x) / 2;
    d += ` C ${midX.toFixed(2)} ${py.toFixed(2)}, ${midX.toFixed(2)} ${y.toFixed(2)}, ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  const stroke = TONE_STROKE[tone];
  const area = `${d} L ${points[points.length - 1][0].toFixed(2)} ${height} L ${points[0][0].toFixed(2)} ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={label}
      className={cn("overflow-visible", className)}
      preserveAspectRatio="none"
    >
      {fill ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} aria-hidden />
        </>
      ) : null}
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" aria-hidden />
    </svg>
  );
});
