import * as React from "react";
import { m } from "motion/react";

import { cn } from "@/lib/utils";
import { spring, usePrefersReducedMotionOrLowData } from "@/lib/motion";

export type SegmentedOption<T extends string> = { value: T; label: React.ReactNode };

type SegmentedControlProps<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** Accessible name for the group. */
  "aria-label": string;
  /** "radio" = one-of-n setting (role=radiogroup/radio); "toggle" = mode buttons (aria-pressed). */
  semantics?: "radio" | "toggle";
  size?: "sm" | "md" | "touch";
  className?: string;
};

/**
 * SegmentedControl — 2–4 mutually exclusive options in one track. The
 * selected pill slides between segments (layoutId spring, transform only);
 * snaps under reduced motion. Same look as the kit Tabs list, but plain
 * buttons, so it works for settings that are not tab panels.
 * Added in web/p1-search (filter price mode, saved-search alert cadence).
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  "aria-label": ariaLabel,
  semantics = "toggle",
  size = "md",
  className,
}: SegmentedControlProps<T>) {
  const id = React.useId();
  const calm = usePrefersReducedMotionOrLowData();
  const radio = semantics === "radio";
  return (
    <div
      role={radio ? "radiogroup" : "group"}
      aria-label={ariaLabel}
      className={cn(
        "grid w-full items-center gap-0.5 rounded-full bg-surface-2 p-1",
        size === "touch" ? "h-12" : size === "sm" ? "h-9" : "h-10",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role={radio ? "radio" : undefined}
            aria-checked={radio ? active : undefined}
            aria-pressed={radio ? undefined : active}
            onClick={() => onValueChange(o.value)}
            className={cn(
              "relative inline-flex h-full min-w-0 items-center justify-center rounded-full px-2 text-footnote font-semibold transition-colors duration-short ease-standard active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "text-foreground" : "text-label-2 hover:text-foreground",
            )}
          >
            {active ? (
              <m.span
                layoutId={`${id}-segment-pill`}
                aria-hidden
                className="absolute inset-0 rounded-full bg-background shadow-e1 dark:bg-surface-3"
                transition={calm ? { duration: 0 } : spring.snappy}
              />
            ) : null}
            <span className="relative z-10 truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
