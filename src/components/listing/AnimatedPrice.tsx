import { lazy, Suspense } from "react";
import { formatLkrFull } from "@/lib/price";

// number-flow is only pulled in on the detail page, after first paint; the
// formatted text is the fallback (and what reduced-motion users see animate to).
const NumberFlow = lazy(() => import("@number-flow/react"));

/**
 * Full asking price ("Rs 7,250,000", canonical detail-page format) that rolls
 * digits when the price changes (e.g. hopping between similar listings).
 */
export function AnimatedPrice({ priceLkr, className }: { priceLkr: number; className?: string }) {
  const fallback = <span className={className}>{formatLkrFull(priceLkr)}</span>;
  if (!Number.isFinite(priceLkr) || priceLkr <= 0) return fallback;
  return (
    <Suspense fallback={fallback}>
      <span className={className} aria-label={formatLkrFull(priceLkr)}>
        <NumberFlow
          value={Math.round(priceLkr)}
          prefix="Rs "
          locales="en-US"
          format={{ maximumFractionDigits: 0, useGrouping: true }}
          respectMotionPreference
          aria-hidden
        />
      </span>
    </Suspense>
  );
}
