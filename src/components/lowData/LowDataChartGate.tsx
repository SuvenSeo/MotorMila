import { useState, type ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { useLowData } from "@/hooks/useLowData";
import { useAppPreferences } from "@/lib/appPreferences";
import { cn } from "@/lib/utils";

/**
 * Wrap any chart: in low-data mode it renders a tap-to-load placeholder and
 * only mounts (and downloads the chart chunk for) `children` after a tap.
 * Pass a lazy chart as children so nothing heavy loads before the tap.
 */
export function LowDataChartGate({
  children,
  label,
  minHeight = 160,
  className,
}: {
  children: ReactNode;
  /** What the chart shows, e.g. "Price history". */
  label?: string;
  minHeight?: number;
  className?: string;
}) {
  const { lowData } = useLowData();
  const { t } = useAppPreferences();
  const [revealed, setRevealed] = useState(false);
  if (!lowData || revealed) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      style={{ minHeight }}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface/60 p-4 text-center text-footnote font-semibold text-foreground hover:border-primary/40",
        className,
      )}
    >
      <BarChart3 className="h-5 w-5 text-primary" aria-hidden />
      <span>{label ? t("lowData.chartTapNamed", "Tap to load: {label}", { label }) : t("lowData.chartTap", "Tap to load chart")}</span>
      <span className="text-caption font-normal text-muted-foreground">{t("lowData.chartHint", "Low-data mode is on")}</span>
    </button>
  );
}
