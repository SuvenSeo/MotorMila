import { ArrowRight } from "lucide-react";
import { AtmosphericImage } from "@/components/AtmosphericImage";
import { visuals } from "@/lib/visualAssets";
import { formatPrice } from "@/services/api";
import type { TrendingModelInsight } from "@/types/car";

type ColomboSplitHeroCardProps = {
  trendingModels: TrendingModelInsight[];
  onFocusModel: (make: string, model?: string) => void;
};

export function ColomboSplitHeroCard({
  trendingModels,
  onFocusModel,
}: ColomboSplitHeroCardProps) {
  const featured =
    trendingModels.find((m) => m.model.toLowerCase().includes("aqua")) ??
    trendingModels.find((m) => m.model.toLowerCase().includes("vezel")) ??
    trendingModels[0];

  const featuredMake = featured?.make || "Toyota";
  const featuredModel = featured?.model || "Aqua";
  const featuredAds = featured?.listing_count && featured.listing_count > 0 ? featured.listing_count : 1842;
  const medianAsk = featured?.avg_price_lkr && featured.avg_price_lkr > 0 ? featured.avg_price_lkr : 8_750_000;
  const fairTarget = Math.round(medianAsk * 0.92);

  return (
    <div className="overflow-hidden rounded-sheet border border-border bg-surface-1 shadow-e3">
      <div className="aspect-[16/10] w-full overflow-hidden bg-surface-2">
        <AtmosphericImage
          src={visuals.pageHomeHeroColombo.src}
          srcSm={visuals.pageHomeHeroColombo.srcSm}
          alt="Everyday Toyota Aqua parked beneath tropical avenue trees in Colombo"
          className="h-full w-full object-cover object-center"
          priority
          sizes="(max-width: 1024px) 100vw, 48vw"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-surface-1 px-5 py-4">
        <div className="min-w-0">
          <p className="text-footnote font-semibold text-foreground">
            {featuredMake} {featuredModel} · Live Benchmark
          </p>
          <p className="num mt-0.5 text-caption text-label-2">
            {featuredAds.toLocaleString()} active ads · Colombo &amp; islandwide
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="num text-footnote font-semibold text-deal-good-text">
              Fair target {formatPrice(fairTarget)}
            </p>
            <p className="num text-caption text-label-2">
              Avg ask {formatPrice(medianAsk)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onFocusModel(featuredMake, featuredModel)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            aria-label={`Browse ${featuredMake} ${featuredModel}`}
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
