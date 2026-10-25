import * as React from "react";
import { m } from "motion/react";

import { cn } from "@/lib/utils";
import { spring, usePrefersReducedMotionOrLowData } from "@/lib/motion";

type SwitchProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** sm 20px (dense rows) · md 24px (default, 44px hit area via padding). */
  size?: "sm" | "md";
};

/**
 * Switch — a real on/off control (role="switch"), knob springs across
 * (transform only), track colour fades. Reduced motion / low data: snaps.
 * Added in web/p1-search for the filter "Include archive" toggle and Compare
 * options; generic enough for Settings/Alerts.
 */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, size = "md", className, disabled, ...props }, ref) => {
    const calm = usePrefersReducedMotionOrLowData();
    const sm = size === "sm";
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex shrink-0 items-center rounded-full border border-transparent p-0.5 transition-colors duration-short ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45",
          sm ? "h-5 w-9" : "h-6 w-11",
          checked ? "bg-primary" : "bg-foreground/15",
          className,
        )}
        {...props}
      >
        <m.span
          aria-hidden
          // whileTap makes Motion add tabindex="0"; the knob must not be its own tab stop.
          tabIndex={-1}
          className={cn("block rounded-full bg-primary-foreground shadow-e1", sm ? "h-4 w-4" : "h-5 w-5")}
          initial={false}
          animate={{ x: checked ? (sm ? 16 : 20) : 0 }}
          whileTap={calm ? undefined : { scale: 0.92 }}
          transition={calm ? { duration: 0 } : spring.snappy}
        />
      </button>
    );
  },
);
Switch.displayName = "Switch";
