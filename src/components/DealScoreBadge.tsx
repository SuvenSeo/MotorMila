import { cn } from "@/lib/utils";
import { formatPriceLkrMillions } from "@/lib/formatting";
import { type DealTier, DEAL_TIER_META, getDealTier } from "@/lib/dealTiers";

export type { DealTier };

export interface DealBadgeProps {
  score: number | string | null | undefined;
  /** Asking price — enables the Rs delta readout when paired with fmvLkr. */
  priceLkr?: number | null;
  /** Fair-market reference for the Rs delta readout. */
  fmvLkr?: number | null;
  size?: "sm" | "md";
  showDelta?: boolean;
  className?: string;
}

function formatRsDelta(priceLkr: number, fmvLkr: number): string | null {
  if (!Number.isFinite(priceLkr) || !Number.isFinite(fmvLkr) || fmvLkr <= 0) return null;
  const delta = priceLkr - fmvLkr;
  if (Math.abs(delta) < 1000) return "at FMV";
  const abs = formatPriceLkrMillions(Math.abs(delta));
  return delta < 0 ? `${abs} below` : `${abs} above`;
}

export function DealScoreBadge({
  score,
  priceLkr,
  fmvLkr,
  size = "sm",
  showDelta = true,
  className,
}: DealBadgeProps) {
  const safeScore = Number(score ?? 0);
  const tier = getDealTier(safeScore);
  const meta = DEAL_TIER_META[tier];
  const Icon = meta.Icon;

  const rsDelta =
    priceLkr != null && fmvLkr != null ? formatRsDelta(Number(priceLkr), Number(fmvLkr)) : null;
  const fallbackDelta = `${safeScore > 0 ? "+" : ""}${Number.isFinite(safeScore) ? safeScore : 0}%`;
  const deltaText = rsDelta ?? fallbackDelta;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 font-bold tabular-nums",
        size === "sm" ? "py-0.5 text-caption" : "px-2 py-1 text-footnote",
        meta.classes,
        className,
      )}
      title={`${meta.label} · deal score ${fallbackDelta}`}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
      {meta.label}
      {showDelta && (
        <span className="font-semibold opacity-80">· {deltaText}</span>
      )}
    </span>
  );
}
