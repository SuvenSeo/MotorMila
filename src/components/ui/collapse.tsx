import * as React from "react";

import { cn } from "@/lib/utils";

type CollapseProps = React.HTMLAttributes<HTMLDivElement> & {
  open: boolean;
  /** Classes for the inner content box (padding, spacing) — kept off the animating grid row. */
  innerClassName?: string;
};

/**
 * Collapse — accordion body that animates its height without measuring it in
 * JS: a one-row grid goes 0fr → 1fr (styles in index.css `.mm-collapse`) while
 * the content fades. No ResizeObserver, no per-frame JS, no forced layout.
 * Closed content stays in the DOM (indexable) but leaves the tab order and the
 * accessibility tree via `visibility: hidden` once the close has finished.
 * Reduced motion / low data: opacity only.
 */
export const Collapse = React.forwardRef<HTMLDivElement, CollapseProps>(
  ({ open, className, innerClassName, children, ...props }, ref) => (
    <div ref={ref} className={cn("mm-collapse", className)} data-open={open ? "true" : "false"} aria-hidden={open ? undefined : true} {...props}>
      <div className="mm-collapse__inner">
        <div className={innerClassName}>{children}</div>
      </div>
    </div>
  ),
);
Collapse.displayName = "Collapse";
