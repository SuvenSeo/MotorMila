import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold tracking-[-0.01em] ring-offset-background transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-apple will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90 hover:shadow-soft-lg active:scale-[0.97]",
        destructive: "bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90 active:scale-[0.97]",
        outline: "border border-border bg-card/60 text-foreground backdrop-blur-xl hover:bg-card/90 hover:border-primary/30 hover:shadow-soft dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.09] active:scale-[0.97]",
        secondary: "bg-secondary text-secondary-foreground backdrop-blur-md hover:bg-secondary/80 hover:shadow-soft active:scale-[0.97]",
        ghost: "text-foreground/80 hover:bg-accent/80 hover:text-foreground active:scale-[0.97]",
        link: "text-primary underline-offset-4 hover:underline",
        glass: "border border-white/15 bg-white/10 text-foreground backdrop-blur-2xl shadow-soft hover:bg-white/15 hover:border-white/25 active:scale-[0.97] dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.10]",
      },
      size: {
        default: "h-10 px-5 py-2",
        xs: "h-7 px-3 text-[11px]",
        sm: "h-8 px-3.5 text-[0.8125rem]",
        lg: "h-12 px-8 text-[0.9375rem]",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export { buttonVariants, type ButtonVariantProps };
