import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

/**
 * Thumbs grow on press/focus (transform only; Radix positions them itself and we
 * never animate that). Off under reduced motion and low-data.
 */
const THUMB_CLASS =
  "block h-5 w-5 rounded-full border-2 border-primary bg-background shadow-e1 ring-offset-background transition-transform duration-short ease-standard active:scale-125 focus-visible:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transform-none [.low-data_&]:transform-none";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
    /** Accessible name for a single-thumb slider (role=slider needs a label). */
    thumbLabel?: string;
    /** Per-thumb accessible names for range sliders, e.g. ["Minimum price", "Maximum price"]. */
    thumbLabels?: string[];
  }
>(({ className, thumbLabel, thumbLabels, ...props }, ref) => {
  // Radix renders one thumb per Thumb child — a two-value range needs two,
  // otherwise the max handle simply does not exist for keyboard or pointer.
  const values = props.value ?? props.defaultValue;
  const thumbCount = Array.isArray(values) ? Math.max(values.length, 1) : 1;
  const labels = thumbLabels ?? (thumbLabel ? [thumbLabel] : []);

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn("relative flex w-full touch-none select-none items-center py-2", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-foreground/10">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbCount }, (_, i) => (
        <SliderPrimitive.Thumb key={i} aria-label={labels[i]} className={THUMB_CLASS} />
      ))}
    </SliderPrimitive.Root>
  );
});
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
