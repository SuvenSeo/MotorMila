import { cn } from "@/lib/utils";

type BrandLogoSize = "default" | "compact" | "nav";

type BrandLogoProps = {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
  showTagline?: boolean;
  tagline?: string;
  /** @deprecated Use `size="compact"` instead. */
  compact?: boolean;
  size?: BrandLogoSize;
  /** Use the full stacked lockup image instead of mark + text. */
  lockup?: boolean;
};

const BRAND_SIZE_STYLES = {
  default: {
    mark: "h-10 w-10",
    markPx: 40,
    text: "text-lg",
    gap: "gap-2.5",
    useCompactMark: false,
  },
  compact: {
    mark: "h-8 w-8",
    markPx: 32,
    text: "text-base",
    gap: "gap-2.5",
    useCompactMark: true,
  },
  nav: {
    mark: "h-11 w-11 sm:h-12 sm:w-12",
    markPx: 48,
    text: "text-lg sm:text-xl",
    gap: "gap-2.5 sm:gap-3",
    useCompactMark: true,
  },
} as const;

/** Motormila mark + Motor/mila wordmark lockup (official brand assets). */
export function BrandLogo({
  className,
  markClassName,
  showWordmark = true,
  showTagline = false,
  tagline = "Sri Lanka Vehicle Market Intelligence",
  compact = false,
  size,
  lockup = false,
}: BrandLogoProps) {
  if (lockup) {
    return (
      <img
        src="/brand-lockup.png"
        alt="Motormila — Sri Lanka Vehicle Market Intelligence"
        className={cn("h-auto w-full max-w-[240px] object-contain", className)}
        decoding="async"
      />
    );
  }

  const resolvedSize = size ?? (compact ? "compact" : "default");
  const brandSize = BRAND_SIZE_STYLES[resolvedSize];
  const { mark, markPx, text, gap, useCompactMark } = brandSize;

  return (
    <span className={cn("inline-flex items-center", gap, className)}>
      {useCompactMark ? (
        <img
          src="/logo.png"
          alt=""
          width={markPx}
          height={markPx}
          className={cn(mark, "shrink-0 rounded-[22%] object-cover shadow-sm ring-1 ring-foreground/10", markClassName)}
          decoding="async"
        />
      ) : (
        <>
          <img
            src="/logo-mark-light.webp"
            alt=""
            width={markPx}
            height={markPx}
            className={cn(mark, "shrink-0 object-contain dark:hidden", markClassName)}
            decoding="async"
          />
          <img
            src="/logo-mark.webp"
            alt=""
            width={markPx}
            height={markPx}
            className={cn(
              mark,
              "hidden shrink-0 object-contain dark:block",
              markClassName,
            )}
            decoding="async"
          />
        </>
      )}
      {showWordmark && (
        <span className="brand-wordmark min-w-0 leading-none">
          <span
            className={cn(
              "brand-wordmark block font-display text-foreground",
              text,
            )}
          >
            Motor<span className="text-primary">mila</span>
          </span>
          {showTagline && (
            <span className="mt-1.5 block max-w-[16rem] truncate text-2xs font-medium tracking-[-0.005em] text-muted-foreground">
              {tagline}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
