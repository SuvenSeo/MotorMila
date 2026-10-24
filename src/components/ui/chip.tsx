import * as React from "react";

import { cn } from "@/lib/utils";

type ChipProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean };

/** Chip / FilterChip — 32px pill toggle. Selected = filled, with press + colour feedback. */
export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(({ className, selected, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-pressed={selected}
    className={cn(
      "tap-44 relative inline-flex h-8 select-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-footnote font-medium transition-ui duration-short ease-standard motion-safe:[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-px active:scale-[0.97] active:duration-micro motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45 [&_svg]:size-4",
      selected
        ? "border-transparent bg-foreground text-background"
        : "border-border bg-surface-1 text-foreground hover:bg-surface-2",
      className,
    )}
    {...props}
  />
));
Chip.displayName = "Chip";
