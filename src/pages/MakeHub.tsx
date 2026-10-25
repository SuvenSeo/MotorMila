import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { m } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Car, MapPin, Search } from "lucide-react";
import { getMakeInsight, getListings, getModels, formatPrice } from "@/services/api";
import { listItem, revealItem } from "@/lib/motion";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { ListingCard } from "@/components/ListingCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatTile, CountValue, LkrValue } from "@/components/ui/stat-tile";
import { HubLinkTile, HubTileGrid, HubTileSkeleton } from "@/components/data/HubParts";
import { cn } from "@/lib/utils";
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

export default function MakeHub() {
  const { t } = useAppPreferences();
  const { make: makeParam = "" } = useParams<{ make: string }>();
  const makeDisplay = toTitleCase(decodeURIComponent(makeParam));

  const insightQuery = useQuery({
    queryKey: ["make-insight", makeParam],
    queryFn: () => getMakeInsight(makeParam),
    enabled: Boolean(makeParam),
    staleTime: QUERY_STALE.hub,
  });

  const listingsQuery = useQuery({
    queryKey: ["listings", { make: makeParam, sort: "newest", page: 1 }],
    queryFn: () => getListings({ make: makeParam, sort: "newest", page: 1 }),
    enabled: Boolean(makeParam),
    staleTime: QUERY_STALE.listings,
  });

  const insight = insightQuery.data;
  const canonicalMake = insight?.make ?? makeDisplay;
  const title = `Used ${canonicalMake} Prices in Sri Lanka | ${SITE}`;
  const description = insight
    ? `${insight.total} used ${canonicalMake} listings in Sri Lanka. Average ${formatPrice(insight.avg_price_lkr)}, median ${formatPrice(insight.median_price_lkr)}. Browse models and districts on Motormila.`
    : `Browse used ${makeDisplay} prices, models, and listings across Sri Lanka on Motormila.`;

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
    const setCanonical = (href: string) => {
      let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", href);
    };
    const pathname = `/cars/${encodeURIComponent(makeParam)}`;
    setMeta("description", description);
    setProperty("og:title", title);
    setProperty("og:description", description);
    setProperty("og:url", `${ORIGIN}${pathname}`);
    setCanonical(`${ORIGIN}${pathname}`);
  }, [title, description, makeParam]);

  const isPending = insightQuery.isPending;
  const isError = insightQuery.isError && !insight;
  const recentListings = listingsQuery.data?.listings?.slice(0, 4) ?? [];

  // Full model browser: prefer the endpoint's cleaned all_models; fall back
  // to the snapshot model list so older backends still show every model.
  const [modelFilter, setModelFilter] = useState("");
  const fallbackModelsQuery = useQuery({
    queryKey: ["models", makeParam],
    queryFn: () => getModels(makeParam),
    enabled: Boolean(makeParam) && !insight?.all_models?.length,
    staleTime: QUERY_STALE.hub,
  });
  const allModels = useMemo(() => {
    if (insight?.all_models?.length) return insight.all_models;
    return (fallbackModelsQuery.data ?? []).map((row) => ({
      model: row.model,
      count: row.count,
      avg_price_lkr: null as number | null,
    }));
  }, [insight?.all_models, fallbackModelsQuery.data]);
  const visibleModels = useMemo(() => {
    const q = modelFilter.trim().toLowerCase();
    if (!q) return allModels;
    return allModels.filter((entry) => entry.model.toLowerCase().includes(q));
  }, [allModels, modelFilter]);
  const popularModels = insight?.top_models ?? [];
  const modelHref = (model: string) => `/cars/${encodeURIComponent(makeParam)}/${encodeURIComponent(model)}`;
  const nothingYet =
    !isPending && !isError && popularModels.length === 0 && allModels.length === 0 && !(insight?.top_districts?.length);

  const stats = [
    {
      label: t("makeHub.liveListings", "Live listings"),
      value: <CountValue value={insight ? insight.total : null} />,
    },
    // Price stats only render when the data has them; a snapshot
    // derived without prices shows just the live-listings card.
    ...(isPending || insight?.avg_price_lkr != null
      ? [{ label: t("makeHub.avgPrice", "Average price"), value: <LkrValue value={insight?.avg_price_lkr ?? null} /> }]
      : []),
    ...(isPending || insight?.median_price_lkr != null
      ? [{ label: t("makeHub.medianPrice", "Median price"), value: <LkrValue value={insight?.median_price_lkr ?? null} /> }]
      : []),
  ];

  return (
    <PageCanvas ambient="none">
      <PageHeader
        eyebrow={t("makeHub.eyebrow", "Make hub")}
        eyebrowIcon={Car}
        title={isPending ? makeDisplay : canonicalMake}
        description={t("makeHub.description", "Used {make} prices, popular models, and district demand across Sri Lanka.", { make: canonicalMake })}
      />

      <PageBody className="space-y-14 pt-0 lg:space-y-20 lg:pt-0">
        <m.section variants={revealItem} aria-label={t("makeHub.statsAria", "{make} market figures", { make: canonicalMake })}>
          {isError ? (
            <Card padding="none">
              <ErrorState
                title={t("makeHub.errorTitle", "Market figures didn't load")}
                body={t("makeHub.errorBody", "Listings below still work. Try again in a moment.")}
                onRetry={() => void insightQuery.refetch()}
              />
            </Card>
          ) : (
            <div className={cn("grid grid-cols-1 gap-3", stats.length === 3 ? "sm:grid-cols-3" : stats.length === 2 ? "sm:grid-cols-2" : "sm:max-w-sm")}>
              {stats.map((card) => (
                <StatTile key={card.label} label={card.label} value={card.value} loading={isPending} />
              ))}
            </div>
          )}
        </m.section>

        {isPending ? (
          <m.section variants={revealItem}>
            <SectionHeading eyebrow={t("makeHub.models", "Models")} title={t("makeHub.popularModels", "Popular {make} models", { make: makeDisplay })} />
            <HubTileSkeleton />
          </m.section>
        ) : popularModels.length > 0 ? (
          <m.section variants={revealItem}>
            <SectionHeading eyebrow={t("makeHub.models", "Models")} title={t("makeHub.popularModels", "Popular {make} models", { make: canonicalMake })} />
            <HubTileGrid>
              {popularModels.map((entry, i) => (
                <HubLinkTile
                  key={entry.model}
                  index={i}
                  to={modelHref(entry.model)}
                  title={entry.model}
                  meta={<Badge variant="neutral" className="tabular-nums">{entry.count}</Badge>}
                  value={entry.avg_price_lkr != null ? formatPrice(entry.avg_price_lkr) : undefined}
                />
              ))}
            </HubTileGrid>
          </m.section>
        ) : null}

        {allModels.length > 0 && (
          <m.section variants={revealItem}>
            <SectionHeading
              eyebrow={t("makeHub.allModelsEyebrow", "Browse")}
              title={t("makeHub.allModels", "All {make} models", { make: canonicalMake })}
            />
            {allModels.length > 12 && (
              <div className="relative mb-5 max-w-sm">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-label-3" aria-hidden />
                <Input
                  type="search"
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  placeholder={t("makeHub.findModel", "Find a model…")}
                  aria-label={t("makeHub.findModel", "Find a model…")}
                  className="pl-10"
                />
              </div>
            )}
            {visibleModels.length > 0 ? (
              <HubTileGrid>
                {visibleModels.map((entry, i) => (
                  <HubLinkTile
                    key={entry.model}
                    index={i}
                    to={modelHref(entry.model)}
                    title={entry.model}
                    meta={<Badge variant="neutral" className="tabular-nums">{entry.count}</Badge>}
                  />
                ))}
              </HubTileGrid>
            ) : (
              <Card padding="none">
                <EmptyState
                  icon={Search}
                  title={t("makeHub.noModelMatch", "No models match “{q}”.", { q: modelFilter.trim() })}
                  actionLabel={t("makeHub.clearSearch", "Clear search")}
                  onAction={() => setModelFilter("")}
                />
              </Card>
            )}
          </m.section>
        )}

        {insight && insight.top_districts.length > 0 && (
          <m.section variants={revealItem}>
            <SectionHeading eyebrow={t("makeHub.geography", "Geography")} title={t("makeHub.topDistricts", "Top districts")} />
            <HubTileGrid>
              {insight.top_districts.map((entry, i) => (
                <HubLinkTile
                  key={entry.district}
                  index={i}
                  to={`/locations/${encodeURIComponent(entry.district)}`}
                  icon={<MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                  title={entry.district}
                  value={entry.avg_price_lkr != null ? formatPrice(entry.avg_price_lkr) : t("common.priceNa", "Price N/A")}
                />
              ))}
            </HubTileGrid>
          </m.section>
        )}

        {nothingYet ? (
          <m.section variants={revealItem}>
            <Card padding="none">
              <EmptyState
                icon={Car}
                title={t("makeHub.emptyTitle", "No {make} listings indexed yet", { make: canonicalMake })}
                body={t("makeHub.emptyBody", "Models and districts appear here as soon as the next scan finds {make} ads.", { make: canonicalMake })}
              />
            </Card>
          </m.section>
        ) : null}

        {recentListings.length > 0 && (
          <m.section variants={revealItem}>
            <SectionHeading eyebrow={t("makeHub.liveInventory", "Live inventory")} title={t("makeHub.recent", "Recent listings")} />
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
          <Link to={`/?make=${encodeURIComponent(makeParam)}#market`}>
            {t("makeHub.browseAll", "Browse all {make} listings", { make: canonicalMake })} <ArrowRight aria-hidden />
          </Link>
        </Button>
      </PageBody>
    </PageCanvas>
  );
}
