import { type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { AtmosphericImage } from "@/components/AtmosphericImage";
import { HeroSearchBar } from "@/components/hero/HeroSearchBar";
import { HeroStatsStrip } from "@/components/hero/HeroStatsStrip";
import { EvidenceHeroPanel } from "@/components/hero/EvidenceHeroPanel";
import { TelemetryMapHeroPanel } from "@/components/hero/TelemetryMapHeroPanel";
import { ColomboSplitHeroCard } from "@/components/hero/ColomboSplitHeroCard";
import { formatPrice } from "@/services/api";
import { resolveHeroTone, type HeroVariant } from "@/lib/heroVariants";
import { cn } from "@/lib/utils";
import type {
  DistrictVelocityPoint,
  HotDealInsight,
  StatsOverview,
  TrendingModelInsight,
} from "@/types/car";

type SharedSearchProps = Omit<ComponentProps<typeof HeroSearchBar>, "tone" | "compact">;

type RedesignedHeroProps = {
  heroVariant: HeroVariant;
  resolvedTheme: "dark" | "light";
  stats: StatsOverview | null;
  liveCount: number;
  sourceCount: number;
  heroStatsLoading: boolean;
  trendingModels: TrendingModelInsight[];
  hotDeals: HotDealInsight[];
  velocityPoints: DistrictVelocityPoint[];
  searchProps: SharedSearchProps;
  onFilterDistrict: (district: string) => void;
  t: (key: string, fallback?: string) => string;
};

type CopyBlock = {
  eyebrow: string;
  headlineLead: string;
  headlineAccent: string;
  body: string;
};

function copyForVariant(variant: HeroVariant, liveCount: number, sourceCount: number): CopyBlock {
  const adsLabel = liveCount > 0 ? liveCount.toLocaleString() : "207,000+";
  const srcLabel = sourceCount > 0 ? String(sourceCount) : "13";

  switch (variant.id) {
    case "evidence":
      return {
        eyebrow: "Sri Lanka Fair-Price Index",
        headlineLead: "Every asking price, ",
        headlineAccent: "checked against the market.",
        body: `Search ${adsLabel} live ads across ${srcLabel} local marketplaces — with comparable listings, spread distributions, and price history shown openly.`,
      };
    case "telemetry-map":
      return {
        eyebrow: "24 Districts · Real-Time Price Pulse",
        headlineLead: "See what vehicles really ask across ",
        headlineAccent: "Sri Lanka.",
        body: "Asking prices shift sharply between Colombo, Gampaha, Kandy, and Kurunegala. Select any district to inspect supply, median asks, and top listed models.",
      };
    case "plaster-gallery":
      return {
        eyebrow: "Independent Valuation · Not a Dealer",
        headlineLead: "Know what a car is ",
        headlineAccent: "actually worth before you call.",
        body: `Compare asking prices across ${adsLabel} ads in seconds. No showroom hype — just clean comparables behind every ask.`,
      };
    case "colombo-split":
    default:
      return {
        eyebrow: "Built for Real Sri Lankan Buyers",
        headlineLead: "One search for every ",
        headlineAccent: "Sri Lankan motor.",
        body: "From Toyota Aquas in Colombo to Wagon Rs in Kurunegala and Bajaj three-wheelers islandwide — check fair price before you inspect.",
      };
  }
}

export function RedesignedHero({
  heroVariant,
  resolvedTheme,
  stats,
  liveCount,
  sourceCount,
  heroStatsLoading,
  trendingModels,
  hotDeals,
  velocityPoints,
  searchProps,
  onFilterDistrict,
  t,
}: RedesignedHeroProps) {
  const effectiveTone = resolveHeroTone(heroVariant, resolvedTheme);
  const copy = copyForVariant(heroVariant, liveCount, sourceCount);
  const districtCount = Number(stats?.district_count || 24);
  const goodDealsCount = Number(stats?.good_deals_count || 2156);

  const tickerItems = buildTickerItems(trendingModels, hotDeals);

  const isPlaster = heroVariant.id === "plaster-gallery";
  const isPhotoStage = heroVariant.surfaceKind === "photo-stage" && heroVariant.image;

  const surfaceClass = cn(
    "mm-hero-stage -mt-[var(--nav-offset)] pt-[var(--nav-offset)]",
    isPlaster && "mm-hero-plaster",
    isPhotoStage && "flex min-h-[clamp(600px,84svh,840px)] flex-col justify-between",
  );

  const contentWrapClass = cn(
    "relative z-10 mx-auto w-full max-w-[1560px] px-5 sm:px-6",
    isPhotoStage ? "flex flex-1 flex-col justify-end py-10 lg:py-14" : "py-10 lg:py-14",
  );

  let rightPanel: ReactNode = null;
  if (heroVariant.id === "evidence") {
    rightPanel = (
      <EvidenceHeroPanel
        trendingModels={trendingModels}
        onFocusModel={searchProps.focusModel}
      />
    );
  } else if (heroVariant.id === "telemetry-map") {
    rightPanel = (
      <TelemetryMapHeroPanel
        velocityPoints={velocityPoints}
        onFilterDistrict={onFilterDistrict}
      />
    );
  } else if (heroVariant.id === "colombo-split") {
    rightPanel = (
      <ColomboSplitHeroCard
        trendingModels={trendingModels}
        onFocusModel={searchProps.focusModel}
      />
    );
  }

  return (
    <section
      id="overview"
      data-hero-variant={heroVariant.id}
      data-hero-tone={effectiveTone}
      className={surfaceClass}
    >
      {/* Subtle zero-image background aura for Options 01 & 02 */}
      {heroVariant.id === "evidence" ? (
        <div aria-hidden className="mm-hero-aura-evidence pointer-events-none absolute inset-0" />
      ) : null}
      {heroVariant.id === "telemetry-map" ? (
        <div aria-hidden className="mm-hero-aura-map pointer-events-none absolute inset-0" />
      ) : null}

      {/* Architectural backdrop photo layer for Option 04 */}
      {isPhotoStage && heroVariant.image ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <AtmosphericImage
            key={heroVariant.id}
            src={heroVariant.image.src}
            srcSm={heroVariant.image.srcSm}
            className={cn("h-full w-full object-cover", heroVariant.imageOpacity)}
            style={{ objectPosition: heroVariant.objectPosition } as CSSProperties}
            priority
            sizes="100vw"
          />
          <div className="mm-hero-plaster__scrim absolute inset-0" />
        </div>
      ) : null}

      {/* Live market data ribbon (Option 01 only) */}
      {heroVariant.id === "evidence" && tickerItems.length > 0 ? (
        <div className="mm-hero-ticker-wrap relative z-10 py-2">
          <div className="mm-hero-ticker px-4">
            {[...tickerItems, ...tickerItems].map((item, idx) => (
              <span
                key={`${item.label}-${idx}`}
                className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-caption text-label-2"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    item.positive ? "bg-deal-good" : "bg-primary",
                  )}
                  aria-hidden
                />
                <span className="font-medium text-foreground">{item.label}</span>
                <span className="num">{item.meta}</span>
                {item.delta ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 num font-semibold",
                      item.positive ? "text-deal-good-text" : "text-label-2",
                    )}
                  >
                    {item.positive ? (
                      <TrendingDown className="h-3 w-3" aria-hidden />
                    ) : (
                      <TrendingUp className="h-3 w-3" aria-hidden />
                    )}
                    {item.delta}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className={contentWrapClass}>
        {rightPanel ? (
          <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-6">
              <p className="inline-flex items-center gap-2 text-caption font-semibold uppercase tracking-caps text-primary">
                <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
                {copy.eyebrow}
              </p>

              <h1 className="mm-hero-title mm-hero-title--compact mt-3 text-foreground">
                {copy.headlineLead}
                <span className="text-primary">{copy.headlineAccent}</span>
              </h1>

              <p className="mt-4 max-w-xl text-body leading-relaxed text-label-2 sm:text-callout">
                {copy.body}
              </p>

              <HeroSearchBar
                {...searchProps}
                tone={effectiveTone}
                compact={heroVariant.id === "telemetry-map"}
              />

              <HeroStatsStrip
                liveCount={liveCount}
                sourceCount={sourceCount}
                districtCount={districtCount}
                goodDealsCount={goodDealsCount}
                loading={heroStatsLoading}
                t={t}
              />
            </div>

            <div className="lg:col-span-6">{rightPanel}</div>
          </div>
        ) : (
          <div className="w-full">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-1/85 px-3.5 py-1.5 text-caption font-semibold text-foreground">
                <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
                {copy.eyebrow}
              </p>

              <h1 className="mm-hero-title mt-5 text-foreground">
                {copy.headlineLead}
                <span className="text-primary">{copy.headlineAccent}</span>
              </h1>

              <p className="mt-4 max-w-xl text-body leading-relaxed text-label-2 sm:text-callout">
                {copy.body}
              </p>

              <HeroSearchBar {...searchProps} tone={effectiveTone} />
            </div>

            <HeroStatsStrip
              liveCount={liveCount}
              sourceCount={sourceCount}
              districtCount={districtCount}
              goodDealsCount={goodDealsCount}
              loading={heroStatsLoading}
              t={t}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function buildTickerItems(
  trendingModels: TrendingModelInsight[],
  hotDeals: HotDealInsight[],
): { label: string; meta: string; delta?: string; positive?: boolean }[] {
  const rows: { label: string; meta: string; delta?: string; positive?: boolean }[] = [];

  for (const m of trendingModels.slice(0, 4)) {
    if (!m.make || !m.avg_price_lkr) continue;
    const pct = m.movement_pct;
    rows.push({
      label: `${m.make} ${m.model}`,
      meta: `${formatPrice(m.avg_price_lkr)} · ${m.listing_count.toLocaleString()} ads`,
      delta: pct !== null && pct !== 0 ? `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%` : undefined,
      positive: pct !== null ? pct <= 0 : undefined,
    });
  }

  for (const d of hotDeals.slice(0, 3)) {
    if (!d.make || !d.price_lkr) continue;
    rows.push({
      label: `${d.make} ${d.model} ${d.year}`,
      meta: `${d.district || "Sri Lanka"} · ${formatPrice(d.price_lkr)}`,
      delta: `Deal +${Math.round(d.deal_score)}`,
      positive: true,
    });
  }

  if (rows.length === 0) {
    rows.push(
      { label: "Toyota Aqua", meta: "Colombo · Rs 8.45M", delta: "-6.9%", positive: true },
      { label: "Honda Vezel", meta: "Gampaha · Rs 17.4M", delta: "+9.6%", positive: false },
      { label: "Suzuki Wagon R", meta: "Kurunegala · Rs 7.6M", delta: "-4.2%", positive: true },
      { label: "Bajaj RE", meta: "Islandwide · Rs 1.08M", delta: "+1.5%", positive: false },
    );
  }

  return rows;
}
