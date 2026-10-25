import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { LineChart } from "lucide-react";
import type { TooltipContentProps } from "recharts";

import { cn } from "@/lib/utils";
import { duration, usePrefersReducedMotionOrLowData } from "@/lib/motion";
import { changeTone, type ChangeTone } from "@/lib/dataSanity";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

/**
 * Chart theme — the one Recharts look for every price-intelligence chart
 * (web/p1-data). Colours come from semantic tokens so light + dark both read;
 * ticks set in Cal Sans Text at caption size with tabular figures; the first
 * draw is capped at the `long` motion token (400ms) and never replays on a
 * filter change; tooltips sit on the kit surface (surface-1, hairline, e2).
 *
 * Usage:
 *   const draw = useChartDraw(points.length > 0);
 *   <ChartFrame state={state} heightClass="h-72"><ResponsiveContainer>…
 *     <CartesianGrid {...chartGrid} />
 *     <XAxis {...chartAxis} dataKey="label" />
 *     <Tooltip {...chartTooltip(calm)} content={(p) => <ChartTooltipCard {...p} … />} />
 *     <Area {...draw} stroke={chartColor.primary} />
 */

/** Token colours as CSS colour strings (usable in SVG fill/stroke). */
export const chartColor = {
  primary: "hsl(var(--primary))",
  /** Buyer-neutral change palette: price up = amber, down = green, stable = slate. */
  up: "hsl(var(--deal-caution))",
  down: "hsl(var(--deal-good))",
  stable: "hsl(var(--deal-fair))",
  /** Second series (archive, comparison) — quiet, still ≥3:1 on the card. */
  muted: "hsl(var(--deal-fair))",
  grid: "hsl(var(--separator))",
  axis: "hsl(var(--label-2))",
  surface: "hsl(var(--surface-1))",
  foreground: "hsl(var(--foreground))",
} as const;

export function toneColor(tone: ChangeTone): string {
  return tone === "up" ? chartColor.up : tone === "down" ? chartColor.down : chartColor.stable;
}

/** Badge variant for a change tone (kit Badge). */
export function toneBadge(tone: ChangeTone): "warning" | "success" | "neutral" {
  return tone === "up" ? "warning" : tone === "down" ? "success" : "neutral";
}

export function toneFor(changePct: number | null | undefined): ChangeTone {
  return changeTone(changePct ?? null);
}

/** Axis tick: Cal Sans Text, caption (12px), label-2, tabular figures. */
export const chartTick = {
  fill: chartColor.axis,
  fontSize: 12,
  fontFamily: "var(--font-sans)",
  fontWeight: 500,
  style: { fontVariantNumeric: "tabular-nums" },
} as const;

/** Spread onto <XAxis>/<YAxis>. */
export const chartAxis = {
  axisLine: false,
  tickLine: false,
  tick: chartTick,
  tickMargin: 8,
} as const;

/** Spread onto <CartesianGrid>: horizontal hairlines only. */
export const chartGrid = {
  vertical: false,
  stroke: chartColor.grid,
  strokeDasharray: "3 6",
} as const;

/** Spread onto <Tooltip>: soft cursor, short slide between points, no outline. */
export function chartTooltip(calm: boolean) {
  return {
    cursor: { stroke: chartColor.grid, strokeWidth: 1 },
    isAnimationActive: !calm,
    animationDuration: Math.round(duration.short * 1000),
    animationEasing: "ease-out" as const,
    wrapperStyle: { outline: "none", zIndex: 5 },
  };
}

/**
 * Draw animation props for a series (≤400ms, the `long` token; off under
 * reduced motion / low data).
 *
 * The draw-in runs once, on first mount. Recharts 3 animates every later
 * point change too — a window resize or re-render moved the points and the
 * line visibly re-drew from its old shape — so the flag stays true only until
 * the first `onAnimationEnd`, then stays false for the life of the chart.
 * Nothing remounts: with the flag off Recharts renders the final frame (t=1)
 * for each new set of points, so the series stays drawn throughout.
 *
 * Spread one hook result onto every series of a chart; the first series to
 * finish (or a timer just past the draw, for Scatter, which has no
 * onAnimationEnd) ends the draw for all of them. `onAnimationEnd` is stable, since
 * Recharts restarts the animation whenever that prop changes identity.
 */
export function useChartDraw(ready: boolean) {
  const calm = usePrefersReducedMotionOrLowData();
  const [drawn, setDrawn] = React.useState(false);
  const onAnimationEnd = React.useCallback(() => setDrawn(true), []);
  const ms = Math.round(duration.long * 1000);
  // Scatter (and any series without onAnimationEnd) ends the draw on a timer.
  React.useEffect(() => {
    if (!ready || drawn || calm) return;
    const id = window.setTimeout(() => setDrawn(true), ms + 250);
    return () => window.clearTimeout(id);
  }, [ready, drawn, calm, ms]);
  return {
    isAnimationActive: !calm && ready && !drawn,
    animationDuration: ms,
    animationEasing: "ease-out" as const,
    animationBegin: 0,
    onAnimationEnd,
  };
}

