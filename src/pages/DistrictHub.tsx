import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { m } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin } from "lucide-react";
import { getDistrictQuickInsight, getDistrictPrices, getListings, formatPrice } from "@/services/api";
import { revealContainer, revealItem } from "@/lib/motion";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { ListingCard } from "@/components/ListingCard";
import { SectionHeader } from "@/components/SectionHeader";
import { DistrictPriceHeatmap } from "@/components/DistrictPriceHeatmap";
import { DistrictVelocityList } from "@/components/DistrictVelocityList";
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
  const recentListings = listingsQuery.data?.listings?.slice(0, 4) ?? [];

  return (
    <PageCanvas>
      <PageHero
        theme="default"
        eyebrow={t("districtHub.eyebrow", "District hub")}
        eyebrowIcon={MapPin}
        watermarkIcon={MapPin}
        title={isPending ? districtDisplay : canonicalDistrict}
        description={t("districtHub.description", "Live inventory, average prices, and top models in {district}.", { district: canonicalDistrict })}
      />

      <PageBody className="space-y-16 lg:space-y-24">
        <section>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-soft sm:grid-cols-3">
            {[
              {
                label: t("makeHub.liveListings", "Live listings"),
                value: isPending ? "…" : insight ? insight.listing_count.toLocaleString() : t("common.na", "N/A"),
              },
              {
                label: t("makeHub.avgPrice", "Average price"),
                value: isPending ? "…" : formatPrice(insight?.avg_price_lkr ?? null),
              },
              {
                label: t("makeHub.medianPrice", "Median price"),
                value: isPending ? "…" : formatPrice(insight?.median_price_lkr ?? null),
              },
            ].map((card) => (
              <div key={card.label} className="bg-card p-6">
                <p className="text-caption font-semibold text-muted-foreground">
                  {card.label}
                </p>
                <p className="num mt-2.5 text-title1 font-bold tracking-tight text-foreground">{card.value}</p>
              </div>
            ))}
          </div>
        </section>

        <m.section variants={revealItem}>
          <SectionHeader
            eyebrow={t("districtHub.priceMapEyebrow", "District price map")}
            title={t("districtHub.priceMapTitle", "Sri Lanka price landscape")}
            className="mb-8"
          />
          <DistrictPriceHeatmap
            data={districtPricesQuery.data ?? []}
            highlightDistrict={canonicalDistrict}
            isLoading={districtPricesQuery.isPending}
            isError={districtPricesQuery.isError}
            onRetry={() => districtPricesQuery.refetch()}
          />
        </m.section>

        {insight && insight.top_models.length > 0 && (
          <m.section variants={revealItem}>
            <SectionHeader eyebrow={t("makeHub.models", "Models")} title={t("districtHub.popular", "Popular in {district}", { district: canonicalDistrict })} className="mb-8" />
            <m.div variants={revealContainer} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {insight.top_models.map((entry) => (
                <Link
                  key={`${entry.make}-${entry.model}`}
                  to={`/cars/${encodeURIComponent(entry.make)}/${encodeURIComponent(entry.model)}`}
                  className="group rounded-2xl border border-border bg-card p-5 shadow-soft transition-ui hover:-translate-y-1 hover:border-primary/30 no-underline"
                >
                  <p className="text-body font-bold text-foreground">
                    {entry.make} {entry.model}
                  </p>
                  <p className="mt-1 text-caption font-medium text-muted-foreground">
                    {entry.listing_count} {t("common.listings", "listings")}
                  </p>
                  <p className="num mt-3 text-callout font-bold text-foreground">
                    {entry.avg_price_lkr ? formatPrice(entry.avg_price_lkr) : t("common.priceNa", "Price N/A")}
                  </p>
                </Link>
              ))}
            </m.div>
          </m.section>
        )}

        <m.section variants={revealItem}>
          <DistrictVelocityList />
        </m.section>

        {recentListings.length > 0 && (
          <m.section variants={revealItem}>
            <SectionHeader eyebrow={t("makeHub.liveInventory", "Live inventory")} title={t("districtHub.recent", "Recent listings")} className="mb-8" />
            <m.div variants={revealContainer} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recentListings.map((listing) => (
                <m.div key={listing.id} variants={revealItem}>
                  <ListingCard listing={listing} />
                </m.div>
              ))}
            </m.div>
          </m.section>
        )}

        <Button asChild className="w-full sm:w-auto">
          <Link to={`/?district=${encodeURIComponent(districtParam)}#market`}>
            {t("districtHub.browse", "Browse {district} listings", { district: canonicalDistrict })} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </PageBody>
    </PageCanvas>
  );
}
