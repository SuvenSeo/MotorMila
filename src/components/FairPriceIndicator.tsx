import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEAL_TIER_META, getDealTier } from "@/lib/dealTiers";
import { formatPriceLkrMillions } from "@/lib/formatting";
import { useAppPreferences } from "@/lib/appPreferences";

interface FairPriceIndicatorProps {
  score: number;
  condition?: string;
  size?: "sm" | "lg";
  /** Asking price — enables the Rs delta readout when paired with fmvLkr. */
  priceLkr?: number | null;
  /** Fair-market reference for the Rs delta readout. */
  fmvLkr?: number | null;
  className?: string;
}

function getTierBadgeClasses(tier: keyof typeof DEAL_TIER_META, size: "sm" | "lg"): string {
  const isSm = size === "sm";
  const tone = DEAL_TIER_META[tier].classes;
  return isSm
    ? cn(tone, "border p-1 px-2.5 text-caption font-mono")
    : cn(tone, "border-0 bg-transparent p-0 text-title1 tracking-tight");
}

export function FairPriceIndicator({
  score,
  condition,
  size = "sm",
  priceLkr,
  fmvLkr,
  className,
}: FairPriceIndicatorProps) {
  const { t } = useAppPreferences();
  const tier = getDealTier(score);
  const meta = DEAL_TIER_META[tier];
  const badgeClasses = getTierBadgeClasses(tier, size);
  const Icon = meta.Icon;

  const rsDelta =
    priceLkr != null && fmvLkr != null && Number.isFinite(Number(priceLkr)) && Number(fmvLkr) > 0
      ? (() => {
          const delta = Number(priceLkr) - Number(fmvLkr);
          if (Math.abs(delta) < 1000) return t("fairPrice.atFmv", "at FMV");
          const abs = formatPriceLkrMillions(Math.abs(delta));
          return delta < 0
            ? t("fairPrice.belowFmv", "{amount} below FMV", { amount: abs })
            : t("fairPrice.aboveFmv", "{amount} above FMV", { amount: abs });
        })()
      : null;

  const label =
    tier === "steal" ? "Steal Deal" : tier === "great" ? "Great Deal" : tier === "fair" ? "Fair Price" : "Overpriced";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex items-center gap-1.5 cursor-help transition-ui duration-short hover:opacity-80 active:scale-[0.98]", size === "sm" ? "font-semibold rounded" : "font-semibold", badgeClasses, className)}>
            <Icon className={cn("opacity-70", size === "sm" ? "h-3 w-3" : "h-6 w-6 ml-2")} aria-hidden />
            {label}
            {rsDelta && size === "sm" && (
              <span className="font-mono normal-case tracking-normal opacity-80">· {rsDelta}</span>
            )}
            <Info className={cn("opacity-60", size === "sm" ? "w-3 h-3" : "w-6 h-6 ml-2")} />
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          sideOffset={8}
          collisionPadding={16}
          className="max-w-[280px] bg-popover border border-border p-4 shadow-soft-xl rounded-xl z-50"
        >
          <div className="space-y-3">
            <h4 className="text-caption font-semibold tracking-tight text-primary-bright border-b border-border pb-2 mb-2">Dynamic Value Methodology</h4>
            <p className="text-footnote text-foreground leading-relaxed font-medium">
              We calculate <span className="text-foreground font-semibold">Fair Price</span> using a proprietary multi-factor algorithm against thousands of active Sri Lankan listings.
            </p>
            <ul className="text-caption text-muted-foreground space-y-1.5 font-medium">
              <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-primary" /> Adjusts for Vehicle Mileage & Age</li>
              <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-primary" /> Appraises Condition & Seller Trust</li>
              <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-primary" /> Accounts for live Market Demand</li>
              <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-primary" /> Factors in prevailing Import Duties</li>
            </ul>
            <div className="bg-surface p-2 rounded border border-border mt-2">
              <p className="ui-caption italic">Scores between -5 and +8 typically fall comfortably within the {condition === "brand_new" ? "New Fair Price" : "Used Fair Price"} band.</p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
