import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Card — 3 variants (web/premium-p0). Replaces the 86 hand-rolled surface recipes.
 *   plain        resting surface, hairline + e1
 *   interactive  plain + hover lift (−2px, e2) on fine pointers + press 0.99
 *   media        no padding, clips a photo/edge-to-edge content
 */
const cardBase = cva("relative rounded-card border border-border bg-surface-1 text-card-foreground shadow-e1", {
  variants: {
    variant: {
      plain: "",
      interactive:
        "cursor-pointer transition-ui duration-short ease-standard [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5 [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-e2 active:scale-[0.99] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      media: "overflow-hidden",
    },
    padding: {
      none: "",
      sm: "p-4",
      md: "p-5 sm:p-6",
      lg: "p-6 sm:p-8",
    },
  },
  defaultVariants: { variant: "plain" },
});

/** Card classes. Padding defaults to md, except media cards (edge-to-edge content), which default to none. */
function cardVariants({ className, ...opts }: VariantProps<typeof cardBase> & { className?: string } = {}) {
  return cn(cardBase({ ...opts, padding: opts.padding ?? (opts.variant === "media" ? "none" : "md") }), className);
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardBase> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, variant, padding, ...props }, ref) => (
  // media cards clip edge-to-edge content, so they get no padding unless asked;
  // every other variant defaults to md.
  <div ref={ref} className={cn(cardVariants({ variant, padding }), className)} {...props} />
));
Card.displayName = "Card";

const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mb-4 flex items-start justify-between gap-3", className)} {...props} />
);
const CardTitle = ({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn("text-callout font-semibold text-foreground", className)} {...props}>
    {children}
  </h3>
);
const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn("text-footnote text-label-2", className)} {...props} />
);
const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-5 flex items-center gap-3 border-t border-separator pt-4", className)} {...props} />
);

export { Card, CardHeader, CardTitle, CardDescription, CardFooter, cardVariants };
