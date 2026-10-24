import * as React from "react";
import type { Format } from "@number-flow/react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { compactLkrParts } from "@/components/motion/FlowNumber";
import { formatLkrCompact } from "@/lib/price";

/**
 * Flowing number: the kit AnimatedNumber (tabular figures, motion tokens,
 * instant under reduced motion / low data). number-flow renders its value as
 * text and exposes it to assistive tech; `label` is the same value as plain
 * text, used as the tooltip so a copy/hover shows the formatted figure.
 */
export function FlowValue({
  value,
  label,
  format,
  prefix,
  suffix,
  className,
}: {
  value: number;
  label: string;
  format?: Format;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", className)} title={label}>
      <AnimatedNumber value={value} format={format} prefix={prefix} suffix={suffix} locales="en-US" />
    </span>
  );
}

/** Compact LKR ("Rs 8.5 Mn") that rolls on change. Missing → "—", never "Rs 0". */
export function LkrValue({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return <span className={cn("text-label-2", className)}>—</span>;
  }
  const parts = compactLkrParts(value);
  return (
    <FlowValue
      value={parts.value}
      prefix="Rs "
      suffix={parts.suffix}
      format={parts.format}
      label={formatLkrCompact(value)}
      className={className}
    />
  );
}

/** Whole-number count with grouping that rolls on change. Missing → "—". */
export function CountValue({ value, className, suffix }: { value: number | null | undefined; className?: string; suffix?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className={cn("text-label-2", className)}>—</span>;
  return (
    <FlowValue
      value={value}
      suffix={suffix}
      format={{ maximumFractionDigits: 0, useGrouping: true }}
      label={`${value.toLocaleString("en-US")}${suffix ?? ""}`}
      className={className}
    />
  );
}

type StatTileProps = {
  label: React.ReactNode;
  /** The figure (use LkrValue / CountValue / FlowValue for numbers). */
  value: React.ReactNode;
  hint?: React.ReactNode;
  loading?: boolean;
  /** md: grid KPI (title2). lg: the one headline number (large). */
  size?: "md" | "lg";
  /** Extra content under the figure (badge, sparkline). */
  children?: React.ReactNode;
  className?: string;
};

/**
 * StatTile — the KPI card for data pages: caption label, display figure,
 * caption hint. Loading keeps the same footprint (no layout shift).
 */
export function StatTile({ label, value, hint, loading, size = "md", children, className }: StatTileProps) {
  const lg = size === "lg";
  return (
    <Card padding={lg ? "lg" : "md"} className={cn("min-w-0", className)}>
      <p className="text-footnote font-medium text-label-2">{label}</p>
      {loading ? (
        <div aria-hidden className="mt-2 space-y-2">
          <Skeleton shape="title" className={cn(lg ? "h-12 w-1/2" : "h-8 w-2/3")} />
          {hint ? <Skeleton shape="text" className="h-3 w-1/2" /> : null}
        </div>
      ) : (
        <div className="content-in">
          <p
            className={cn(
              "mt-1.5 font-display font-semibold text-foreground [overflow-wrap:anywhere]",
              lg ? "text-large" : "text-title2",
            )}
          >
            {value}
          </p>
          {hint ? <p className="mt-1 text-caption text-label-2">{hint}</p> : null}
          {children}
        </div>
      )}
    </Card>
  );
}
