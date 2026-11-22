import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type RankBarRow = {
  key: string;
  label: ReactNode;
  value: number;
  valueLabel: ReactNode;
  meta?: ReactNode;
  /** Optional click target. */
  onClick?: () => void;
  active?: boolean;
};

/**
 * Ranked horizontal bars. The value is the hero, the bar is proportion, and the
 * row keeps a slot for one piece of meta — the BarList idiom rebuilt on tokens.
 * Every row is a link-like target when `onClick` is supplied, with the full
 * value in the accessible name so the bar is never the only encoding.
 */
export function RankBars({
  rows,
  className,
  onSelect,
  emptyLabel,
}: {
  rows: RankBarRow[];
  className?: string;
  onSelect?: (key: string) => void;
  emptyLabel?: ReactNode;
}) {
  if (rows.length === 0) {
    return <p className={cn("py-6 text-center text-footnote text-label-3", className)}>{emptyLabel ?? "No rows"}</p>;
  }
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul className={cn("divide-y divide-separator", className)}>
      {rows.map((row) => {
        const share = Math.min(1, row.value / max);
        const interactive = Boolean(row.onClick || onSelect);
        const Wrapper = interactive ? "button" : "div";
        return (
          <li key={row.key}>
            <Wrapper
              {...(interactive
                ? {
                    type: "button" as const,
                    onClick: () => (row.onClick ? row.onClick() : onSelect?.(row.key)),
                  }
                : {})}
              className={cn(
                "group relative flex w-full items-center gap-3 py-2 text-left",
                interactive && "rounded-control px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                row.active && "bg-surface-2",
              )}
            >
              <span
                aria-hidden
                className="absolute inset-y-1 left-0 rounded-[3px] bg-primary/10 transition-colors duration-short group-hover:bg-primary/15"
                style={{ width: `${share * 100}%` }}
              />
              <span className="relative z-10 min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-footnote font-semibold text-foreground">{row.label}</span>
                  <span className="shrink-0 text-footnote font-semibold tabular-nums text-foreground">{row.valueLabel}</span>
                </span>
                {row.meta ? <span className="mt-0.5 flex items-center gap-1.5 text-caption text-label-3">{row.meta}</span> : null}
              </span>
            </Wrapper>
          </li>
        );
      })}
    </ul>
  );
}
