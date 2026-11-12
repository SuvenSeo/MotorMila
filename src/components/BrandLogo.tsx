import { cn } from "@/lib/utils";

type BrandLogoSize = "default" | "compact" | "nav";

type BrandLogoProps = {
  className?: string;
  /** Extra classes for the mark image (mark-only mode) or the wordmark images. */
  markClassName?: string;
  showWordmark?: boolean;
  showTagline?: boolean;
  tagline?: string;
  /** @deprecated Use `size="compact"` instead. */
  compact?: boolean;
  size?: BrandLogoSize;
  /** Use the full stacked lockup image instead of the wordmark. */
  lockup?: boolean;
};

/*
 * Fixed Motormila lockup (brand v2, 2026-10-23): the blue M *is* the first
 * letter of "Motormila". Open Sans Bold lettering at −3.5 % tracking, the M at
 * 1.035 × cap height sitting on the baseline, M→o gap 0.133 em. Shipped as
 * outlined SVGs (crisp at any DPR, no web-font dependency), swapped by theme.
 * Aspect ratio of the SVG viewBox: 10157.2 × 1700.
 */
const WORDMARK_LIGHT = "/logo-wordmark-light.svg"; // dark lettering, for the light theme
const WORDMARK_DARK = "/logo-wordmark-dark.svg"; // light lettering, for the dark theme
const WORDMARK_ASPECT = 10157.2 / 1700;

const BRAND_SIZE_STYLES = {
  default: { wordmark: "h-7", wordmarkPx: 28, mark: "h-10 w-10", markPx: 40 },
  compact: { wordmark: "h-6", wordmarkPx: 24, mark: "h-8 w-8", markPx: 32 },
  nav: { wordmark: "h-6 sm:h-7", wordmarkPx: 28, mark: "h-9 w-9", markPx: 36 },
} as const;

/** Motormila wordmark lockup (official brand assets). */
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
  const { wordmark, wordmarkPx, mark, markPx } = BRAND_SIZE_STYLES[resolvedSize];

  if (!showWordmark) {
    return (
      <img
        src="/logo-mark.svg"
        alt="MotorMila"
        width={markPx}
        height={markPx}
        className={cn(mark, "shrink-0 object-contain", markClassName, className)}
        decoding="async"
      />
    );
  }

  const wordmarkWidth = Math.round(wordmarkPx * WORDMARK_ASPECT);
  const imgClass = cn(wordmark, "block w-auto max-w-none shrink-0 select-none", markClassName);

  return (
    <span className={cn("inline-flex min-w-0 flex-col items-start leading-none", className)}>
      <span role="img" aria-label="MotorMila" className="brand-wordmark-lockup inline-flex">
        <img
          src={WORDMARK_LIGHT}
          alt=""
          aria-hidden="true"
          width={wordmarkWidth}
          height={wordmarkPx}
          className={cn(imgClass, "dark:hidden")}
          draggable={false}
          decoding="async"
        />
        <img
          src={WORDMARK_DARK}
          alt=""
          aria-hidden="true"
          width={wordmarkWidth}
          height={wordmarkPx}
          className={cn(imgClass, "hidden dark:block")}
          draggable={false}
          decoding="async"
        />
      </span>
      {showTagline && (
        <span className="mt-1.5 block max-w-[16rem] truncate text-caption font-medium tracking-normal text-muted-foreground">
          {tagline}
        </span>
      )}
    </span>
  );
}
