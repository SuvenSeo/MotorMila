import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** Badge — neutral / status / deal (one semantic deal set, styles/TOKENS.md). 24px, caption type. */
const badgeVariants = cva(
  "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-caption font-semibold [&_svg]:size-3.5",
  {
    variants: {
      variant: {
        neutral: "border-border bg-surface-2 text-label-2",
        info: "border-primary/25 bg-primary/10 text-primary",
        solid: "border-transparent bg-primary text-primary-foreground",
        success: "border-deal-good/30 bg-deal-good/10 text-deal-good-text",
        warning: "border-deal-caution/40 bg-deal-caution/10 text-deal-caution-text",
        danger: "border-deal-high/30 bg-deal-high/10 text-deal-high-text",
        "deal-great": "border-deal-great/30 bg-deal-great/10 text-deal-great-text",
        "deal-good": "border-deal-good/30 bg-deal-good/10 text-deal-good-text",
        "deal-fair": "border-deal-fair/30 bg-deal-fair/10 text-deal-fair-text",
        "deal-high": "border-deal-high/30 bg-deal-high/10 text-deal-high-text",
        "deal-caution": "border-deal-caution/40 bg-deal-caution/10 text-deal-caution-text",
        // legacy aliases
        default: "border-primary/25 bg-primary/10 text-primary",
        secondary: "border-border bg-surface-2 text-label-2",
        destructive: "border-deal-high/30 bg-deal-high/10 text-deal-high-text",
        outline: "border-border bg-transparent text-foreground",
        glass: "border-border bg-surface-2 text-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
