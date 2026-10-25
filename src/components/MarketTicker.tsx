import { memo, useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import { useReducedMotionOrLowData } from "@/lib/motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import {
  Ticker,
  TickerIcon,
  TickerSymbol,
} from "@/components/kibo-ui/ticker";
import { cn } from "@/lib/utils";
import { changeTone, formatChangePct, formatLkrWhole, TONE_STYLES } from "@/lib/dataSanity";
import { useAppPreferences } from "@/lib/appPreferences";

export interface MarketTickerRow {
  make: string;
  model: string;
  avg_price_lkr: number;
  movement_pct: number | null;
  listing_count: number;
  thumbnail_url?: string | null;
}

interface MarketTickerProps {
  rows: MarketTickerRow[];
  onSelect?: (row: MarketTickerRow) => void;
}

/**
 * Change chip: up = amber, down = green, |Δ| < 1% = grey "stable". Buyer-
 * neutral — a falling asking price is not "bad news" for the people using this.
 */
function TickerChange({ pct, stableLabel }: { pct: number | null; stableLabel: string }) {
  const tone = changeTone(pct);
  const Icon = tone === "up" ? ArrowUpRight : tone === "down" ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 num text-caption font-semibold", TONE_STYLES[tone].text)}>
      <Icon className="h-3 w-3" aria-hidden />
      {tone === "stable" ? stableLabel : formatChangePct(Number(pct))}
    </span>
  );
}

/** Shared inner markup so the live track and its loop clone measure identically. */
function TickerItemInner({ row, stableLabel }: { row: MarketTickerRow; stableLabel: string }) {
  return (
    <>
      <TickerIcon src={row.thumbnail_url} symbol={row.make} />
      <TickerSymbol symbol={`${row.make} ${row.model}`} className="max-w-[140px] truncate" />
      {/* Whole rupees — used-vehicle averages never need cents. */}
      <span className="num text-muted-foreground">{formatLkrWhole(row.avg_price_lkr)}</span>
      <TickerChange pct={row.movement_pct} stableLabel={stableLabel} />
    </>
  );
}

function ariaChange(pct: number | null, t: (k: string, f?: string, v?: Record<string, string | number>) => string): string {
  const tone = changeTone(pct);
  if (tone === "stable") return t("ticker.ariaStable", "stable");
  const n = Math.abs(Number(pct)).toFixed(1);
  return tone === "up" ? t("ticker.ariaUp", "up {n} percent", { n }) : t("ticker.ariaDown", "down {n} percent", { n });
}

/**
 * MarketTicker — Kibo UI ticker (#12) wired to live trending-model data.
 * A finance-style strip: model symbol, median price (LKR), and % change.
 * The strip scrolls on its own CSS loop; each item is a real button that
 * focuses the market grid on that model. Static when reduced-motion is
 * preferred.
 */
export const MarketTicker = memo(function MarketTicker({ rows, onSelect }: MarketTickerProps) {
  const { t } = useAppPreferences();
  const ref = useRef<HTMLElement>(null);
  // Continuous CSS loop, but paused when off screen, while hovered/focused
  // (CSS), when the tab is hidden, and never running under reduced motion /
  // low-data mode.
  const inView = useInView(ref, { amount: 0 });
  const still = useReducedMotionOrLowData();
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const onChange = () => setTabVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  if (!rows.length) return null;
  const trackStyle = still
    ? { animation: "none" }
    : !inView || !tabVisible
      ? { animationPlayState: "paused" as const }
      : undefined;
  const stableLabel = t("ticker.stable", "stable");
  const itemClass = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-1 py-0.5 align-middle text-caption";
  return (
    <section ref={ref} aria-label="Trending models ticker" className="market-ticker border-b border-border bg-surface/60">
      <div className="market-ticker__viewport relative flex overflow-hidden">
        {[0, 1].map((copy) => (
          <div
            key={copy}
            aria-hidden={copy === 1}
            style={trackStyle}
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
                  aria-label={`${row.make} ${row.model}, ${t("ticker.ariaAverage", "average")} ${formatLkrWhole(row.avg_price_lkr)}, ${ariaChange(row.movement_pct, t)}`}
                >
                  <TickerItemInner row={row} stableLabel={stableLabel} />
                </Ticker>
              ) : (
                <Ticker
                  key={`${row.make}-${row.model}`}
                  currency="LKR"
                  locale="en-LK"
                  tabIndex={-1}
                  className={cn(itemClass, "pointer-events-none text-foreground")}
                >
                  <TickerItemInner row={row} stableLabel={stableLabel} />
                </Ticker>
              ),
            )}
          </div>
        ))}
      </div>
    </section>
  );
});
