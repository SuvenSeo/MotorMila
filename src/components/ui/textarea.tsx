import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-input border border-border bg-card/60 text-foreground dark:border-border dark:bg-foreground/[0.05] px-4 py-3 text-footnote ring-offset-background placeholder:text-muted-foreground backdrop-blur-xl mm-field focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:bg-foreground/8",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
