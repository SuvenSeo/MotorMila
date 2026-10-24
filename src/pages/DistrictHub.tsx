import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { m } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Car, MapPin } from "lucide-react";
import { getDistrictQuickInsight, getDistrictPrices, getListings, formatPrice } from "@/services/api";
import { listItem, revealItem } from "@/lib/motion";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { ListingCard } from "@/components/ListingCard";
import { DistrictPriceHeatmap } from "@/components/DistrictPriceHeatmap";
import { DistrictVelocityList } from "@/components/DistrictVelocityList";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
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

export default function DistrictHub() {
  const { t } = useAppPreferences();
  const { district: districtParam = "" } = useParams<{ district: string }>();
  const districtDisplay = toTitleCase(decodeURIComponent(districtParam));

  const insightQuery = useQuery({
    queryKey: ["district-insight", districtParam],
    queryFn: () => getDistrictQuickInsight(districtParam),
    enabled: Boolean(districtParam),
    staleTime: QUERY_STALE.hub,
  });

  const listingsQuery = useQuery({
    queryKey: ["listings", { district: districtParam, sort: "newest", page: 1 }],
    queryFn: () => getListings({ district: districtParam, sort: "newest", page: 1 }),
    enabled: Boolean(districtParam),
    staleTime: QUERY_STALE.listings,
  });

  const districtPricesQuery = useQuery({
    queryKey: ["district-prices"],
    queryFn: getDistrictPrices,
    staleTime: QUERY_STALE.hub,
  });

  const insight = insightQuery.data;
  const canonicalDistrict = insight?.district || districtDisplay;
  const title = `Used Cars in ${canonicalDistrict}, Sri Lanka | ${SITE}`;
  const description = insight
    ? `${insight.listing_count} live vehicle listings in ${canonicalDistrict}. Average ${formatPrice(insight.avg_price_lkr)}, median ${formatPrice(insight.median_price_lkr)}. Browse on Motormila.`
    : `Browse used cars and market prices in ${districtDisplay}, Sri Lanka on Motormila.`;

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
    const setCanonical = (href: string) => {
      let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", href);
    };
    const pathname = `/locations/${encodeURIComponent(districtParam)}`;
    setMeta("description", description);
    setCanonical(`${ORIGIN}${pathname}`);
  }, [title, description, districtParam]);

  const isPending = insightQuery.isPending;
  const isError = insightQuery.isError && !insight;
  const recentListings = listingsQuery.data?.listings?.slice(0, 4) ?? [];

  const stats = [
    { label: t("makeHub.liveListings", "Live listings"), value: <CountValue value={insight ? insight.listing_count : null} /> },
    { label: t("makeHub.avgPrice", "Average price"), value: <LkrValue value={insight?.avg_price_lkr ?? null} /> },
    { label: t("makeHub.medianPrice", "Median price"), value: <LkrValue value={insight?.median_price_lkr ?? null} /> },
  ];

  return (
    <PageCanvas ambient="none">
      <PageHeader
        eyebrow={t("districtHub.eyebrow", "District hub")}
        eyebrowIcon={MapPin}
        title={isPending ? districtDisplay : canonicalDistrict}
        description={t("districtHub.description", "Live inventory, average prices, and top models in {district}.", { district: canonicalDistrict })}
      />

      <PageBody className="space-y-14 pt-0 lg:space-y-20 lg:pt-0">
        <m.section variants={revealItem} aria-label={t("districtHub.statsAria", "{district} market figures", { district: canonicalDistrict })}>
          {isError ? (
            <Card padding="none">
              <ErrorState
                title={t("districtHub.errorTitle", "District figures didn't load")}
                body={t("districtHub.errorBody", "The map and listings below still work. Try again in a moment.")}
                onRetry={() => void insightQuery.refetch()}
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {stats.map((card) => (
                <StatTile key={card.label} label={card.label} value={card.value} loading={isPending} />
              ))}
            </div>
          )}
        </m.section>

        <m.section variants={revealItem}>
          <SectionHeading
            eyebrow={t("districtHub.priceMapEyebrow", "District price map")}
            title={t("districtHub.priceMapTitle", "Sri Lanka price landscape")}
          />
          <DistrictPriceHeatmap
            data={districtPricesQuery.data ?? []}
            highlightDistrict={canonicalDistrict}
            isLoading={districtPricesQuery.isPending}
            isError={districtPricesQuery.isError}
            onRetry={() => districtPricesQuery.refetch()}
          />
        </m.section>

        {isPending ? (
          <m.section variants={revealItem}>
            <SectionHeading eyebrow={t("makeHub.models", "Models")} title={t("districtHub.popular", "Popular in {district}", { district: districtDisplay })} />
            <HubTileSkeleton />
          </m.section>
        ) : insight && insight.top_models.length > 0 ? (
          <m.section variants={revealItem}>
            <SectionHeading eyebrow={t("makeHub.models", "Models")} title={t("districtHub.popular", "Popular in {district}", { district: canonicalDistrict })} />
            <HubTileGrid>
              {insight.top_models.map((entry, i) => (
                <HubLinkTile
                  key={`${entry.make}-${entry.model}`}
                  index={i}
                  to={`/cars/${encodeURIComponent(entry.make)}/${encodeURIComponent(entry.model)}`}
                  title={`${entry.make} ${entry.model}`}
                  meta={
                    <Badge variant="neutral" className="tabular-nums">
                      {entry.listing_count} {t("common.listings", "listings")}
                    </Badge>
                  }
                  value={entry.avg_price_lkr ? formatPrice(entry.avg_price_lkr) : t("common.priceNa", "Price N/A")}
                />
              ))}
            </HubTileGrid>
          </m.section>
        ) : !isError ? (
          <m.section variants={revealItem}>
            <Card padding="none">
              <EmptyState
                icon={Car}
                title={t("districtHub.emptyTitle", "No models ranked in {district} yet", { district: canonicalDistrict })}
                body={t("districtHub.emptyBody", "Popular models show up once enough local ads are indexed.")}
              />
            </Card>
          </m.section>
        ) : null}

        <m.section variants={revealItem}>
          <DistrictVelocityList />
        </m.section>

        {recentListings.length > 0 && (
          <m.section variants={revealItem}>
            <SectionHeading eyebrow={t("makeHub.liveInventory", "Live inventory")} title={t("districtHub.recent", "Recent listings")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recentListings.map((listing, i) => (
                <m.div key={listing.id} variants={listItem} custom={i} initial="hidden" animate="show" className="min-w-0">
                  <ListingCard listing={listing} />
                </m.div>
              ))}
            </div>
          </m.section>
        )}

        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link to={`/?district=${encodeURIComponent(districtParam)}#market`}>
            {t("districtHub.browse", "Browse {district} listings", { district: canonicalDistrict })} <ArrowRight aria-hidden />
          </Link>
        </Button>
      </PageBody>
    </PageCanvas>
  );
}
