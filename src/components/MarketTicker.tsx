import { memo } from "react";
import {
  Ticker,
  TickerIcon,
  TickerPrice,
  TickerPriceChange,
  TickerSymbol,
} from "@/components/kibo-ui/ticker";
import { cn } from "@/lib/utils";

export interface MarketTickerRow {
  make: string;
  model: string;
  avg_price_lkr: number;
  movement_pct: number;
  listing_count: number;
  thumbnail_url?: string | null;
}

interface MarketTickerProps {
  rows: MarketTickerRow[];
  onSelect?: (row: MarketTickerRow) => void;
}

const lkr0 = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  maximumFractionDigits: 0,
});

/** Shared inner markup so the live track and its loop clone measure identically. */
function TickerItemInner({ row }: { row: MarketTickerRow }) {
  return (
    <>
      <TickerIcon src={row.thumbnail_url} symbol={row.make} />
      <TickerSymbol symbol={`${row.make} ${row.model}`} className="max-w-[140px] truncate" />
      <TickerPrice price={row.avg_price_lkr} className="num" />
      <TickerPriceChange change={row.movement_pct} isPercent className="num text-[11px] font-semibold" />
    </>
  );
}

/**
 * MarketTicker — Kibo UI ticker (#12) wired to live trending-model data.
 * A finance-style strip: model symbol, median price (LKR), and % change.
 * The strip scrolls on its own CSS loop; each item is a real button that
 * focuses the market grid on that model. Static when reduced-motion is
 * preferred.
 */
export const MarketTicker = memo(function MarketTicker({ rows, onSelect }: MarketTickerProps) {
  if (!rows.length) return null;
  const itemClass = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-1 py-0.5 align-middle text-[12px]";
  return (
    <section aria-label="Trending models ticker" className="market-ticker border-b border-border bg-surface/60">
      <div className="market-ticker__viewport relative flex overflow-hidden">
        {[0, 1].map((copy) => (
          <div
            key={copy}
            aria-hidden={copy === 1}
            className="market-ticker__track flex w-max shrink-0 items-center gap-8 py-2.5 pl-8"
          >
            {rows.map((row) =>
              copy === 0 ? (
                <Ticker
                  key={`${row.make}-${row.model}`}
                  currency="LKR"
                  locale="en-LK"
                  onClick={() => onSelect?.(row)}
                  className={cn(itemClass, "transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary")}
                  aria-label={`${row.make} ${row.model}, average ${lkr0.format(row.avg_price_lkr)}, ${row.movement_pct >= 0 ? "up" : "down"} ${Math.abs(row.movement_pct).toFixed(1)} percent`}
                >
                  <TickerItemInner row={row} />
                </Ticker>
              ) : (
                <Ticker
                  key={`${row.make}-${row.model}`}
                  currency="LKR"
                  locale="en-LK"
                  tabIndex={-1}
                  className={cn(itemClass, "pointer-events-none text-foreground")}
                >
                  <TickerItemInner row={row} />
                </Ticker>
              ),
            )}
          </div>
        ))}
      </div>
    </section>
  );
});
