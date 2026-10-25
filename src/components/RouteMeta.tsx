import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAppPreferences } from "@/lib/appPreferences";
import { BRAND } from "@/lib/brand";
import { isKnownRoutePath, isNoindexPath } from "@/lib/routeIndexing";
import {
  canonicalComparePath,
  fromCompareSlug,
  isCompareSlugPath,
} from "@/lib/compareSlug";

type Meta = { title: string; description: string };

const SITE = BRAND.siteName;
const ORIGIN = BRAND.origin;

function setMeta(name: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function setProperty(property: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("property", property);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function setCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

function setJsonLd(data: unknown) {
  const id = "motormila-jsonld";
  let script = document.getElementById(id) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

/** "toyota" / "land-cruiser" -> "Toyota" / "Land Cruiser". */
function toTitleCase(str: string): string {
  return decodeURIComponent(str)
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Keep slugs canonical: lowercase, hyphens, no leading/trailing dashes. */
function slugify(str: string): string {
  return String(str || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

type HubKind =
  | { kind: "make-model"; make: string; model: string; year?: number }
  | { kind: "make"; make: string }
  | { kind: "district"; district: string }
  | { kind: "compare"; ids: number[] }
  | { kind: "none" };

function parseHubPath(pathname: string): HubKind {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "cars" && parts[1]) {
    const make = toTitleCase(parts[1]);
    if (parts[2]) {
      const model = toTitleCase(parts[2]);
      const year = parts[3] ? Number.parseInt(parts[3], 10) : NaN;
      return {
        kind: "make-model",
        make,
        model,
        year: Number.isInteger(year) ? year : undefined,
      };
    }
    return { kind: "make", make };
  }
  if (parts[0] === "locations" && parts[1]) {
    return { kind: "district", district: toTitleCase(parts[1]) };
  }
  if (parts[0] === "compare" && parts[1] && isCompareSlugPath(pathname)) {
    return { kind: "compare", ids: fromCompareSlug(parts[1]) };
  }
  return { kind: "none" };
}

function breadcrumbItems(
  crumbs: Array<{ name: string; path: string }>,
): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${ORIGIN}${crumb.path}`,
    })),
  };
}

/**
 * Hub JSON-LD graph: Car + AggregateOffer (LKR) + BreadcrumbList.
 * Counts/median are unknown client-side until the hub query resolves, so
 * offerCount/lowPrice are omitted rather than fabricated — page-level
 * effects (e.g. MakeModelHub) may enrich after data loads.
 */
function hubJsonLd(
  vehicle: string,
  url: string,
  crumbs: Array<{ name: string; path: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Car",
        name: `${vehicle} — Sri Lanka market`,
        url,
        brand: { "@type": "Brand", name: vehicle.split(" ")[0] },
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "LKR",
          availability: "https://schema.org/InStock",
        },
      },
      breadcrumbItems(crumbs),
    ],
  };
}

export function RouteMeta() {
  const { pathname, search } = useLocation();
  const { t } = useAppPreferences();

  useEffect(() => {
    const siteVars = { site: SITE };
    const defaultDescription = t(
      "shell.copy.seoDefault",
      "Search every vehicle ad in Sri Lanka in one place, with price history, fair-price ranges and an import tax calculator.",
    );

    const routeMeta: Record<string, Meta> = {
      "/": {
        title: t("seo.homeTitle", "{site} — {tagline}", { site: SITE, tagline: BRAND.tagline }),
        description: defaultDescription,
      },
      "/trends": {
        title: t("seo.trendsTitle", "Market Trends — {site}", siteVars),
        description: t(
          "seo.trendsDesc",
          "Sri Lankan vehicle price trends over time, by make, model, and district.",
        ),
      },
      "/estimate": {
        title: t("seo.estimateTitle", "Valuation — {site}", siteVars),
        description: t(
          "seo.estimateDesc",
          "Estimate a fair market price for any Sri Lankan vehicle from live listing data.",
        ),
      },
      "/how-we-price": {
        title: t("seo.howWePriceTitle", "How we score prices — {site}", siteVars),
        description: t(
          "seo.howWePriceDesc",
          "How MotorMila estimates fair market value from comparable Sri Lankan listings, what confidence levels and deal badges mean, and the limits of asking-price data.",
        ),
      },
      "/calculator": {
        title: t("seo.calculatorTitle", "Import & Cost Calculator — {site}", siteVars),
        description: t(
          "seo.calculatorDesc",
          "Break down import duty, taxes, and total cost of ownership for vehicles in Sri Lanka.",
        ),
      },
      "/ev-hub": {
        title: t("seo.evHubTitle", "EV Hub — {site}", siteVars),
        description: t(
          "seo.evHubDesc",
          "Electric vehicle pricing, range, battery health, and charging intelligence for Sri Lanka.",
        ),
      },
      "/ev-chargers": {
        title: t("seo.evChargersTitle", "EV Chargers — {site}", siteVars),
        description: t(
          "seo.evChargersDesc",
          "Cached Open Charge Map public charging stations in Sri Lanka. Confirm status before you travel.",
        ),
      },
      "/best-picks": {
        title: t("seo.bestPicksTitle", "Best Picks — {site}", siteVars),
        description: t(
          "seo.bestPicksDesc",
          "A strict, deal-score ranked shortlist of the strongest vehicle deals on the market.",
        ),
      },
      "/alerts": {
        title: t("seo.alertsTitle", "Alerts — {site}", siteVars),
        description: t(
          "seo.alertsDesc",
          "Saved listing watches and market match alerts for Sri Lanka vehicles.",
        ),
      },
      "/price-index": {
        title: t("seo.priceIndexTitle", "Price Index — {site}", siteVars),
        description: t(
          "seo.priceIndexDesc",
          "Mix-adjusted used-vehicle price index for the Sri Lankan market.",
        ),
      },
      "/dealer": {
        title: t("seo.dealerTitle", "Dealer Workspace — {site}", siteVars),
        description: t(
          "seo.dealerDesc",
          "Inventory turnover, price-gap, and deal-score intelligence for vehicle dealers.",
        ),
      },
      "/settings": {
        title: t("seo.settingsTitle", "Settings — {site}", siteVars),
        description: t(
          "seo.settingsDesc",
          "Language, theme, and display preferences for {site}.",
          siteVars,
        ),
      },
      "/sign-in": {
        title: t("seo.signInTitle", "Sign In — {site}", siteVars),
        description: t(
          "seo.signInDesc",
          "Sign in to the {site} vehicle intelligence dashboard.",
          siteVars,
        ),
      },
      "/pro": {
        title: t("seo.proTitle", "Pro Dashboard — {site}", siteVars),
        description: t(
          "seo.proDesc",
          "The paid {site} market terminal: drill-downs, exports, and source quality signals.",
          siteVars,
        ),
      },
      "/pro-preview": {
        title: t("seo.proPreviewTitle", "Pro Preview — {site}", siteVars),
        description: t(
          "seo.proPreviewDesc",
          "A locked preview of the {site} Pro analytics workspace.",
          siteVars,
        ),
      },
      "/official-pulse": {
        title: t("seo.pulseTitle", "Official Pulse — {site}", siteVars),
        description: t(
          "seo.pulseDesc",
          "Government and import market signals from DMT, Customs, and landed-cost references — explained in-platform.",
        ),
      },
      "/docs": {
        title: t("seo.docsTitle", "Platform Docs — {site}", siteVars),
        description: t(
          "seo.docsDesc",
          "How {site} works: data sources, deal scores, Official Pulse, workspaces, and access tiers.",
          siteVars,
        ),
      },
      "/bot": {
        title: t("seo.botTitle", "MotorMilaBot — {site}", siteVars),
        description: t(
          "seo.botDesc",
          "About the MotorMilaBot web crawler: what it collects, how politely it crawls, and how to contact us or opt out.",
          siteVars,
        ),
      },
      "/pricing": {
        title: t("seo.pricingTitle", "Pricing — {site}", siteVars),
        description: t(
          "seo.pricingDesc",
          "Free, Pro, Dealer, and Custom access for Sri Lanka vehicle market intelligence.",
          siteVars,
        ),
      },
      "/sell": {
        title: t("seo.sellTitle", "Sell Your Vehicle — {site}", siteVars),
        description: t(
          "seo.sellDesc",
          "List your vehicle and see what similar cars are selling for in Sri Lanka before you set a price.",
        ),
      },
      "/mobile-app": {
        title: t("seo.mobileAppTitle", "Android App — {site}", siteVars),
        description: t(
          "seo.mobileAppDesc",
          "Download the Motormila Android app: Sri Lankan vehicle prices, deal alerts and valuations on your phone.",
        ),
      },
      "/sign-up": {
        title: t("seo.signUpTitle", "Create Account — {site}", siteVars),
        description: defaultDescription,
      },
      "/profile": {
        title: t("seo.profileTitle", "Profile — {site}", siteVars),
        description: defaultDescription,
      },
      "/hero-lab": {
        title: `Hero Lab — ${SITE}`,
        description: defaultDescription,
      },
      "/motormila/admin": {
        title: `Admin — ${SITE}`,
        description: defaultDescription,
      },
      "/permits": {
        title: t("seo.permitsTitle", "Vehicle Permits — {site}", siteVars),
        description: t(
          "seo.permitsDesc",
          "Sri Lankan vehicle import permit types and current market prices.",
        ),
      },
      "/privacy": {
        title: t("seo.privacyTitle", "Privacy Policy — {site}", siteVars),
        description: t("seo.privacyDesc", "How Motormila collects, uses and protects personal data."),
      },
      "/terms": {
        title: t("seo.termsTitle", "Terms of Service — {site}", siteVars),
        description: t("seo.termsDesc", "The terms that govern use of Motormila."),
      },
      "/cookies": {
        title: t("seo.cookiesTitle", "Cookie Notice — {site}", siteVars),
        description: t("seo.cookiesDesc", "How MotorMila uses cookies and browser storage."),
      },
      "/removal": {
        title: t("seo.removalTitle", "Request Data Removal — {site}", siteVars),
        description: t("seo.removalDesc", "Ask MotorMila to remove your listing data or photos."),
      },
      "/delete-account": {
        title: t("seo.deleteAccountTitle", "Delete Your Account — {site}", siteVars),
        description: t("seo.deleteAccountDesc", "Delete your MotorMila account and associated data."),
      },
      "/finance": {
        title: t("seo.financeTitle", "Vehicle Finance — {site}", siteVars),
        description: t("seo.financeDesc", "Request lease and finance quotes for your vehicle purchase in Sri Lanka."),
      },
      "/inspection": {
        title: t("seo.inspectionTitle", "Vehicle Inspection — {site}", siteVars),
        description: t("seo.inspectionDesc", "Book a pre-purchase vehicle inspection in Sri Lanka."),
      },
      "/insurance": {
        title: t("seo.insuranceTitle", "Vehicle Insurance — {site}", siteVars),
        description: t("seo.insuranceDesc", "Request motor insurance quotes in Sri Lanka."),
      },
      "/safe-transfer": {
        title: t("seo.safeTransferTitle", "Safe Vehicle Transfer Kit — {site}", siteVars),
        description: t("seo.safeTransferDesc", "Transfer vehicle ownership safely in Sri Lanka: checklist, sale agreement, transfer costs and the 14-day rule."),
      },
      "/afford": {
        title: t("seo.affordTitle", "What Can I Afford — {site}", siteVars),
        description: t("seo.affordDesc", "Find Sri Lankan vehicles that fit your down payment and monthly budget, with local lease rates and CBSL loan limits."),
      },
      "/checkout/return": {
        title: t("seo.checkoutTitle", "Checkout — {site}", siteVars),
        description: defaultDescription,
      },
    };

    let meta: Meta | undefined = routeMeta[pathname];
    let canonicalPath = pathname;
    let ogImage = `${ORIGIN}/og-card.jpg`;
    let jsonLd: unknown | undefined;

    if (!meta) {
      const hub = parseHubPath(pathname);
      if (hub.kind === "make-model") {
        const vehicle = `${hub.make} ${hub.model}`.trim();
        const yearSuffix = hub.year ? ` ${hub.year}` : "";
        meta = {
          title: `${vehicle}${yearSuffix} Price Sri Lanka — Live Listings, Trends & Fair Value | ${SITE}`,
          description:
            `${vehicle}${yearSuffix} prices in Sri Lanka (LKR): live listings, district ` +
            `breakdown, price trends and fair-value signals on ${SITE}.`,
        };
        jsonLd = hubJsonLd(`${vehicle}${yearSuffix}`, `${ORIGIN}${pathname}`, [
          { name: "Home", path: "/" },
          { name: hub.make, path: `/cars/${slugify(hub.make)}` },
          { name: `${vehicle}${yearSuffix}`, path: pathname },
        ]);
      } else if (hub.kind === "make") {
        meta = {
          title: `${hub.make} Price Sri Lanka — Models, Listings & Trends | ${SITE}`,
          description:
            `${hub.make} prices in Sri Lanka (LKR): every tracked model with live ` +
            `listings, trends and fair-value signals on ${SITE}.`,
        };
        jsonLd = hubJsonLd(hub.make, `${ORIGIN}${pathname}`, [
          { name: "Home", path: "/" },
          { name: hub.make, path: pathname },
        ]);
      } else if (hub.kind === "district") {
        meta = {
          title: `${hub.district} Vehicle Prices — District Market Hub | ${SITE}`,
          description:
            `Live vehicle prices in ${hub.district} district (LKR): listings, model mix, ` +
            `price heatmap and market velocity on ${SITE}.`,
        };
        jsonLd = hubJsonLd(
          `${hub.district} district vehicles`,
          `${ORIGIN}${pathname}`,
          [
            { name: "Home", path: "/" },
            { name: "Locations", path: "/locations/colombo" },
            { name: hub.district, path: pathname },
          ],
        );
      } else if (hub.kind === "compare") {
        // Listing ids mean nothing to a reader; the Compare page swaps in the
        // vehicle names once the listings load (see Compare.tsx).
        const label = hub.ids.length >= 2 ? hub.ids.join(" vs ") : "vehicles";
        meta = {
          title: t("seo.compareSlugTitle", "Compare vehicles — Side-by-Side Prices & Specs | {site}", siteVars),
          description: t(
            "seo.compareDesc",
            "Side-by-side Sri Lankan vehicle comparison: price, mileage, district and fair-value verdict.",
          ),
        };
        ogImage = `${ORIGIN}/api/compare-og?slug=${hub.ids.join("-vs-")}`;
        jsonLd = {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "ItemList",
              name: `Vehicle comparison: ${label}`,
              url: `${ORIGIN}${pathname}`,
              numberOfItems: hub.ids.length,
              itemListElement: hub.ids.map((id, index) => ({
                "@type": "ListItem",
                position: index + 1,
                url: `${ORIGIN}/listing/${id}`,
              })),
            },
            breadcrumbItems([
              { name: "Home", path: "/" },
              { name: "Compare", path: "/compare" },
              { name: label, path: pathname },
            ]),
          ],
        };
      } else if (pathname === "/compare") {
        // Legacy query form: canonicalize ?ids= to the slug path (no
        // navigation here — the page/Vercel 301 owns the redirect).
        const params = new URLSearchParams(search);
        const ids = (params.get("ids") ?? "")
          .split(",")
          .map((s) => Number.parseInt(s.trim(), 10))
          .filter((n) => Number.isInteger(n) && n > 0);
        canonicalPath = canonicalComparePath(ids);
        meta = {
          title: t("seo.compareTitle", "Compare Vehicles — {site}", siteVars),
          description: t(
            "seo.compareDesc",
            "Side-by-side Sri Lankan vehicle comparison: price, mileage, district and fair-value verdict.",
          ),
        };
        jsonLd = {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: meta.title,
          description: meta.description,
          url: `${ORIGIN}${canonicalPath}`,
          isPartOf: { "@type": "WebSite", name: SITE, url: ORIGIN },
        };
      }
    }

    if (!meta) {
      meta =
        routeMeta[pathname] ??
        (pathname.startsWith("/listing/")
          ? {
              title: t("seo.listingDetailTitle", "Vehicle Detail — {site}", siteVars),
              description: defaultDescription,
            }
          : pathname.startsWith("/cars/")
          ? {
              title: t("seo.hubTitle", "Vehicle Market Hub — {site}", siteVars),
              description: t(
                "seo.hubDesc",
                "Prices, district breakdown, and live listings for a specific vehicle in Sri Lanka.",
              ),
            }
          : pathname.startsWith("/official-pulse/guide/")
          ? {
              title: t("seo.pulseGuideTitle", "Pulse Guide — {site}", siteVars),
              description: t(
                "seo.pulseGuideDesc",
                "In-platform explanation of a government or import market signal source for Sri Lankan dealers.",
              ),
            }
          : pathname.startsWith("/official-pulse/")
          ? {
              title: t("seo.pulseSignalTitle", "Pulse Signal — {site}", siteVars),
              description: t(
                "seo.pulseSignalDesc",
                "Full official market signal with in-platform context from DMT, Customs, or import parity sources.",
              ),
            }
          : { title: SITE, description: defaultDescription });
    }

    const unknownRoute = !isKnownRoutePath(pathname);
    if (unknownRoute) {
      meta = {
        title: t("seo.notFoundTitle", "Page not found — {site}", siteVars),
        description: defaultDescription,
      };
    }
    setMeta("robots", unknownRoute || isNoindexPath(pathname) ? "noindex, nofollow" : "index, follow");

    document.title = meta.title;
    setMeta("description", meta.description);
    setProperty("og:title", meta.title);
    setProperty("og:description", meta.description);
    setProperty("og:url", `${ORIGIN}${canonicalPath}`);
    setProperty("og:image", ogImage);
    setMeta("twitter:title", meta.title);
    setMeta("twitter:description", meta.description);
    setMeta("twitter:image", ogImage);
    setCanonical(`${ORIGIN}${canonicalPath}`);

    if (jsonLd) {
      setJsonLd(jsonLd);
    } else if (pathname === "/") {
      setJsonLd({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: SITE,
        url: ORIGIN,
        description: defaultDescription,
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${ORIGIN}/?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      });
    } else if (pathname === "/price-index") {
      // Dataset stub for the Market Price Index (MPI): describes the index
      // dataset without fabricating observation values client-side.
      setJsonLd({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebPage",
            name: meta.title,
            description: meta.description,
            url: `${ORIGIN}${pathname}`,
            isPartOf: { "@type": "WebSite", name: SITE, url: ORIGIN },
          },
          {
            "@type": "Dataset",
            name: `${SITE} Sri Lanka Used-Vehicle Price Index`,
            description:
              "Mix-adjusted used-vehicle price index for the Sri Lankan market, computed from live listing aggregates.",
            url: `${ORIGIN}/price-index`,
            keywords: ["Sri Lanka", "vehicle price index", "used cars", "LKR"],
            measurementTechnique: "Hedonic/mix-adjusted aggregation of live listings",
            variableMeasured: "Median asking price (LKR)",
          },
        ],
      });
    } else if (pathname === "/best-picks") {
      setJsonLd({
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Best Vehicle Deals in Sri Lanka",
        description: "Top-ranked vehicle deals from live market data.",
        url: `${ORIGIN}/best-picks`,
        itemListOrder: "https://schema.org/ItemListOrderDescending",
      });
    } else if (pathname.startsWith("/listing/")) {
      setJsonLd({
        "@context": "https://schema.org",
        "@type": "Vehicle",
        name: meta.title,
        description: meta.description,
        url: `${ORIGIN}${pathname}`,
      });
    } else {
      setJsonLd({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: meta.title,
        description: meta.description,
        url: `${ORIGIN}${canonicalPath}`,
        isPartOf: { "@type": "WebSite", name: SITE, url: ORIGIN },
      });
    }
  }, [pathname, search, t]);

  return null;
}
