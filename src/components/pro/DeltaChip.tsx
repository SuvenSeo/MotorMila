import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatSignedPct, momentum } from "@/lib/proAnalytics";
import { useAppPreferences } from "@/lib/appPreferences";

type Polarity = "price" | "volume" | "score" | "neutral";
type Direction = "up" | "down" | "flat" | "none";

/**
 * Polarity says which direction is good news for the reader.
 * - price: a buyer wants lower, so a fall is favourable.
 * - volume/score: higher is favourable.
 * - neutral: direction is coloured only by the sign of the number's meaning,
 *   with no good/bad judgement (used for pure counts).
 */
function tone(pct: number | null, polarity: Polarity): Direction {
  const direction = momentum(pct);
  if (direction == null) return "none";
  if (direction === "flat") return "flat";
  const rising = direction === "rising";
  if (polarity === "neutral") return rising ? "up" : "down";
  const favourable = polarity === "price" ? !rising : rising;
  return favourable ? (rising ? "up" : "down") : rising ? "down" : "up";
}

const STYLES: Record<Direction, string> = {
  up: "border-deal-good/30 bg-deal-good/10 text-deal-good-text",
  down: "border-deal-high/30 bg-deal-high/10 text-deal-high-text",
  flat: "border-border bg-surface-2 text-label-2",
  none: "border-border bg-surface-2 text-label-3",
};

const ICONS = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;

/**
 * A signed change with the direction stated three ways: an arrow, a colour and
 * the text of the number itself. Buyers read "−4.2%" as good news, so the
 * colour follows `polarity`, never the raw sign.
 */
export function DeltaChip({
  pct,
  polarity = "price",
  period,
  className,
  size = "sm",
}: {
  pct: number | null | undefined;
  polarity?: Polarity;
  /** The window the change covers, e.g. "vs last month". */
  period?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const { t } = useAppPreferences();
  const formatted = formatSignedPct(pct);
  const direction = tone(pct ?? null, polarity);
  const Icon = direction === "none" ? Minus : ICONS[direction as "up" | "down" | "flat"];
  const spoken = formatted
    ? `${direction === "flat" ? t("pro.delta.flat", "Unchanged") : formatted} ${period ?? ""}`.trim()
    : t("pro.delta.noComparison", "No comparison available");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold tabular-nums",
        size === "sm" ? "px-1.5 py-0.5 text-caption" : "px-2 py-1 text-footnote",
        STYLES[direction],
        className,
      )}
      title={spoken}
      aria-label={spoken}
    >
      <Icon aria-hidden className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      <span>{formatted ?? "—"}</span>
      {period ? <span className="font-medium opacity-70">{period}</span> : null}
    </span>
  );
}

/** A static verdict for a value that has no time series (e.g. "12 of 38 lanes"). */
export function StatPill({
  children,
  tone: pillTone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "bad" | "accent";
  className?: string;
}) {
  const styles = {
    neutral: "border-border bg-surface-2 text-label-2",
    good: "border-deal-good/30 bg-deal-good/10 text-deal-good-text",
    bad: "border-deal-high/30 bg-deal-high/10 text-deal-high-text",
    accent: "border-primary/25 bg-primary/10 text-primary",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-caption font-semibold tabular-nums",
        styles[pillTone],
        className,
      )}
    >
      {children}
    </span>
  );
}
