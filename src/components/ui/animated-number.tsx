import { memo, useMemo } from "react";

import { cn } from "@/lib/utils";
import { usePrefersReducedMotionOrLowData } from "@/lib/motion";

/** Intl.NumberFormat options (the subset number formatting here uses). */
export type Format = Intl.NumberFormatOptions;

type AnimatedNumberProps = {
  value: number;
  format?: Format;
  locales?: string | string[];
  prefix?: string;
  suffix?: string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(locales: string | string[], format?: Format): Intl.NumberFormat {
  const key = `${String(locales)}|${format ? JSON.stringify(format) : ""}`;
  let f = formatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locales, format);
    } catch {
      f = new Intl.NumberFormat("en-US", format);
    }
    formatters.set(key, f);
  }
  return f;
}

/** One digit column: a 0–9 strip moved by transform (compositor only). */
const RollDigit = memo(function RollDigit({ digit }: { digit: number }) {
  return (
    <span className="roll-num__digit">
      {/* In-flow copy: gives the column its width and the text baseline. */}
      <span className="roll-num__ghost">{digit}</span>
      <span className="roll-num__strip" style={{ transform: `translate3d(0, ${-digit * 10}%, 0)` }}>
        {DIGITS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </span>
    </span>
  );
});

/**
 * AnimatedNumber — the one number animator (prices, counts, KPIs, totals).
 * Each digit is a 0–9 strip that slides by CSS transform when the value
 * changes, so an update costs one small React commit and no layout reads
 * (number-flow measured every digit with getBoundingClientRect on each
 * change: ~90 ms per number at 4x CPU, inside the tap that changed it).
 * Columns are keyed by place value so units roll into units. Tabular figures
 * keep the width steady; instant under reduced motion / low data.
 */
export function AnimatedNumber({ value, format, locales = "en-LK", prefix, suffix, className }: AnimatedNumberProps) {
  const calm = usePrefersReducedMotionOrLowData();
  const parts = useMemo(() => {
    const text = Number.isFinite(value) ? formatterFor(locales, format).format(value) : "–";
    const chars = Array.from(text);
    let place = chars.filter((c) => c >= "0" && c <= "9").length;
    return {
      text,
      chars: chars.map((c, i) => {
        const isDigit = c >= "0" && c <= "9";
        if (isDigit) place -= 1;
        return { c, isDigit, key: isDigit ? `d${place}` : `s${i}-${c}` };
      }),
    };
  }, [value, locales, format]);

  return (
    <span className={cn("roll-num tabular-nums", calm && "roll-num--calm", className)}>
      <span className="sr-only">{`${prefix ?? ""}${parts.text}${suffix ?? ""}`}</span>
      <span aria-hidden className="roll-num__row">
        {prefix}
        {parts.chars.map((p) => (p.isDigit ? <RollDigit key={p.key} digit={Number(p.c)} /> : <span key={p.key}>{p.c}</span>))}
        {suffix}
      </span>
    </span>
  );
}
