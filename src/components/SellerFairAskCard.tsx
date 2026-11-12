import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { formatPrice } from "@/services/api";
import {
  buildSellerFairAskWhatsAppText,
  computeSellerFairAsk,
  type SellerFairAskResult,
} from "@/lib/sellerFairAsk";
import { useAppPreferences } from "@/lib/appPreferences";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedLkr, Stat } from "@/components/tools/ToolKit";

export interface SellerFairAskCardProps {
  marketMedian: number;
  districtMedian?: number | null;
  make?: string;
  model?: string;
  year?: number;
  className?: string;
}

/** Private-seller pricing pack on /estimate: suggested ask, walkaway, dealer band. */
export function SellerFairAskCard({
  marketMedian,
  districtMedian,
  make,
  model,
  year,
  className,
}: SellerFairAskCardProps) {
  const { t } = useAppPreferences();
  const pack: SellerFairAskResult | null = computeSellerFairAsk({
    marketMedian,
    districtMedian,
  });
  const [copied, setCopied] = useState(false);

  if (!pack) return null;

  const handleCopyWhatsApp = async () => {
    const text = buildSellerFairAskWhatsAppText({
      make,
      model,
      year,
      suggestedAsk: pack.suggestedAsk,
      walkaway: pack.walkaway,
      dealerOfferBand: pack.dealerOfferBand,
      formatLkr: formatPrice,
    });
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Clipboard blocked — leave button idle.
    }
  };

  return (
    <Card padding="sm" className={className} aria-label={t("tools.fairAsk.aria", "Private seller fair ask")}>
      <p className="text-footnote font-semibold text-foreground">{t("tools.fairAsk.title", "Instant offer · fair ask")}</p>
      <p className="mt-0.5 text-caption text-label-2">
        {pack.usedDistrictMedian
          ? t("tools.fairAsk.district", "Targets use your district median.")
          : t("tools.fairAsk.market", "Targets use the market median.")}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label={t("tools.fairAsk.ask", "Suggested ask")} value={<AnimatedLkr value={pack.suggestedAsk} />} emphasis />
        <Stat label={t("tools.fairAsk.walkaway", "Walkaway")} value={<AnimatedLkr value={pack.walkaway} />} />
        <Stat
          label={t("tools.fairAsk.dealer", "Dealer band")}
          value={`${formatPrice(pack.dealerOfferBand.low)} – ${formatPrice(pack.dealerOfferBand.high)}`}
        />
      </div>

      <Button type="button" variant="secondary" size="sm" className="mt-4 w-full" onClick={handleCopyWhatsApp}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? t("tools.fairAsk.copied", "Copied") : t("tools.fairAsk.copy", "Copy WhatsApp text")}
      </Button>
    </Card>
  );
}
