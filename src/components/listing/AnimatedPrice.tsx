import { formatLkrFull } from "@/lib/price";
import { AnimatedNumber } from "@/components/ui/animated-number";

/**
 * Full asking price ("Rs 7,250,000", canonical detail-page format) that rolls
 * digits when the price changes (e.g. hopping between similar listings).
 * Built on the kit's AnimatedNumber: tabular figures, the motion tokens, and
 * instant under reduced motion / low data.
 */
export function AnimatedPrice({ priceLkr, className }: { priceLkr: number; className?: string }) {
  if (!Number.isFinite(priceLkr) || priceLkr <= 0) return <span className={className}>{formatLkrFull(priceLkr)}</span>;
  return (
    <span className={className} aria-label={formatLkrFull(priceLkr)}>
      <span aria-hidden>
        <AnimatedNumber
          value={Math.round(priceLkr)}
          prefix="Rs "
          locales="en-US"
          format={{ maximumFractionDigits: 0, useGrouping: true }}
        />
      </span>
    </span>
  );
}
