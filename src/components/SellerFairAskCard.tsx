import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { formatPrice } from "@/services/api";
import {
  buildSellerFairAskWhatsAppText,
  computeSellerFairAsk,
  type SellerFairAskResult,
} from "@/lib/sellerFairAsk";
import { cn } from "@/lib/utils";

export interface SellerFairAskCardProps {
  marketMedian: number;
  districtMedian?: number | null;
  make?: string;
  model?: string;
  year?: number;
  className?: string;
}

export function SellerFairAskCard({
  marketMedian,
  districtMedian,
  make,
  model,
  year,
  className,
}: SellerFairAskCardProps) {
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
    <section
      className={cn("rounded-2xl border border-border bg-surface p-4", className)}
      aria-label="Private seller fair ask"
    >
      <p className="text-caption font-medium text-muted-foreground">
        Instant Offer · Fair ask
      </p>
      <p className="mt-1 text-caption text-muted-foreground">
        {pack.usedDistrictMedian
          ? "Targets use your district median."
          : "Targets use the market median."}
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Metric label="Suggested ask" value={formatPrice(pack.suggestedAsk)} emphasize />
        <Metric label="Walkaway" value={formatPrice(pack.walkaway)} />
        <Metric
          label="Dealer band"
          value={`${formatPrice(pack.dealerOfferBand.low)} – ${formatPrice(pack.dealerOfferBand.high)}`}
        />
      </div>

      <button
        type="button"
        onClick={handleCopyWhatsApp}
        className="mt-4 flex h-9 w-full items-center justify-center gap-1.5 rounded-2xl border border-deal-good/25 bg-deal-good/10 px-3 text-caption font-semibold text-deal-good-text transition-colors hover:bg-deal-good/15 dark:text-deal-good-text"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3" /> Copied
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" /> Copy WhatsApp text
          </>
        )}
      </button>
    </section>
  );
}

function Metric({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-full border border-border bg-card/40 p-3">
      <p className="text-caption font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "num mt-1 text-footnote font-bold",
          emphasize ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}
