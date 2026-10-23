import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-caption font-semibold tracking-tight transition-ui duration-short ease-decelerate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default: "border-primary/25 bg-primary/10 text-primary-bright dark:bg-primary/15",
        solid: "border-transparent bg-primary text-primary-foreground shadow-soft",
        secondary: "border-border bg-secondary text-secondary-foreground",
        destructive: "border-destructive/25 bg-destructive/10 text-destructive dark:text-destructive-foreground",
        outline: "border-border bg-card text-foreground",
        glass: "border-border bg-card text-foreground dark:border-border dark:bg-foreground/[0.06]",
        // Deal signals — one semantic set (src/styles/TOKENS.md)
        "deal-great": "border-deal-great/30 bg-deal-great/10 text-deal-great-text",
        "deal-good": "border-deal-good/30 bg-deal-good/10 text-deal-good-text",
        "deal-fair": "border-deal-fair/30 bg-deal-fair/10 text-deal-fair-text",
        "deal-high": "border-deal-high/30 bg-deal-high/10 text-deal-high-text",
        "deal-caution": "border-deal-caution/40 bg-deal-caution/10 text-deal-caution-text",
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
