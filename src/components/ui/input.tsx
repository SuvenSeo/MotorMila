import * as React from "react";

import { cn } from "@/lib/utils";

/** Field recipe shared by Input, Textarea and the Select trigger (40px, control radius). */
export const fieldClass =
  "w-full rounded-control border border-border bg-surface-1 px-3.5 text-body text-foreground shadow-e1 placeholder:text-label-3 transition-ui duration-short ease-standard hover:border-foreground/20 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/15 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/15 disabled:cursor-not-allowed disabled:opacity-50";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        fieldClass,
        "flex h-10 py-2 file:border-0 file:bg-transparent file:text-footnote file:font-medium file:text-foreground",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
