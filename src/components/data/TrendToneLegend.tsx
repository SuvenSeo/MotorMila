import { cn } from "@/lib/utils";
import { STABLE_BAND_PCT } from "@/lib/dataSanity";
import { toneColor } from "@/components/ui/chart-theme";
import { useAppPreferences } from "@/lib/appPreferences";

/**
 * Legend for the buyer-neutral price-change palette used on every trend
 * surface: price up = amber, price down = green, |Δ| < 1% = grey "stable".
 */
export function TrendToneLegend({ className }: { className?: string }) {
  const { t } = useAppPreferences();
  const items = [
    { tone: "down" as const, label: t("trendTone.down", "Price down") },
    { tone: "up" as const, label: t("trendTone.up", "Price up") },
    {
      tone: "stable" as const,
      label: t("trendTone.stable", "Stable (under {n}%)", { n: STABLE_BAND_PCT }),
    },
  ];
  return (
    <ul
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-label-2", className)}
      aria-label={t("trendTone.legendAria", "Price change colour legend")}
    >
      {items.map((i) => (
        <li key={i.tone} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: toneColor(i.tone) }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
