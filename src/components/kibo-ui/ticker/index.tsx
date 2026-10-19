"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { createContext, memo, useContext, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Kibo UI ticker (#12 UI review) — composable finance ticker for symbols,
 * prices and changes. Vendored from the Kibo UI registry
 * (https://www.kibo-ui.com/r/ticker.json); the only adaptation is that
 * TickerIcon renders its own img + initials fallback instead of pulling
 * in the Avatar component.
 */

type TickerContextValue = {
  formatter: Intl.NumberFormat;
};

const DEFAULT_CURRENCY = "USD";
const DEFAULT_LOCALE = "en-US";

const defaultFormatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
  style: "currency",
  currency: DEFAULT_CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const TickerContext = createContext<TickerContextValue>({
  formatter: defaultFormatter,
});

export const useTickerContext = () => useContext(TickerContext);

export type TickerProps = HTMLAttributes<HTMLButtonElement> & {
  currency?: string;
  locale?: string;
};

export const Ticker = memo(
  ({
    children,
    className,
    currency = DEFAULT_CURRENCY,
    locale = DEFAULT_LOCALE,
    ...props
  }: TickerProps & { children: ReactNode }) => {
    const formatter = useMemo(() => {
      try {
        return new Intl.NumberFormat(locale, {
          style: "currency",
          currency: currency.toUpperCase(),
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      } catch {
        return defaultFormatter;
      }
    }, [currency, locale]);

    return (
      <TickerContext.Provider value={{ formatter }}>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap align-middle",
            className,
          )}
          type="button"
          {...props}
        >
          {children}
        </button>
      </TickerContext.Provider>
    );
  },
);
Ticker.displayName = "Ticker";

export type TickerIconProps = HTMLAttributes<HTMLImageElement> & {
  src?: string | null;
  symbol?: string;
};

export const TickerIcon = memo(
  ({ src, symbol, className, ...props }: TickerIconProps) => {
    const [failed, setFailed] = useState(false);
    const showImg = !!src && !failed;
    return (
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted",
          className,
        )}
      >
        {showImg ? (
          <img
            src={src as string}
            alt=""
            aria-hidden
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setFailed(true)}
            {...props}
          />
        ) : (
          <span className="text-[11px] font-bold text-muted-foreground">
            {(symbol || "?").slice(0, 2).toUpperCase()}
          </span>
        )}
      </span>
    );
  },
);
TickerIcon.displayName = "TickerIcon";

export type TickerSymbolProps = HTMLAttributes<HTMLSpanElement> & {
  symbol: string;
};

export const TickerSymbol = memo(
  ({ symbol, className, ...props }: TickerSymbolProps) => (
    <span className={cn("font-medium", className)} {...props}>
      {symbol.toUpperCase()}
    </span>
  ),
);
TickerSymbol.displayName = "TickerSymbol";

export type TickerPriceProps = HTMLAttributes<HTMLSpanElement> & {
  price: number;
};

export const TickerPrice = memo(
  ({ price, className, ...props }: TickerPriceProps) => {
    const context = useTickerContext();

    const formattedPrice = useMemo(
      () => context.formatter.format(price),
      [price, context],
    );

    return (
      <span className={cn("text-muted-foreground", className)} {...props}>
        {formattedPrice}
      </span>
    );
  },
);
TickerPrice.displayName = "TickerPrice";

export type TickerPriceChangeProps = HTMLAttributes<HTMLSpanElement> & {
  change: number;
  isPercent?: boolean;
};

export const TickerPriceChange = memo(
  ({ change, isPercent, className, ...props }: TickerPriceChangeProps) => {
    const isPositiveChange = useMemo(() => change >= 0, [change]);
    const context = useTickerContext();

    const changeFormatted = useMemo(() => {
      if (isPercent) {
        return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
      }
      return context.formatter.format(change);
    }, [change, isPercent, context]);

    return (
      <span
        className={cn(
          "flex items-center gap-0.5",
          isPositiveChange
            ? "text-green-600 dark:text-green-500"
            : "text-red-600 dark:text-red-500",
          className,
        )}
        {...props}
      >
        <svg
          aria-labelledby="ticker-change-icon-title"
          className={isPositiveChange ? "" : "rotate-180"}
          fill="currentColor"
          height="12"
          role="img"
          viewBox="0 0 24 24"
          width="12"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title id="ticker-change-icon-title">
            {isPositiveChange ? "Up icon" : "Down icon"}
          </title>
          <path d="M24 22h-24l12-20z" />
        </svg>
        {changeFormatted}
      </span>
    );
  },
);
TickerPriceChange.displayName = "TickerPriceChange";