/**
 * True once the element has a real box. ResponsiveContainer measured -1×-1
 * when it mounted before layout (logging "width(-1)") and its first draw ran
 * against that size; ChartFrame mounts the chart only after this is true.
 */
function useHasSize(ref: React.RefObject<HTMLElement | null>) {
  const [sized, setSized] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || sized) return;
    const check = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setSized(true);
        return true;
      }
      return false;
    };
    if (check()) return;
    if (typeof ResizeObserver === "undefined") {
      setSized(true);
      return;
    }
    const ro = new ResizeObserver(() => {
      if (check()) ro.disconnect();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, sized]);
  return sized;
}

export { usePrefersReducedMotionOrLowData as useChartCalm };

type TooltipRow = { label: React.ReactNode; value: React.ReactNode; color?: string };

type ChartTooltipCardProps = Partial<TooltipContentProps<number | string, string>> & {
  /** Heading row (defaults to the category label). */
  title?: (label: unknown, payload: ReadonlyArray<{ payload?: unknown }>) => React.ReactNode;
  /** Rows to show; defaults to one row per series with its raw value. */
  rows?: (payload: ReadonlyArray<{ name?: unknown; value?: unknown; color?: string; payload?: unknown; dataKey?: unknown }>) => TooltipRow[];
};

/** Tooltip on the kit surface: surface-1, hairline border, e2, control radius. */
export function ChartTooltipCard({ active, payload, label, title, rows }: ChartTooltipCardProps) {
  if (!active || !payload?.length) return null;
  const items: TooltipRow[] = rows
    ? rows(payload)
    : payload.map((p) => ({ label: String(p.name ?? ""), value: String(p.value ?? ""), color: p.color }));
  const heading = title ? title(label, payload) : label != null ? String(label) : null;
  return (
    <div className="min-w-[9rem] rounded-control border border-border bg-surface-1 px-3 py-2 text-caption text-foreground shadow-e2">
      {heading ? <p className="mb-1 font-semibold text-foreground">{heading}</p> : null}
      <ul className="space-y-0.5">
        {items.map((row, i) => (
          <li key={i} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-label-2">
              {row.color ? <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} /> : null}
              {row.label}
            </span>
            <span className="font-semibold tabular-nums text-foreground">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Small legend row (dot + label) under a chart. */
export function ChartLegend({ items, className }: { items: { label: React.ReactNode; color: string }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-label-2", className)}>
      {items.map((item, i) => (
        <li key={i} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export type ChartState = "loading" | "error" | "empty" | "ready";

type ChartFrameProps = {
  state: ChartState;
  /** Height utility shared by every state so the swap never shifts layout. */
  heightClass?: string;
  emptyTitle?: React.ReactNode;
  emptyBody?: React.ReactNode;
  emptyIcon?: LucideIcon;
  emptyAction?: React.ReactNode;
  errorTitle?: React.ReactNode;
  errorBody?: React.ReactNode;
  onRetry?: () => void;
  /** Accessible summary of the plotted data (role="img"). */
  label?: string;
  className?: string;
  children?: React.ReactNode;
};

/**
 * ChartFrame — the plot area for every chart: skeleton while loading, kit
 * EmptyState / ErrorState in the same footprint, cross-fade into the chart.
 */
export function ChartFrame({
  state,
  heightClass = "h-72 sm:h-80",
  emptyTitle,
  emptyBody,
  emptyIcon = LineChart,
  emptyAction,
  errorTitle,
  errorBody,
  onRetry,
  label,
  className,
  children,
}: ChartFrameProps) {
  if (state === "loading") {
    return <Skeleton shape="chart" className={cn(heightClass, className)} />;
  }
  if (state === "error") {
    return (
      <div className={cn("flex items-center justify-center rounded-card border border-dashed border-border", heightClass, className)}>
        <ErrorState title={errorTitle} body={errorBody} onRetry={onRetry} className="py-6" />
      </div>
    );
  }
  if (state === "empty") {
    return (
      <div className={cn("flex items-center justify-center rounded-card border border-dashed border-border", heightClass, className)}>
        <EmptyState icon={emptyIcon} title={emptyTitle} body={emptyBody} action={emptyAction} className="py-6" />
      </div>
    );
  }
  return (
    <SizedPlot label={label} className={cn(heightClass, className)}>
      {children}
    </SizedPlot>
  );
}

/**
 * The plot box: fixed height, never transformed or hidden, so the chart
 * measures a real size. Children mount once it has one, then cross-fade in
 * (opacity only, on an inner layer that already has the final size).
 */
function SizedPlot({ label, className, children }: { label?: string; className?: string; children?: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const sized = useHasSize(ref);
  return (
    <div ref={ref} role={label ? "img" : undefined} aria-label={label} className={cn("relative w-full min-w-0", className)}>
      {sized ? <div className="content-in absolute inset-0">{children}</div> : null}
    </div>
  );
}
