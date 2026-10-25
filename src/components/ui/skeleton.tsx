import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Skeleton — the one loading placeholder. `shape` presets match the real
 * content geometry so the swap does not shift layout; wrap the loaded content
 * in `.content-in` (styles/motion.css) for the cross-fade.
 */
type Shape = "block" | "text" | "title" | "circle" | "card" | "row" | "chart" | "kpi";

const SHAPES: Record<Shape, string> = {
  block: "rounded-card",
  text: "h-4 w-full rounded-full",
  title: "h-7 w-2/3 rounded-full",
  circle: "aspect-square rounded-full",
  card: "aspect-[4/3] w-full rounded-card",
  row: "h-14 w-full rounded-control",
  chart: "h-64 w-full rounded-card",
  kpi: "h-24 w-full rounded-card",
};

function Skeleton({ className, shape = "block", ...props }: React.HTMLAttributes<HTMLDivElement> & { shape?: Shape }) {
  return <div aria-hidden="true" className={cn("skeleton-shimmer", SHAPES[shape], className)} {...props} />;
}

export { Skeleton };
