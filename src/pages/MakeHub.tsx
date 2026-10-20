import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BarChart2, Car, MapPin, Search } from "lucide-react";
import { getMakeInsight, getListings, getModels, formatPrice } from "@/services/api";
import { revealContainer, revealItem } from "@/lib/motion";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { ListingCard } from "@/components/ListingCard";
import { SectionHeader } from "@/components/SectionHeader";
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

  return (
    <PageCanvas>
      <PageHero
        theme="default"
        eyebrow={t("makeHub.eyebrow", "Make hub")}
        eyebrowIcon={Car}
        watermarkIcon={BarChart2}
        title={isPending ? makeDisplay : canonicalMake}
        description={t("makeHub.description", "Used {make} prices, popular models, and district demand across Sri Lanka.", { make: canonicalMake })}
      />

      <PageBody className="space-y-16 lg:space-y-24">
        <section>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-soft sm:grid-cols-3">
            {[
              {
                label: t("makeHub.liveListings", "Live listings"),
                value: isPending ? "…" : insight ? insight.total.toLocaleString() : t("common.na", "N/A"),
              },
              // Price stats only render when the data has them; a snapshot
              // derived without prices shows just the live-listings card.
              ...(isPending || insight?.avg_price_lkr != null
                ? [
                    {
                      label: t("makeHub.avgPrice", "Average price"),
                      value: isPending ? "…" : formatPrice(insight?.avg_price_lkr ?? null),
                    },
                  ]
                : []),
              ...(isPending || insight?.median_price_lkr != null
                ? [
                    {
                      label: t("makeHub.medianPrice", "Median price"),
                      value: isPending ? "…" : formatPrice(insight?.median_price_lkr ?? null),
                    },
                  ]
                : []),
            ].map((card) => (
              <div key={card.label} className="bg-card p-6">
                <p className="text-[12px] font-semibold text-muted-foreground">
                  {card.label}
                </p>
                <p className="num mt-2.5 text-3xl font-bold tracking-tight text-foreground">{card.value}</p>
              </div>
            ))}
          </div>
        </section>

        {popularModels.length > 0 && (
          <motion.section variants={revealItem}>
            <SectionHeader eyebrow={t("makeHub.models", "Models")} title={t("makeHub.popularModels", "Popular {make} models", { make: canonicalMake })} className="mb-8" />
            <motion.div variants={revealContainer} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {popularModels.map((entry) => (
                <Link
                  key={entry.model}
                  to={`/cars/${encodeURIComponent(makeParam)}/${encodeURIComponent(entry.model)}`}
                  className="group rounded-2xl border border-border bg-card p-5 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-soft-lg no-underline"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[14px] font-bold tracking-tight text-foreground">{entry.model}</p>
                    <span className="num shrink-0 rounded-full border border-border bg-surface px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {entry.count}
                    </span>
                  </div>
                  {entry.avg_price_lkr != null && (
                    <p className="num mt-3 text-lg font-bold tracking-tight text-foreground">
                      {formatPrice(entry.avg_price_lkr)}
                    </p>
                  )}
                </Link>
              ))}
            </motion.div>
          </motion.section>
        )}

        {allModels.length > 0 && (
          <motion.section variants={revealItem}>
            <SectionHeader
              eyebrow={t("makeHub.allModelsEyebrow", "Browse")}
              title={t("makeHub.allModels", "All {make} models", { make: canonicalMake })}
              className="mb-8"
            />
            {allModels.length > 12 && (
              <div className="relative mb-6 max-w-sm">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  placeholder={t("makeHub.findModel", "Find a model…")}
                  aria-label={t("makeHub.findModel", "Find a model…")}
                  className="h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40"
                />
              </div>
            )}
            {visibleModels.length > 0 ? (
              <motion.div variants={revealContainer} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleModels.map((entry) => (
                  <Link
                    key={entry.model}
                    to={`/cars/${encodeURIComponent(makeParam)}/${encodeURIComponent(entry.model)}`}
                    className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 no-underline"
                  >
                    <p className="text-[14px] font-bold tracking-tight text-foreground">{entry.model}</p>
                    <span className="num shrink-0 rounded-full border border-border bg-surface px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {entry.count}
                    </span>
                  </Link>
                ))}
              </motion.div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("makeHub.noModelMatch", "No models match “{q}”.", { q: modelFilter.trim() })}
              </p>
            )}
          </motion.section>
        )}

        {insight && insight.top_districts.length > 0 && (
          <motion.section variants={revealItem}>
            <SectionHeader eyebrow={t("makeHub.geography", "Geography")} title={t("makeHub.topDistricts", "Top districts")} className="mb-8" />
            <motion.div variants={revealContainer} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {insight.top_districts.map((entry) => (
                <Link
                  key={entry.district}
                  to={`/locations/${encodeURIComponent(entry.district)}`}
                  className="group rounded-2xl border border-border bg-card p-5 shadow-soft transition-all hover:-translate-y-1 hover:border-primary/30 no-underline"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
                    <p className="text-[14px] font-bold text-foreground">{entry.district}</p>
                  </div>
                  <p className="num mt-3 text-lg font-bold text-foreground">
                    {entry.avg_price_lkr != null ? formatPrice(entry.avg_price_lkr) : t("common.priceNa", "Price N/A")}
                  </p>
                </Link>
              ))}
            </motion.div>
          </motion.section>
        )}

        {recentListings.length > 0 && (
          <motion.section variants={revealItem}>
            <SectionHeader eyebrow={t("makeHub.liveInventory", "Live inventory")} title={t("makeHub.recent", "Recent listings")} className="mb-8" />
            <motion.div variants={revealContainer} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recentListings.map((listing) => (
                <motion.div key={listing.id} variants={revealItem}>
                  <ListingCard listing={listing} />
                </motion.div>
              ))}
            </motion.div>
          </motion.section>
        )}

        <Button asChild className="w-full sm:w-auto">
          <Link to={`/?make=${encodeURIComponent(makeParam)}#market`}>
            {t("makeHub.browseAll", "Browse all {make} listings", { make: canonicalMake })} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </PageBody>
    </PageCanvas>
  );
}
