import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BarChart2, Car, TrendingUp } from "lucide-react";
import { getMakeModelInsight, getListings, getListingsForExport, getVehicleSafetyResearch, formatPrice } from "@/services/api";
import { revealContainer, revealItem } from "@/lib/motion";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { ListingCard } from "@/components/ListingCard";
import { ModelPriceTimeMachine } from "@/components/ModelPriceTimeMachine";
import { ModelTrendPanel } from "@/components/ModelTrendPanel";
import { BuyOrWaitCard } from "@/components/BuyOrWaitCard";
import { MileagePriceScatter } from "@/components/MileagePriceScatter";
import { SectionHeader } from "@/components/SectionHeader";
import { NhtsaModelsCard } from "@/components/NhtsaModelsCard";
import { SafetyResearchCard } from "@/components/SafetyResearchCard";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { QUERY_STALE } from "@/lib/queryPolicy";
import { useAppPreferences } from "@/lib/appPreferences";

const SITE = BRAND.siteName;
const ORIGIN = BRAND.origin;

function toTitleCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export default function MakeModelHub() {
  const { t } = useAppPreferences();
  const { make: makeParam = "", model: modelParam = "", year: yearParam } = useParams<{
    make: string;
    model: string;
    year?: string;
  }>();
  const yearFilter = yearParam ? Number.parseInt(yearParam, 10) : undefined;
  const yearOk = typeof yearFilter === "number" && Number.isFinite(yearFilter) && yearFilter > 1970;

  const makeDisplay = toTitleCase(decodeURIComponent(makeParam));
  const modelDisplay = toTitleCase(decodeURIComponent(modelParam));
  const vehicleLabel = `${makeDisplay} ${modelDisplay}${yearOk ? ` ${yearFilter}` : ""}`.trim();

  const insightQuery = useQuery({
    queryKey: ["make-model-insight", makeParam, modelParam],
    queryFn: () => getMakeModelInsight(makeParam, modelParam),
    enabled: Boolean(makeParam && modelParam),
    staleTime: QUERY_STALE.hub,
  });

  const listingsQuery = useQuery({
    queryKey: ["listings", { make: makeParam, model: modelParam, year: yearOk ? yearFilter : undefined, sort: "newest", page: 1 }],
    queryFn: () =>
      getListings({
        make: makeParam,
        model: modelParam,
        sort: "newest",
        page: 1,
        ...(yearOk ? { year_min: yearFilter, year_max: yearFilter } : {}),
      }),
    enabled: Boolean(makeParam && modelParam),
    staleTime: QUERY_STALE.listings,
  });

  const scatterQuery = useQuery({
    queryKey: ["scatter-listings", makeParam, modelParam, yearOk ? yearFilter : undefined],
    queryFn: () =>
      getListingsForExport(
        {
          make: makeParam,
          model: modelParam,
          sort: "price_asc",
          page: 1,
          ...(yearOk ? { year_min: yearFilter, year_max: yearFilter } : {}),
        },
        80,
      ),
    enabled: Boolean(makeParam && modelParam),
    staleTime: QUERY_STALE.listings,
  });

  const sampleYear = listingsQuery.data?.listings?.[0]?.year;
  const safetyQuery = useQuery({
    queryKey: ["vehicle-safety-research", makeParam, modelParam, sampleYear],
    queryFn: () =>
      getVehicleSafetyResearch({
        make: makeDisplay,
        model: modelDisplay,
        year: typeof sampleYear === "number" ? sampleYear : undefined,
      }),
    enabled: Boolean(makeParam && modelParam),
    staleTime: QUERY_STALE.market,
  });

  const insight = insightQuery.data;
  const canonicalMake = insight?.make ?? makeDisplay;
  const canonicalModel = insight?.model ?? modelDisplay;
  const vehicle = `${canonicalMake} ${canonicalModel}`.trim();
  const title = t(
    "seo.hubTitle",
    "{vehicle} — Prices & Listings in Sri Lanka | {site}",
    { vehicle, site: SITE },
  );
  const description = insight
    ? t(
        "seo.hubListingsDesc",
        "{count} {vehicle} listings in Sri Lanka. Average price {avg}, median {median}. Browse live market data on Motormila.",
        {
          count: insight.total,
          vehicle,
          avg: formatPrice(insight.avg_price_lkr),
          median: formatPrice(insight.median_price_lkr),
        },
      )
    : t(
        "seo.hubBrowseDesc",
        "Browse {vehicle} prices, listings, and market intelligence for the Sri Lankan vehicle market on Motormila.",
        { vehicle: vehicleLabel },
      );

  useEffect(() => {
    document.title = title;

    const setMeta = (name: string, content: string) => {
      let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", name);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };

    const setProperty = (property: string, content: string) => {
      let tag = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("property", property);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };

    // Canonical + JSON-LD owned by global RouteMeta (id motormila-jsonld) —
    // page-level writes removed to avoid last-write-wins collision.
    const pathname = yearOk
      ? `/cars/${encodeURIComponent(makeParam)}/${encodeURIComponent(modelParam)}/${yearFilter}`
      : `/cars/${encodeURIComponent(makeParam)}/${encodeURIComponent(modelParam)}`;
    setMeta("description", description);
    setProperty("og:title", title);
    setProperty("og:description", description);
    setProperty("og:url", `${ORIGIN}${pathname}`);
    setMeta("twitter:title", title);
    setMeta("twitter:description", description);
  }, [title, description, makeParam, modelParam, yearOk, yearFilter, insight, vehicle, t]);

  const isPending = insightQuery.isPending;
  const isError = insightQuery.isError && !insightQuery.data;

  const recentListings = listingsQuery.data?.listings?.slice(0, 4) ?? [];

  const scatterPoints = useMemo(() => {
    const listings = scatterQuery.data?.listings ?? [];
    return listings
      .filter(
        (l) =>
          l.mileage_km !== null &&
          l.mileage_km !== undefined &&
          Number.isFinite(l.mileage_km) &&
          l.mileage_km >= 0 &&
          l.price_lkr !== null &&
          Number.isFinite(l.price_lkr) &&
          (l.price_lkr ?? 0) > 0,
      )
      .map((l) => ({
        mileage: l.mileage_km as number,
        price_lkr: l.price_lkr as number,
        id: l.id,
        label: `${l.make} ${l.model} ${l.year}`,
      }));
  }, [scatterQuery.data]);

  const statsCards = [
    {
      label: t("hub.liveListings", "Live listings"),
      value: isPending ? "…" : insight ? insight.total.toLocaleString() : t("common.na", "N/A"),
      note: t("hub.listingsTracked", "{vehicle} listings tracked now", { vehicle }),
    },
    {
      label: t("hub.avgPrice", "Average price"),
      value: isPending ? "…" : formatPrice(insight?.avg_price_lkr ?? null),
      note: t("hub.avgNote", "Mean across priced listings"),
    },
    {
      label: t("hub.medianPrice", "Median price"),
      value: isPending ? "…" : formatPrice(insight?.median_price_lkr ?? null),
      note: t("hub.medianNote", "Midpoint of priced listings"),
    },
  ];

  return (
    <PageCanvas>
      <PageHero
        theme="default"
        eyebrow={t("hub.eyebrow", "Make · model hub")}
        eyebrowIcon={Car}
        watermarkIcon={BarChart2}
        title={isPending ? vehicleLabel : vehicle}
        description={
          <>
            {t("hub.description", "Live prices, district demand, and inventory for {vehicle} in Sri Lanka.", {
              vehicle,
            })}{" "}
            <Link
              to={`/cars/${encodeURIComponent(makeParam)}`}
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              {t("hub.allMakeModels", "All {make} models", { make: canonicalMake })}
            </Link>
          </>
        }
        highlights={[
          {
            label: t("hub.eyebrow", "Make · model hub"),
            value: t("common.live", "Live"),
            hint: t("hub.inventoryHint", "Sri Lanka inventory lane"),
          },
          {
            label: t("hub.districts", "Districts"),
            value: "25+",
            hint: t("hub.geoHint", "Geographic breakdown"),
          },
          {
            label: t("hub.listingsHighlight", "Listings"),
            value: t("hub.indexed", "Indexed"),
            hint: t("hub.inventoryHint", "Sri Lanka inventory lane"),
          },
        ]}
      >
        <div className="mt-10 sm:mt-12">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-live-dot" />
            <h2 className="text-caption font-semibold text-muted-foreground">
              {t("hub.snapshot", "Market snapshot")}
            </h2>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-soft sm:grid-cols-3">
            {statsCards.map((card) => (
              <div key={card.label} className="bg-card p-6">
                <p className="text-caption font-semibold text-muted-foreground">
                  {card.label}
                </p>
                <p className="num mt-2.5 text-title1 font-bold tracking-tight text-foreground sm:text-title1">
                  {card.value}
                </p>
                {card.note && (
                  <p className="mt-2 text-caption font-medium text-muted-foreground">{card.note}</p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-6">
            <ModelTrendPanel make={makeParam} model={modelParam} />
            <BuyOrWaitCard make={makeParam} model={modelParam} className="mt-4" />
          </div>
        </div>
      </PageHero>

      <PageBody className="space-y-16 lg:space-y-24">
        {isError && (
          <motion.div
            variants={revealItem}
            className="rounded-2xl border border-border bg-card p-6 text-footnote font-medium text-muted-foreground shadow-soft"
          >
            {t(
              "hub.loadError",
              "Could not load market data for this vehicle. Try browsing listings directly.",
            )}
          </motion.div>
        )}

        {(isPending || (insight && insight.top_districts.length > 0)) && (
          <motion.section variants={revealItem}>
            <SectionHeader
              eyebrow={t("hub.geography", "Geography")}
              title={t("hub.topDistricts", "Top districts")}
              className="mb-8"
            />
            {isPending ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 rounded-2xl border border-border bg-surface animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <motion.div
                variants={revealContainer}
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              >
                {insight!.top_districts.map((entry) => (
                  <motion.div key={entry.district} variants={revealItem}>
                    <Link
                      to={`/locations/${encodeURIComponent(entry.district)}`}
                      className="group block rounded-2xl border border-border bg-card p-5 shadow-soft transition-ui duration-medium hover:-translate-y-1 hover:border-primary/30 hover:shadow-soft-lg no-underline"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-body font-bold tracking-tight text-foreground">
                          {entry.district}
                        </p>
                        <span className="num shrink-0 rounded-full border border-border bg-surface px-2.5 py-0.5 text-caption font-bold text-muted-foreground">
                          {entry.count}{" "}
                          {entry.count !== 1
                            ? t("common.listings", "listings")
                            : t("common.listing", "listing")}
                        </span>
                      </div>
                      <p className="num mt-3 text-callout font-bold tracking-tight text-foreground">
                        {entry.avg_price_lkr != null
                          ? formatPrice(entry.avg_price_lkr)
                          : t("common.priceNa", "Price N/A")}
                        {entry.avg_price_lkr != null && (
                          <span className="ml-1.5 text-caption font-medium text-muted-foreground">
                            {t("hub.avgShort", "avg")}
                          </span>
                        )}
                      </p>
                    </Link>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </motion.section>
        )}

        <motion.div variants={revealItem}>
          <ModelPriceTimeMachine make={makeParam} model={modelParam} />
        </motion.div>

        <motion.section variants={revealItem}>
          <SectionHeader
            eyebrow={t("hub.mileageScatterEyebrow", "Mileage vs. price")}
            title={t("hub.mileageScatterTitle", "{vehicle}: mileage vs. asking price", { vehicle })}
            className="mb-6"
          />
          <MileagePriceScatter
            points={scatterPoints}
            title={`${vehicle} — mileage vs. price`}
          />
        </motion.section>

        {recentListings.length > 0 && (
          <motion.section variants={revealItem}>
            <SectionHeader
              eyebrow={t("makeHub.liveInventory", "Live inventory")}
              title={t("hub.recent", "Recent listings")}
              className="mb-8"
            />
            <motion.div
              variants={revealContainer}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              {recentListings.map((listing) => (
                <motion.div key={listing.id} variants={revealItem}>
                  <ListingCard listing={listing} />
                </motion.div>
              ))}
            </motion.div>
          </motion.section>
        )}

        <motion.div variants={revealItem}>
          <SafetyResearchCard
            research={safetyQuery.data}
            isLoading={safetyQuery.isPending}
            isError={safetyQuery.isError}
          />
        </motion.div>
        {/* US NHTSA catalog only when US research exists for this model —
            most Sri Lankan stock is JDM/recon, not US-market. */}
        {safetyQuery.data?.safety?.available === true && (
        <motion.div variants={revealItem}>
          <NhtsaModelsCard make={makeParam} model={modelParam} />
        </motion.div>
        )}

        <motion.div variants={revealContainer} className="grid gap-4 lg:grid-cols-3">
          <motion.div
            variants={revealItem}
            className="group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-soft transition-ui duration-medium hover:-translate-y-1 hover:border-primary/30 hover:shadow-soft-lg"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface transition-colors group-hover:border-primary/30 group-hover:bg-primary/10">
              <BarChart2 className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <p className="mt-5 text-caption font-semibold text-muted-foreground">
              {t("hub.browseAll", "Browse all {vehicle} listings", { vehicle })}
            </p>
            <p className="mt-2 flex-1 text-footnote leading-relaxed text-muted-foreground">
              {t(
                "hub.browseAllDesc",
                "See every live {vehicle} on the market, with price filters, district drill-down, and deal scoring.",
                { vehicle },
              )}
            </p>
            <Button asChild className="mt-6 w-full">
              <Link to={`/?make=${encodeURIComponent(makeParam)}&model=${encodeURIComponent(modelParam)}#market`}>
                {t("hub.browseListingsCta", "Browse listings")} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </motion.div>

          <motion.div
            variants={revealItem}
            className="group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-soft transition-ui duration-medium hover:-translate-y-1 hover:border-primary/30 hover:shadow-soft-lg"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface transition-colors group-hover:border-primary/30 group-hover:bg-primary/10">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <p className="mt-5 text-caption font-semibold text-muted-foreground">
              {t("hub.priceHistory", "Price history")}
            </p>
            <p className="mt-2 flex-1 text-footnote leading-relaxed text-muted-foreground">
              {t(
                "hub.priceTrendsDesc",
                "Track how {vehicle} prices have moved month-over-month in Sri Lanka.",
                { vehicle },
              )}
            </p>
            <Button asChild variant="outline" className="mt-6 w-full">
              <Link to={`/trends?make=${encodeURIComponent(makeParam)}&model=${encodeURIComponent(modelParam)}`}>
                {t("hub.viewPriceTrends", "View price trends")} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </motion.div>

          <motion.div
            variants={revealItem}
            className="group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-soft transition-ui duration-medium hover:-translate-y-1 hover:border-primary/30 hover:shadow-soft-lg"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface transition-colors group-hover:border-primary/30 group-hover:bg-primary/10">
              <Car className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <p className="mt-5 text-caption font-semibold text-muted-foreground">
              {t("hub.marketDepth", "Market depth")}
            </p>
            <p className="mt-2 flex-1 text-footnote leading-relaxed text-muted-foreground">
              {t(
                "hub.estimateDesc",
                "Get a market valuation for a specific {vehicle} using live comparable data.",
                { vehicle },
              )}
            </p>
            <Button asChild variant="outline" className="mt-6 w-full">
              <Link to={`/estimate?make=${encodeURIComponent(makeParam)}&model=${encodeURIComponent(modelParam)}`}>
                {t("hub.estimateCta", "Estimate price")} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </motion.div>
        </motion.div>
      </PageBody>
    </PageCanvas>
  );
}
