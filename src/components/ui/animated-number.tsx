import NumberFlow, { type Format } from "@number-flow/react";

import { cn } from "@/lib/utils";
import { usePrefersReducedMotionOrLowData } from "@/lib/motion";

type AnimatedNumberProps = {
  value: number;
  format?: Format;
  locales?: string | string[];
  prefix?: string;
  suffix?: string;
  className?: string;
};

/**
 * AnimatedNumber — the one number animator (prices, counts, KPIs, totals).
 * Digits roll with tabular figures so width never jumps; instant under
 * reduced motion / low data. Wraps @number-flow/react.
 */
export function AnimatedNumber({ value, format, locales = "en-LK", prefix, suffix, className }: AnimatedNumberProps) {
  const calm = usePrefersReducedMotionOrLowData();
  return (
    <NumberFlow
      value={value}
      format={format}
      locales={locales}
      prefix={prefix}
      suffix={suffix}
      animated={!calm}
      willChange
      className={cn("tabular-nums", className)}
      transformTiming={{ duration: 400, easing: "cubic-bezier(0.2, 0, 0, 1)" }}
      spinTiming={{ duration: 400, easing: "cubic-bezier(0.2, 0, 0, 1)" }}
      opacityTiming={{ duration: 180, easing: "ease-out" }}
    />
  );
}
