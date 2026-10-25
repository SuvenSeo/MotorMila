import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { m } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BarChart2, Car, TrendingUp } from "lucide-react";
import { getMakeModelInsight, getListings, getListingsForExport, getVehicleSafetyResearch, formatPrice } from "@/services/api";
import { listItem, revealItem } from "@/lib/motion";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { ListingCard } from "@/components/ListingCard";
import { ModelPriceTimeMachine } from "@/components/ModelPriceTimeMachine";
import { ModelTrendPanel } from "@/components/ModelTrendPanel";
import { BuyOrWaitCard } from "@/components/BuyOrWaitCard";
import { MileagePriceScatter } from "@/components/MileagePriceScatter";
import { NhtsaModelsCard } from "@/components/NhtsaModelsCard";
import { SafetyResearchCard } from "@/components/SafetyResearchCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatTile, CountValue, LkrValue } from "@/components/ui/stat-tile";
import { HubLinkTile, HubTileGrid, HubTileSkeleton } from "@/components/data/HubParts";
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

  const stats = [
    {
      label: t("hub.liveListings", "Live listings"),
      value: <CountValue value={insight ? insight.total : null} />,
      note: t("hub.listingsTracked", "{vehicle} listings tracked now", { vehicle }),
    },
    {
      label: t("hub.avgPrice", "Average price"),
      value: <LkrValue value={insight?.avg_price_lkr ?? null} />,
      note: t("hub.avgNote", "Mean across priced listings"),
    },
    {
      label: t("hub.medianPrice", "Median price"),
      value: <LkrValue value={insight?.median_price_lkr ?? null} />,
      note: t("hub.medianNote", "Midpoint of priced listings"),
    },
  ];
  const q = `make=${encodeURIComponent(makeParam)}&model=${encodeURIComponent(modelParam)}`;
  const actions = [
    {
      icon: BarChart2,
      title: t("hub.browseAll", "Browse all {vehicle} listings", { vehicle }),
      body: t("hub.browseAllDesc", "See every live {vehicle} on the market, with price filters, district drill-down, and deal scoring.", { vehicle }),
      cta: t("hub.browseListingsCta", "Browse listings"),
      to: `/?${q}#market`,
      primary: true,
    },
    {
      icon: TrendingUp,
      title: t("hub.priceHistory", "Price history"),
      body: t("hub.priceTrendsDesc", "Track how {vehicle} prices have moved month-over-month in Sri Lanka.", { vehicle }),
      cta: t("hub.viewPriceTrends", "View price trends"),
      to: `/trends?${q}`,
      primary: false,
    },
    {
      icon: Car,
      title: t("hub.marketDepth", "Market depth"),
      body: t("hub.estimateDesc", "Get a market valuation for a specific {vehicle} using live comparable data.", { vehicle }),
      cta: t("hub.estimateCta", "Estimate price"),
      to: `/estimate?${q}`,
      primary: false,
    },
  ];

  return (
    <PageCanvas ambient="none">
      <PageHeader
        eyebrow={t("hub.eyebrow", "Make · model hub")}
        eyebrowIcon={Car}
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
      />

      <PageBody className="space-y-14 pt-0 lg:space-y-20 lg:pt-0">
        <m.section variants={revealItem} aria-labelledby="hub-snapshot">
          <div className="mb-4 flex items-center gap-2">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            <h2 id="hub-snapshot" className="text-footnote font-semibold text-label-2">
              {t("hub.snapshot", "Market snapshot")}
            </h2>
          </div>
          {isError ? (
            <Card padding="none">
              <ErrorState
                title={t("hub.loadErrorTitle", "Market data didn't load")}
                body={t("hub.loadError", "Could not load market data for this vehicle. Try browsing listings directly.")}
                onRetry={() => void insightQuery.refetch()}
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {stats.map((card) => (
                <StatTile key={card.label} label={card.label} value={card.value} hint={card.note} loading={isPending} />
              ))}
            </div>
          )}
          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
            <ModelTrendPanel make={makeParam} model={modelParam} displayMake={makeDisplay} displayModel={modelDisplay} />
            <BuyOrWaitCard make={makeParam} model={modelParam} displayMake={makeDisplay} displayModel={modelDisplay} />
          </div>
        </m.section>

        {(isPending || (insight && insight.top_districts.length > 0)) && (
          <m.section variants={revealItem}>
            <SectionHeading eyebrow={t("hub.geography", "Geography")} title={t("hub.topDistricts", "Top districts")} />
            {isPending ? (
              <HubTileSkeleton />
            ) : (
              <HubTileGrid>
                {insight!.top_districts.map((entry, i) => (
                  <HubLinkTile
                    key={entry.district}
                    index={i}
                    to={`/locations/${encodeURIComponent(entry.district)}`}
                    title={entry.district}
                    meta={
                      <Badge variant="neutral" className="tabular-nums">
                        {entry.count}{" "}
                        {entry.count !== 1 ? t("common.listings", "listings") : t("common.listing", "listing")}
                      </Badge>
                    }
                    value={
                      entry.avg_price_lkr != null ? (
                        <>
                          {formatPrice(entry.avg_price_lkr)}
                          <span className="ml-1.5 text-caption font-normal text-label-2">{t("hub.avgShort", "avg")}</span>
                        </>
                      ) : (
                        t("common.priceNa", "Price N/A")
                      )
                    }
                  />
                ))}
              </HubTileGrid>
            )}
          </m.section>
        )}

        <m.div variants={revealItem}>
          <ModelPriceTimeMachine make={makeParam} model={modelParam} displayMake={makeDisplay} displayModel={modelDisplay} />
        </m.div>

        <m.section variants={revealItem}>
          <SectionHeading
            eyebrow={t("hub.mileageScatterEyebrow", "Mileage vs. price")}
            title={t("hub.mileageScatterTitle", "{vehicle}: mileage vs. asking price", { vehicle })}
          />
          <MileagePriceScatter
            points={scatterPoints}
            title={t("hub.mileageScatterCard", "{vehicle} — mileage vs. price", { vehicle })}
            isLoading={scatterQuery.isPending}
            isError={scatterQuery.isError}
            onRetry={() => void scatterQuery.refetch()}
          />
        </m.section>

        {recentListings.length > 0 && (
          <m.section variants={revealItem}>
            <SectionHeading eyebrow={t("makeHub.liveInventory", "Live inventory")} title={t("hub.recent", "Recent listings")} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recentListings.map((listing, i) => (
                <m.div key={listing.id} variants={listItem} custom={i} initial="hidden" animate="show">
                  <ListingCard listing={listing} />
                </m.div>
              ))}
            </div>
          </m.section>
        )}

        <m.div variants={revealItem}>
          <SafetyResearchCard
            research={safetyQuery.data}
            isLoading={safetyQuery.isPending}
            isError={safetyQuery.isError}
          />
        </m.div>

        {/* US NHTSA catalog only when US research exists for this model —
            most Sri Lankan stock is JDM/recon, not US-market. */}
        {safetyQuery.data?.safety?.available === true && (
          <m.div variants={revealItem}>
            <NhtsaModelsCard make={makeParam} model={modelParam} />
          </m.div>
        )}

        <ul className="grid gap-4 lg:grid-cols-3">
          {actions.map((a, i) => {
            const Icon = a.icon;
            return (
              <m.li key={a.to} variants={listItem} custom={i} initial="hidden" animate="show" className="list-none">
                <Card padding="md" className="flex h-full flex-col">
                  <span className="flex h-10 w-10 items-center justify-center rounded-control bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-callout font-semibold text-foreground">{a.title}</h3>
                  <p className="mt-1.5 flex-1 text-footnote text-label-2">{a.body}</p>
                  <Button asChild variant={a.primary ? "primary" : "secondary"} className="mt-5 w-full">
                    <Link to={a.to}>
                      {a.cta} <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                </Card>
              </m.li>
            );
          })}
        </ul>
      </PageBody>
    </PageCanvas>
  );
}
