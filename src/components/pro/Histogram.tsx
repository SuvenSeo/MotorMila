import { cn } from "@/lib/utils";

export type BarDatum = {
  key: string;
  /** Visible axis label, kept short ("D3", "12 Nov"). */
  label: string;
  /** Full label for the tooltip and screen readers. */
  fullLabel: string;
  value: number;
  tone?: "primary" | "good" | "bad" | "neutral";
};

const TONE_CLASS = {
  primary: "bg-primary/75 group-hover:bg-primary",
  good: "bg-deal-good/70 group-hover:bg-deal-good",
  bad: "bg-deal-high/70 group-hover:bg-deal-high",
  neutral: "bg-label-3/50 group-hover:bg-label-2",
} as const;

/**
 * A bar series for a distribution (price deciles, deal-score bands) or a short
 * time axis (30 days of supply). One series, one scale, no axis chrome: the
 * shape is the reading. A sparse set of x labels keeps a 30-bar row legible.
 */
export function BarSeries({
  bars,
  height = 120,
  label,
  className,
  showLabels = "sparse",
  valueFormat = (value) => String(value),
}: {
  bars: BarDatum[];
  height?: number;
  /** Accessible summary of the whole series. */
  label: string;
  className?: string;
  showLabels?: "all" | "sparse" | "none";
  valueFormat?: (value: number) => string;
}) {
  if (bars.length === 0) {
    return <p className={cn("py-8 text-center text-footnote text-label-3", className)}>No data</p>;
  }
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  const labelEvery = showLabels === "all" ? 1 : Math.ceil(bars.length / 8);
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-end gap-[3px]" style={{ height }} role="img" aria-label={label}>
        {bars.map((bar) => (
          <div key={bar.key} className="group relative flex h-full flex-1 items-end">
            <div
              className={cn("w-full rounded-t-[2px] transition-colors duration-short", TONE_CLASS[bar.tone ?? "primary"])}
              style={{ height: `${Math.max(2, (bar.value / max) * 100)}%` }}
              title={`${bar.fullLabel}: ${valueFormat(bar.value)}`}
            />
          </div>
        ))}
      </div>
      {showLabels !== "none" ? (
        <div className="mt-1.5 flex gap-[3px]" aria-hidden>
          {bars.map((bar, i) => (
            <span key={bar.key} className="flex-1 truncate text-center text-caption tabular-nums text-label-3">
              {i % labelEvery === 0 ? bar.label : ""}
            </span>
          ))}
        </div>
      ) : null}
      <ul className="sr-only">
        {bars.map((bar) => (
          <li key={bar.key}>{`${bar.fullLabel}: ${valueFormat(bar.value)}`}</li>
        ))}
      </ul>
    </div>
  );
}
