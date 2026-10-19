import { lazy, Suspense } from "react";
import { formatPrice } from "@/services/api";

// number-flow is only pulled in on the detail page, after first paint; the
// formatted text is the fallback (and what reduced-motion users see animate to).
const NumberFlow = lazy(() => import("@number-flow/react"));

/**
 * "Rs. 8.85M" that rolls digits when the price changes (e.g. hopping between
 * similar listings). Same text as formatPrice so card and detail agree.
 */
export function AnimatedPrice({ priceLkr, className }: { priceLkr: number; className?: string }) {
  const fallback = <span className={className}>{formatPrice(priceLkr)}</span>;
  if (!Number.isFinite(priceLkr) || priceLkr <= 0) return fallback;
  return (
    <Suspense fallback={fallback}>
      <span className={className} aria-label={formatPrice(priceLkr)}>
        <NumberFlow
          value={priceLkr / 1_000_000}
          prefix="Rs. "
          suffix="M"
          format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
          respectMotionPreference
          aria-hidden
        />
      </span>
    </Suspense>
  );
}
