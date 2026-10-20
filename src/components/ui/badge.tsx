import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-[11px] font-semibold tracking-tight transition-all duration-150 ease-apple focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-primary/25 bg-primary/10 text-primary-bright dark:bg-primary/15",
        solid: "border-transparent bg-primary text-primary-foreground shadow-soft",
        secondary: "border-border bg-secondary/80 text-secondary-foreground backdrop-blur-md",
        destructive: "border-destructive/25 bg-destructive/10 text-destructive dark:text-destructive-foreground",
        outline: "border-border bg-card/50 text-foreground backdrop-blur-sm",
        glass: "border-white/15 bg-white/10 text-foreground backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
