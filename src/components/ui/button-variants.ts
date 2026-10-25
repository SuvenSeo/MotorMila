import { cva, type VariantProps } from "class-variance-authority";

/**
 * Button — 4 variants × 3 sizes (web/premium-p0).
 *   primary     filled brand blue (one per view)
 *   secondary   quiet filled surface
 *   tertiary    text-only, tinted on hover
 *   destructive filled red
 * Sizes sm 32 · md 40 · lg 48 (+ icon / icon-sm squares). Press scales to 0.97,
 * focus shows the one 2px ring. Legacy names (default/outline/ghost/glass/link,
 * default/xs size) map onto the set so older call sites keep working.
 */
// Hover lift (−1px) on fine pointers only, for the filled variants.
const LIFT = "motion-safe:[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-px";
const PRIMARY = `${LIFT} bg-primary text-primary-foreground shadow-e1 hover:bg-primary/90`;
const SECONDARY = `${LIFT} border border-border bg-surface-2 text-foreground hover:bg-surface-3`;
const TERTIARY = "text-primary hover:bg-primary/10";
const DESTRUCTIVE = `${LIFT} bg-destructive text-destructive-foreground shadow-e1 hover:bg-destructive/90`;

const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold tracking-normal transition-ui duration-short ease-standard tap-44 active:scale-[0.97] active:duration-micro motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: PRIMARY,
        secondary: SECONDARY,
        tertiary: TERTIARY,
        destructive: DESTRUCTIVE,
        // legacy aliases
        default: PRIMARY,
        outline: SECONDARY,
        glass: SECONDARY,
        ghost: "text-foreground/80 hover:bg-surface-2 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        sm: "h-8 px-3.5 text-footnote [&_svg]:size-4",
        md: "h-10 px-5 text-body [&_svg]:size-4",
        lg: "h-12 px-7 text-callout [&_svg]:size-5",
        icon: "h-10 w-10 [&_svg]:size-5",
        "icon-sm": "h-8 w-8 [&_svg]:size-4",
        // legacy aliases
        default: "h-10 px-5 text-body [&_svg]:size-4",
        xs: "h-8 px-3 text-caption [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export { buttonVariants, type ButtonVariantProps };
