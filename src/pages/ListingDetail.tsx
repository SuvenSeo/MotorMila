import { Suspense, useState, useEffect, useRef, type CSSProperties } from 'react';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { DeferredSection } from '@/components/DeferredSection';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useParams, useNavigate, useLocation, useNavigationType, Link } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, MapPin, Calendar,
  Share2, Fuel, Gauge, Settings2, MessageCircle,
  Car as CarIcon, ArrowRight, Zap, Sparkles, ShieldCheck, Clock, Database, AlertTriangle, PlugZap, Scale,
  TrendingDown, Layers
} from 'lucide-react';
import { getListingGeo, getListingHistoryReport, getListingSafetyResearch, formatPrice } from '@/services/api';
import { peekListingSeed, peekRecentBundle, takeListingBundle, type ListingBundle } from '@/lib/listingHandoff';
import { TrustCheckPanel } from '@/components/TrustCheckPanel';
import { SnapshotModeNotice } from '@/components/SnapshotModeNotice';
import { getSourceAttribution } from '@/lib/sourceAttribution';
import { parseFlexibleTime } from '@/lib/parseTime';
import type { TrustRelatedListing } from '@/lib/trustSignals';
import type { EnrichmentEnvelope, ListingFmvDetail, SafetyResearchResponse } from '@/services/api';
import type { CarListing, PriceHistoryInfo, SellerTrustProfile } from '@/types/car';
import { fmvSummaryFromVerdict } from '@/lib/fmv';
import { isVerdictOk, priceFloorLkr, resolveListingVerdict, withheldVerdictDetail, withheldVerdictHeadline } from '@/lib/priceVerdict';
import { plausibleEngineCc } from '@/lib/engineCapacity';
import { ListingImageCarousel } from '@/components/ListingImageCarousel';
import { getListingImageList, pickVehicleImageUrl } from '@/lib/listingImage';
import { toast } from 'sonner';
import { NhtsaModelsCard } from '@/components/NhtsaModelsCard';
import { SafetyResearchCard } from '@/components/SafetyResearchCard';
import { listingVin } from '@/lib/dataSanity';
import { ListingGeoCard } from '@/components/ListingGeoCard';
import { FmvExplainer } from '@/components/FmvExplainer';
import { useCompareTray } from '@/lib/compareTray';
import { loadWatchlistIds, saveWatchlistIds, toggleWatchlistId } from '@/lib/watchlist';
import { DealLadder } from '@/components/DealLadder';
import { formatListedDateTime } from '@/lib/listing-card-meta';
import { vehicleTokenLabel } from '@/lib/vehicleTokens';
import { LeaseCalculator } from '@/components/LeaseCalculator';
import { TaxBreakdown } from '@/components/TaxBreakdown';
import { CashToOwnStrip } from '@/components/CashToOwnStrip';
import { HybridCliffBadge } from '@/components/HybridCliffBadge';
import { MileageTrustChip } from '@/components/MileageTrustChip';
import { SellSpeedChip } from '@/components/SellSpeedChip';
import { AdvertHealthChip } from '@/components/AdvertHealthChip';
import { ListingHistoryReport } from '@/components/ListingHistoryReport';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import { inferFinanceClass } from '@/lib/cashToOwn';
import { useAppPreferences } from '@/lib/appPreferences';
import { useAuth } from '@/lib/authContext';
import {
  FREE_SIMILAR_LIMIT,
  freePlanText,
  hasFullPlatformAccess,
} from '@/lib/planLimits';
import type { ImportFuelType } from '@/lib/importTaxModel';
import { motion } from 'motion/react';
import { fadeIn, fadeUp, revealContainer, revealItem, useReducedMotionOrLowData } from '@/lib/motion';
import { SaveHeartIcon } from '@/components/listing/SaveHeart';
import { trackEvent } from '@/lib/analytics';
import { canonicalizeMake, canonicalizeModel } from '@/lib/makeNormalization';
import { ListingLeadActions } from '@/components/money/ListingLeadActions';
import { computeDealBadge, dealBadgeFromVerdict, DEAL_TEXT_CLASSES, formatLkrShort } from '@/lib/dealBadge';
import { detectListingLeaseTakeover } from '@/lib/leaseTakeover';
import { estimateListingMonthly, formatMonthlyLkr } from '@/lib/listingFinance';
import { DealBadge, type DealWhyData } from '@/components/listing/DealBadge';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { cardVariants } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { cn } from '@/lib/utils';
import { BeforeYouPayStrip } from '@/components/listing/BeforeYouPayStrip';
import { ListingStickyBar } from '@/components/listing/ListingStickyBar';
import { SimilarCarsStrip } from '@/components/listing/SimilarCarsStrip';
import { AnimatedPrice } from '@/components/listing/AnimatedPrice';
import { AiValueMeter } from '@/components/listing/AiValueMeter';
import { silhouetteFor } from '@/lib/vehicleSilhouette';
import '@/styles/cinematic-pages.css';

// The price-timeline chart pulls in recharts (chart-vendor, ~115 kB gz). It sits
// below the fold, so it loads on its own chunk once the page has painted.
const loadPriceTimeline = () => import('@/components/ListingPriceTimeline');
const ListingPriceTimeline = lazyWithRetry(() => loadPriceTimeline().then((m) => ({ default: m.ListingPriceTimeline })));

export default function ListingDetail() {
  // Warm the chart chunk once the hero has painted (idle), so it is usually
  // ready by the time the price history scrolls into view.
  useEffect(() => {
    const ric = window.requestIdleCallback;
    if (typeof ric === "function") {
      const handle = ric(() => void loadPriceTimeline().catch(() => {}), { timeout: 4000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(() => void loadPriceTimeline().catch(() => {}), 2500);
    return () => window.clearTimeout(timer);
  }, []);

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const navType = useNavigationType();
  const navTypeRef = useRef(navType);
  navTypeRef.current = navType;
  const keyRef = useRef(routerLocation.key);
  keyRef.current = routerLocation.key;
  const motionCalm = useReducedMotionOrLowData();
  // Below-the-fold sections reveal once as they scroll in (opacity only when calm).
  const onScroll = {
    initial: 'hidden',
    whileInView: 'show',
    viewport: { once: true, margin: '0px 0px -8% 0px' },
    variants: motionCalm ? fadeIn : fadeUp,
  } as const;
  const { t, localeTag, language } = useAppPreferences();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  // A card tap hands over its listing + decoded photo (lib/listingHandoff):
  // the header and hero paint at once while the detail data loads.
  const [seed] = useState(() => peekListingSeed(id));
  // Back/forward onto a listing this tab just showed: its bundle, painted at once.
  // (Not on the first entry of a page load, which is also a POP.)
  const [kept] = useState(() => (navType === 'POP' && routerLocation.key !== 'default' ? peekRecentBundle(id) : null));
  const [listing, setListing] = useState<CarListing | null>(kept?.[0] ?? seed?.listing ?? null);
  /** The detail bundle (listing, similar, history, FMV) has arrived. */
  const [dataReady, setDataReady] = useState(!!kept);
  const [similar, setSimilar] = useState<CarListing[]>(kept?.[1] ?? []);
  const [sellerProfile, setSellerProfile] = useState<SellerTrustProfile | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryInfo | null>(kept?.[2] ?? null);
  const [fmvDetail, setFmvDetail] = useState<ListingFmvDetail | null>(kept?.[3] ?? null);
  const [safetyResearch, setSafetyResearch] = useState<SafetyResearchResponse | null>(null);
  const [listingGeo, setListingGeo] = useState<EnrichmentEnvelope | null>(null);
  /** Cross-site linked listings; null = history service unavailable. */
  const [relatedListings, setRelatedListings] = useState<TrustRelatedListing[] | null>(null);
  const [loading, setLoading] = useState(!seed && !kept);
  const [photoAspectRatio, setPhotoAspectRatio] = useState<number | null>(() => seed?.aspectRatio ?? null);
  const { toggle: toggleCompare, isPinned: isPinnedForCompare } = useCompareTray();
  const [watchlisted, setWatchlisted] = useState(false);
  // Everything below the price waits for the detail data, then mounts one
  // section per frame (DeferredSection): the card → listing open used to
  // commit the whole below-the-fold as one 100–170 ms long task. The finance
  // planner (Radix slider measures on mount) and similar cars (Embla) mount
  // only near the viewport or once idle.
  const rest = listing !== null && dataReady;
  // The price/typical-price blocks exist twice (mobile flow, desktop sidebar)
  // and CSS hid one: render only the one this layout shows.
  const isDesktop = useMediaQuery('(min-width: 1024px)', true);
  const isMobileFlow = !isDesktop || typeof window === 'undefined' || typeof window.matchMedia !== 'function';

  const handleWatchlistToggle = () => {
    if (!listing) return;
    const listingId = Number(listing.id);
    if (!Number.isFinite(listingId) || listingId <= 0) return;
    const { ids, blocked } = toggleWatchlistId(loadWatchlistIds(), listingId);
    if (blocked) {
      toast.error(t("listing.watchlistFull", "Watchlist is full — remove one first"));
      return;
    }
    saveWatchlistIds(ids);
    const nowSaved = ids.includes(listingId);
    setWatchlisted(nowSaved);
    toast.success(nowSaved
      ? t("listing.watchlistAdded", "Saved to your watchlist")
      : t("listing.watchlistRemoved", "Removed from your watchlist"));
  };

  const handleBack = () => {
    // location.key is "default" on the first in-app entry (landed from a search engine, a shared
    // link or a new tab): going back there would leave Motormila, so send the user to the market.
    if (routerLocation.key !== 'default' && window.history.length > 1) navigate(-1);
    else navigate('/');
  };
  const buildShareText = () => {
    if (!listing) return document.title;
    const name = [listing.year, listing.make, listing.model].filter(Boolean).join(' ');
    const price = Number(listing.price_lkr || 0);
    const priceText = Number.isFinite(price) && price >= 100_000 ? ` — ${formatPrice(price)}` : '';
    return `${name}${priceText} on Motormila`;
  };

  const handleShare = async () => {
    const text = buildShareText();
    if (navigator.share) {
      try {
        await navigator.share({ title: text, text, url: window.location.href });
        return;
      } catch {
        // User dismissed the sheet or share failed — fall through to clipboard.
      }
    }
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(window.location.href); toast.success(t("listing.copied", "Link copied")); }
      else toast.error(t("listing.copyUnavailable", "Copy unavailable"));
    } catch { toast.error(t("listing.clipboardBlocked", "Clipboard blocked")); }
  };

  const handleWhatsAppShare = () => {
    const text = `${buildShareText()}\n${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const handleComparePin = () => {
    if (!listing) return;
    const price = Number(listing.price_lkr || 0);
    const priced = Number.isFinite(price) && price >= 100_000 && price <= 500_000_000;
    const pinVerdict = resolveListingVerdict(listing, fmvDetail);
    const result = toggleCompare({
      id: Number(listing.id),
      make: listing.make,
      model: listing.model,
      year: listing.year,
      price_lkr: priced ? price : null,
      fmv_lkr: isVerdictOk(pinVerdict) ? pinVerdict.referenceLkr : null,
      mileage_km: Number(listing.mileage_km) || null,
      district: listing.district,
      deal_score: isVerdictOk(pinVerdict) ? Math.round(-pinVerdict.gapPct * 10) / 10 : null,
    });
    if (result.atCap) toast.error(t("listing.compareFull", "Compare tray is full (max 4) — remove one first"));
    else if (result.pinned) toast.success(t("listing.compareAdded", "Pinned to compare tray"));
  };

  useEffect(() => {
    if (!id) return;
    // Peer links navigate mid-scroll: open each listing at the top. Back/forward
    // keeps the restored position (ScrollRestoration).
    if (navTypeRef.current !== 'POP') window.scrollTo(0, 0);
    let cancelled = false;
    const showBundle = ([detail, sim, history, fmv]: ListingBundle) => {
      setListing(detail); setSimilar(sim); setPriceHistory(history); setFmvDetail(fmv); setLoading(false); setDataReady(true);
      setWatchlisted(detail ? loadWatchlistIds().includes(Number(detail.id)) : false);
      if (detail) document.title = `${detail.title} — Motormila`;
    };
    setSellerProfile(null); setSafetyResearch(null); setListingGeo(null); setRelatedListings(null);
    // Back/forward onto a listing this tab just showed: paint it as it was (no
    // skeleton), so the scroll restore finds the similar car the visitor tapped.
    const back = navTypeRef.current === 'POP' && keyRef.current !== 'default' ? peekRecentBundle(id) : null;
    if (back) showBundle(back);
    else {
      const handed = peekListingSeed(id);
      if (handed) { setListing(handed.listing); setLoading(false); } else setLoading(true);
      setDataReady(false); setPriceHistory(null); setFmvDetail(null);
      // seller-profile is retired (410): seller contact happens on the source site.
      takeListingBundle(id)
        .then((bundle) => {
          // Ignore a slow response for a listing the user already navigated away from.
          if (cancelled) return;
          showBundle(bundle);
          const detail = bundle[0];
          if (detail) trackEvent("listing_viewed", { listing_id: detail.id, make: detail.make, model: detail.model, source: detail.source });
        });
    }
    getListingSafetyResearch(id).then((r) => { if (!cancelled) setSafetyResearch(r); }).catch(() => setSafetyResearch(null));
    getListingGeo(id).then((g) => { if (!cancelled) setListingGeo(g); }).catch(() => setListingGeo(null));
    getListingHistoryReport(id)
      .then((report) => { if (!cancelled) setRelatedListings(Array.isArray(report?.related_listings) ? report.related_listings : []); })
      .catch(() => { if (!cancelled) setRelatedListings(null); });
    return () => { cancelled = true; };
  }, [id]);

  // Enrich the generic route JSON-LD (set by RouteMeta) with real vehicle data
  // once the listing loads — same script element, so there is only ever one.
  useEffect(() => {
    if (!listing) return;
    const script = document.getElementById('motormila-jsonld');
    if (!script) return;

    const price = Number(listing.price_lkr || 0);
    const image = pickVehicleImageUrl(
      [listing.thumbnail_url, ...(Array.isArray(listing.images) ? listing.images : [])],
      [listing.url, listing.detail_url, listing.external_url],
    );

    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Vehicle',
      name: [listing.year, listing.make, listing.model].filter(Boolean).join(' ') || listing.title,
      brand: listing.make ? { '@type': 'Brand', name: listing.make } : undefined,
      model: listing.model || undefined,
      vehicleModelDate: listing.year ? String(listing.year) : undefined,
      mileageFromOdometer:
        Number.isFinite(Number(listing.mileage_km)) && Number(listing.mileage_km) > 0
          ? { '@type': 'QuantitativeValue', value: Number(listing.mileage_km), unitCode: 'KMT' }
          : undefined,
      fuelType: listing.fuel_type || undefined,
      vehicleTransmission: listing.transmission || undefined,
      bodyType: listing.body_type || undefined,
      image: image || undefined,
      url: `https://motormila.vercel.app/listing/${listing.id}`,
      areaServed: listing.district
        ? { '@type': 'AdministrativeArea', name: `${listing.district}, Sri Lanka` }
        : undefined,
      offers:
        Number.isFinite(price) && price >= 100_000
          ? {
              '@type': 'Offer',
              price,
              priceCurrency: 'LKR',
              availability: 'https://schema.org/InStock',
              areaServed: listing.district || 'Sri Lanka',
            }
          : undefined,
    });
  }, [listing]);

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto max-w-[1320px] animate-pulse space-y-6 px-5 py-16 sm:px-6">
          <div className="skeleton-shimmer h-4 w-28 rounded" />
          <div className="skeleton-shimmer h-10 w-2/3 rounded" />
          <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
            <div className="skeleton-shimmer h-[320px] rounded-[2rem]" />
            <div className="skeleton-shimmer h-[320px] rounded-[2rem]" />
          </div>
        </div>
      </div>
    );
  }

  // ── Not found ──────────────────────────────────────────────
  if (!listing) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-5">
        <div className="text-center">
          <CarIcon className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
          <p className="text-caption font-medium text-muted-foreground">{t("listing.unavailable", "Unavailable")}</p>
          <h1 className="mt-2 font-display text-title3 font-semibold text-foreground">{t("listing.notFound", "Listing not found")}</h1>
          <p className="mt-2 max-w-sm text-caption text-muted-foreground">{t("listing.notFoundBody", "The source may have removed it or the ID is no longer in the live index.")}</p>
          <Button type="button" className="mt-5" onClick={() => navigate('/')}>{t("listing.returnInventory", "Return to inventory")}</Button>
        </div>
      </div>
    );
  }

  // ── Derived data ───────────────────────────────────────────
  const attribution = getSourceAttribution(listing);
  const listingUrl = attribution.href;
  const displayMake = canonicalizeMake(listing.make) || listing.make;
  const displayModel = canonicalizeModel(listing.model) || listing.model;
  const displayName = `${displayMake} ${displayModel}`;
  // Full gallery for the carousel (primary photo first).
  const galleryImages = getListingImageList(listing);
  const listingPrice = Number(listing.price_lkr || 0);
  // Same floor as the verdict (bike 50k, three-wheeler 100k, car 300k): a Rs 85,000 bike is a price, not "Unlisted".
  const hasPrice = Number.isFinite(listingPrice) && listingPrice >= Math.min(100_000, priceFloorLkr(listing.vehicle_category)) && listingPrice <= 500_000_000;
  // Map the listing's fuel label onto the import-tax model's fuel classes.
  const fuelRaw = String(listing.fuel_type || '').toLowerCase();
  const importFuelType: ImportFuelType =
    fuelRaw.includes('hybrid') || fuelRaw.includes('phev') ? 'hybrid'
    : fuelRaw.includes('electric') || fuelRaw === 'ev' ? 'electric'
    : fuelRaw.includes('diesel') ? 'diesel'
    : 'petrol';

  const lease = detectListingLeaseTakeover(listing);
  // THE price verdict for this listing: computed once from the FMV estimate
  // (+ its comps/confidence) and handed to every panel below — deal badge,
  // FMV card, deal ladder, Trust Check, price timeline, compare pin, sticky
  // bar — so no two of them can contradict each other (src/lib/priceVerdict.ts).
  const verdict = resolveListingVerdict(listing, fmvDetail);
  const fmvLkr = isVerdictOk(verdict) ? verdict.referenceLkr : null;
  // null deal_score = rating suppressed server-side (thin cohort / old vehicle / extreme price / free plan)
  const ratingAllowed = fullAccess && listing.deal_score !== null && listing.deal_score !== undefined;
  // No deal call until the FMV is in (a seeded first paint has only the card's data).
  const deal: ReturnType<typeof computeDealBadge> = !dataReady
    ? { kind: 'none', gapLkr: 0, gapPctBelow: 0 }
    : dealBadgeFromVerdict(verdict, { isLeaseTakeover: lease.isLeaseTakeover, ratingAllowed });
  const dealWhy: DealWhyData = {
    fmvLkr,
    askingLkr: hasPrice ? listingPrice : null,
    compsCount: fmvDetail ? fmvDetail.sample_size : null,
    confidence: fmvDetail?.confidence ?? null,
    method: fmvDetail?.method ?? null,
  };
  const fmvSummary = hasPrice && !lease.isLeaseTakeover ? fmvSummaryFromVerdict(listingPrice, verdict, t) : null;
  const fmvKind = fmvSummary?.verify_first ? 'verify' : fmvSummary?.band === 'below' ? 'below' : fmvSummary?.band === 'above' ? 'above' : 'fair';
  const monthly = hasPrice
    ? estimateListingMonthly({
        priceLkr: listingPrice,
        condition: listing.condition,
        fuelType: listing.fuel_type,
        year: listing.year,
        isLeaseTakeover: lease.isLeaseTakeover,
      })
    : null;

  const visibleSimilar = fullAccess ? similar : similar.slice(0, FREE_SIMILAR_LIMIT);
  const sellerName = sellerProfile?.seller_name || listing.seller_name || null;
  const sellerType = sellerProfile?.seller_type || (listing.is_dealer ? 'dealer' : 'unknown');
  const sellerHeadline = sellerType === 'dealer' ? t("listing.dealer", "Dealer") : sellerType === 'private' ? t("listing.privateSeller", "Private Seller") : t("listing.sourceSeller", "Source Seller");
  const trackedDays = (() => { const ts = parseFlexibleTime(listing.first_seen_at); return ts !== null ? Math.max(1, Math.round((Date.now() - ts) / 86_400_000)) : null; })();
  const listedDateTime = formatListedDateTime(listing.first_seen_at);
  const peerAges = visibleSimilar.map((s) => { const ts = parseFlexibleTime(s.first_seen_at); return ts !== null ? Math.max(1, Math.round((Date.now() - ts) / 86_400_000)) : null; }).filter((v): v is number => v !== null);
  const avgPeerDays = peerAges.length ? Math.round(peerAges.reduce((a, b) => a + b, 0) / peerAges.length) : null;

  // Cross-source matches from the history service (confirmed/likely only).
  const otherSources = new Set(
    (relatedListings ?? [])
      .filter((r) => !r.confidence || r.confidence === 'confirmed' || r.confidence === 'likely')
      .map((r) => String(r.source || '').toLowerCase())
      .filter((s) => s && s !== String(listing.source || '').toLowerCase()),
  );
  const seenOnSites = otherSources.size > 0 ? otherSources.size + 1 : null;

  const engineCc = plausibleEngineCc(listing.engine_cc, listing.year);
  const keySpecs = [
    { label: t("common.year", "Year"), value: listing.year ? String(listing.year) : null, icon: Calendar },
    { label: t("common.mileage", "Mileage"), value: Number.isFinite(Number(listing.mileage_km)) && Number(listing.mileage_km) > 0 ? `${Number(listing.mileage_km).toLocaleString()} km` : null, icon: Gauge },
    { label: t("common.fuel", "Fuel"), value: vehicleTokenLabel("fuel", listing.fuel_type, t), icon: Fuel },
    { label: t("common.transmission", "Transmission"), value: vehicleTokenLabel("transmission", listing.transmission, t), icon: Settings2 },
    { label: t("listing.engine", "Engine"), value: engineCc ? `${Math.round(engineCc).toLocaleString()} cc` : null, icon: Zap },
    { label: t("common.condition", "Condition"), value: vehicleTokenLabel("condition", listing.condition, t), icon: Sparkles },
    { label: t("common.body", "Body"), value: vehicleTokenLabel("body", listing.body_type, t), icon: CarIcon },
  ].filter((s): s is { label: string; value: string; icon: typeof Calendar } => Boolean(s.value));

  const silhouette = silhouetteFor(listing);
  const heroPlaceholder = seed?.heroSrc && String(seed.listing.id) === String(listing.id) ? seed.heroSrc : null;
  const priceCut = priceHistory && priceHistory.cut_count > 0 ? priceHistory : null;

  // ── Blocks (some render in both the mobile flow and the desktop sidebar) ──
  const renderPriceBlock = (placement: 'mobile' | 'desktop') => (
    <div className={placement === 'desktop' ? cn(cardVariants({ padding: "md" }), "shadow-e2") : ''}>
      <h2 className="cine-eyebrow text-muted-foreground">{t("listing.askingPrice", "Asking price")}</h2>
      <p className="num cine-display mt-1.5 text-[clamp(2.375rem,1.6rem+2.4vw,3.25rem)] leading-[1] text-foreground">
        {hasPrice ? <AnimatedPrice priceLkr={listingPrice} /> : t("listing.unlisted", "Unlisted")}
      </p>
      {deal.kind !== 'none' && (
        <DealBadge badge={deal} tone="soft" size="md" why={deal.kind === 'lease' ? null : dealWhy} className="mt-3 flex-wrap" />
      )}
      {dataReady && hasPrice && !lease.isLeaseTakeover && isVerdictOk(verdict) && (
        <AiValueMeter verdict={verdict} className="mt-4 rounded-card border border-border bg-background/40 p-3.5" />
      )}
      {lease.isLeaseTakeover && lease.monthlyLkr && (
        <p className="mt-2 text-footnote leading-relaxed text-muted-foreground">
          {lease.monthsRemaining
            ? t("listing.leaseTerms", "The ad also mentions {months} instalments of {monthly} still to pay.", {
                months: lease.monthsRemaining,
                monthly: formatMonthlyLkr(lease.monthlyLkr),
              })
            : t("listing.leaseMonthly", "The ad also mentions instalments of {monthly} a month still to pay.", {
                monthly: formatMonthlyLkr(lease.monthlyLkr),
              })}
        </p>
      )}
      {monthly && (
        <p className="mt-2 text-footnote text-muted-foreground num">
          {t("listing.monthlyLine", "{amount} est. /mo", { amount: formatMonthlyLkr(monthly.monthlyLkr) })}
          <span className="text-muted-foreground/80">
            {' · '}
            {t("listing.monthlyBasis", "{ltv}% loan (CBSL cap), {rate}% over {years} yrs", {
              ltv: monthly.ltvPct,
              rate: monthly.ratePct,
              years: monthly.termYears,
            })}
          </span>
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {priceCut && (
          <Badge
            className="gap-1"
            title={t("listing.priceCutTitle", "Downward price moves since Motormila first saw this ad")}
          >
            <TrendingDown aria-hidden className="h-3 w-3 text-primary" />
            {t("listing.priceCut", "Price cut {n}×", { n: priceCut.cut_count })}
            {priceCut.change_pct !== null && priceCut.change_pct < 0 && <span className="num">({priceCut.change_pct}%)</span>}
          </Badge>
        )}
        {seenOnSites && (
          <Badge className="num gap-1">
            <Layers aria-hidden className="h-3 w-3" /> {t("listingCard.onSites", "On {n} sites", { n: seenOnSites })}
          </Badge>
        )}
        <SellSpeedChip listing={listing} />
        <AdvertHealthChip listing={listing} />
        <HybridCliffBadge fuelType={listing.fuel_type} engineCc={engineCc} />
      </div>

      {placement === 'desktop' && (
        <div className="mt-5 space-y-3 border-t border-border pt-4">
          {listingUrl ? (
            <a
              href={listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent("contact_on_source_clicked", { listing_id: listing.id, source: listing.source, placement: "sidebar" })}
              className={cn(buttonVariants({ size: "lg" }), "w-full no-underline")}
            >
              {t("listing.viewOnSource", "View on {source}", { source: attribution.sourceName })}
              <ExternalLink aria-hidden className="h-4 w-4" />
            </a>
          ) : (
            <p className="text-caption text-muted-foreground">{t("listing.noSourceLink", "The original ad link isn't available for this listing.")}</p>
          )}
          <p className="text-caption leading-relaxed text-muted-foreground">
            {t("listing.contactNote", "Opens the original ad. Motormila doesn't share seller phone numbers.")}
          </p>
          <BeforeYouPayStrip idSuffix="desktop" />
        </div>
      )}
    </div>
  );

  const renderFmvCard = () => (
    <section aria-labelledby="fmv-card-title" className={cardVariants({ padding: "md" })}>
      <h2 id="fmv-card-title" className="text-caption font-semibold text-muted-foreground">{t("listing.typicalPrice", "Typical asking price")}</h2>
      {lease.isLeaseTakeover ? (
        <p className="mt-2 text-footnote leading-relaxed text-muted-foreground">
          {t("listing.leaseNoFmv", "This is a lease takeover, so the price shown isn't the full price. We don't compare it with typical prices or give it a deal rating.")}
        </p>
      ) : fmvSummary ? (
        <>
          <p className="num mt-1 text-title2 font-extrabold tracking-tight text-foreground">{formatLkrShort(fmvSummary.fmv_lkr)}</p>
          <p className={`mt-0.5 text-footnote font-bold ${DEAL_TEXT_CLASSES[fmvKind]}`}>{fmvSummary.label}</p>
          {fmvDetail && fmvDetail.method !== "insufficient_data" && (
            <p className="mt-1 text-caption text-muted-foreground">
              {fmvDetail.sample_size > 0 ? t("listing.compsLine", "{n} comparable listings", { n: fmvDetail.sample_size }) : ""}
              {fmvDetail.confidence !== "none" ? ` · ${t("listing.confidenceLine", "{level} confidence", { level: fmvDetail.confidence })}` : ""}
            </p>
          )}
          {hasPrice && (
            <div className="mt-3">
              <DealLadder askingPrice={listingPrice} marketMedianLkr={fmvSummary.fmv_lkr} verdict={verdict} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
            <FmvExplainer
              compsCount={fmvDetail?.sample_size ?? 0}
              confidence={fmvDetail?.confidence ?? "none"}
              method={fmvDetail?.method}
              fmvLkr={fmvSummary.fmv_lkr}
              updatedAt={fmvDetail?.updated_at}
              locale={language}
            />
            <Chip onClick={handleComparePin} selected={isPinnedForCompare(Number(listing.id))}>
              <Scale aria-hidden />
              {isPinnedForCompare(Number(listing.id)) ? t("listing.pinned", "Pinned ✓") : t("listing.addToCompare", "Add to compare")}
            </Chip>
          </div>
          <p className="mt-2 text-caption text-muted-foreground">
            {t("deal.whyAsking", "These are asking prices on listing sites, not sale prices.")}
          </p>
        </>
      ) : verdict.status === "withheld" && (verdict.group !== "insufficient_data" || verdict.reason === "generic_model") ? (
        <>
          <p className="mt-1 text-footnote font-bold text-foreground">{withheldVerdictHeadline(verdict, t)}</p>
          <p className="mt-1 text-caption leading-relaxed text-muted-foreground">{withheldVerdictDetail(verdict, t)}</p>
        </>
      ) : (
        <p className="mt-2 text-caption text-muted-foreground">
          {t("listing.noFmv", "Not enough comparable listings for a confident typical price on this vehicle.")}
        </p>
      )}
    </section>
  );

  // Pro upsell sits *below* the FMV card, never between price and valuation.
  // Only when this listing actually has a rating to unlock: "Deal scores are a
  // Pro signal" under a withheld verdict promises a score that doesn't exist.
  const renderProUpsell = () =>
    !fullAccess && !lease.isLeaseTakeover && dataReady && isVerdictOk(verdict) ? (
      <UpgradePrompt title={freePlanText(t, "scoresTitle")} body={freePlanText(t, "scoresBody")} variant="strip" />
    ) : null;

  const actionBtn = cn(buttonVariants({ variant: "secondary", size: "icon" }), "text-muted-foreground hover:text-foreground [&_svg]:size-4");

  // ── Render ─────────────────────────────────────────────────
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={revealContainer}
      className="relative min-h-screen overflow-hidden bg-background pb-44 lg:pb-0"
    >
      {/* Stage — "Night drive": a dark band (both themes) holding the title and
          the filmstrip gallery. `theme-dark` scopes every token inside it. */}
      <motion.section
        variants={revealItem}
        className="cine-stage theme-dark relative z-10 -mt-[var(--nav-offset)] pt-[var(--nav-offset)] text-foreground"
      >
        <div className="mx-auto flex max-w-[1320px] flex-col px-5 pb-6 pt-4 sm:px-6 md:pb-8 md:pt-6">
          <div className="mb-3 flex items-center justify-between gap-3 md:mb-5">
            <Button type="button" variant="ghost" size="sm" onClick={handleBack} className="group -ml-2 text-muted-foreground">
              <ArrowLeft aria-hidden className="transition-transform duration-short group-hover:-translate-x-0.5" /> {t("common.back", "Back")}
            </Button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleWhatsAppShare} className={actionBtn} aria-label={t("listing.shareWhatsApp", "Share on WhatsApp")} title={t("listing.shareWhatsApp", "Share on WhatsApp")}>
                <MessageCircle aria-hidden className="h-4 w-4" />
              </button>
              <button type="button" onClick={handleShare} className={actionBtn} aria-label={t("listing.share", "Share")} title={t("listing.share", "Share")}>
                <Share2 aria-hidden className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleWatchlistToggle}
                aria-pressed={watchlisted}
                aria-label={watchlisted ? t("listing.saved", "Saved ✓") : t("listing.save", "Save")}
                title={watchlisted ? t("listing.saved", "Saved ✓") : t("listing.save", "Save")}
                className={`${actionBtn} ${watchlisted ? "!border-deal-high/30 !bg-deal-high/10 !text-deal-high-text dark:!text-deal-high-text" : ""}`}
              >
                <SaveHeartIcon saved={watchlisted} className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Title (below the photos on phones, above them from md) */}
          <div className="order-2 mt-5 md:order-1 md:mt-0 md:mb-6">
            <p className="cine-eyebrow mb-3 text-muted-foreground">
              {t("listing.listedOnSource", "Listed on {source}", { source: attribution.sourceName })}
              {attribution.checkedAgo ? ` · ${t("listing.lastChecked", "last checked {ago}", { ago: attribution.checkedAgo })}` : ''}
            </p>
            <SnapshotModeNotice className="mb-4 max-w-2xl" />
          {listing.is_active === false && (
            <div className="mb-4 flex max-w-2xl items-start gap-2.5 rounded-card border border-deal-caution/25 bg-deal-caution/10 p-3.5">
              <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-deal-caution-text" />
              <div>
                <p className="text-caption font-bold text-deal-caution-text">{t("listing.possiblySold", "Possibly sold or delisted")}</p>
                <p className="mt-0.5 text-caption font-medium leading-relaxed text-muted-foreground">
                  {parseFlexibleTime(listing.last_seen_at) !== null
                    ? t("listing.notSeenSince", "This ad has not been seen at {source} since {date}.", {
                        source: listing.source,
                        date: new Date(parseFlexibleTime(listing.last_seen_at)!).toLocaleDateString(localeTag, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo' }),
                      })
                    : t("listing.notSeenRecently", "This ad has not been seen at {source} recently.", { source: listing.source })}{' '}
                  {t("listing.historicalPricing", "Pricing below is kept for market reference and may be historical.")}
                </p>
              </div>
            </div>
          )}

            <h1 className="cine-display max-w-4xl text-[clamp(2rem,1.2rem+3vw,3.75rem)] text-foreground">
              {displayName}{listing.year ? <span className="text-muted-foreground"> · {listing.year}</span> : null}
            </h1>
            {listing.title && listing.title !== displayName && (
              <p className="mt-3 max-w-2xl text-body font-medium leading-relaxed text-muted-foreground">{listing.title}</p>
            )}
          </div>

          {/* Gallery — filmstrip: 4:3 frames, the next photo peeks in (md+),
              swipe / arrows / ←→ keys, tap for the full-screen viewer. */}
          <div
            data-listing-gallery
            data-hero-ph={heroPlaceholder ? "" : undefined}
            data-single={galleryImages.length <= 1 ? "" : undefined}
            className="cine-gallery order-1 -mx-5 sm:-mx-6 md:order-2 md:mx-0"
          >
            <div className="cine-gallery__frame group" style={photoAspectRatio ? { '--photo-ratio': photoAspectRatio } as CSSProperties : undefined}>
              {heroPlaceholder && (
                // The card's photo (already decoded): shows under the hero
                // until the full-size photo lands, and is what the card → listing
                // View Transition morphs into when the hero isn't ready yet.
                <img
                  src={heroPlaceholder}
                  alt=""
                  aria-hidden
                  data-listing-hero-ph=""
                  referrerPolicy="no-referrer"
                  className="cine-gallery__ph"
                />
              )}
              <ListingImageCarousel
                images={galleryImages}
                listingId={listing.id}
                alt={displayName}
                variant="detail"
                source={listing.source}
                silhouette={silhouette}
                priority
                className="relative w-full"
                frameClassName={photoAspectRatio ? 'aspect-[var(--photo-ratio)]' : 'h-[var(--g-h)]'}
                onPhotoAspectRatio={setPhotoAspectRatio}
                slideClassName="cine-gallery__slide"
                trackClassName="cine-gallery__track"
              />
              {/* Source credit for hotlinked photos. Fixed bright blue: sits on a dark scrim. */}
              <span className="cine-gallery__credit pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-caption font-semibold text-[#6CB8FF]">
                <Database aria-hidden className="h-3 w-3" /> {t("listingImage.credit", "Photo: {source}", { source: attribution.sourceName })}
              </span>
              <div className="cine-nophoto">
                <p className="cine-eyebrow text-white/60">{t("listing.noPhoto.kicker", "No photos on Motormila")}</p>
                <p className="cine-display text-title3 text-white">{displayName}</p>
                {listingUrl && (
                  <a
                    href={listingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-3.5 text-caption font-semibold text-white no-underline hover:bg-white/10"
                  >
                    {t("listing.noPhoto.cta", "See the photos on {source}", { source: attribution.sourceName })}
                    <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-5 sm:px-6 md:px-0">
              {listing.district && (
                <span className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground"><MapPin aria-hidden className="h-3.5 w-3.5 text-primary-bright" /> {listing.district}</span>
              )}
              {trackedDays && (
                <span className="num flex items-center gap-1.5 text-caption font-medium text-muted-foreground"><Clock aria-hidden className="h-3.5 w-3.5 text-primary-bright" /> {t("listing.tracked", "Tracked {days}", { days: `${trackedDays}d` })}</span>
              )}
              {listedDateTime && (
                <span
                  className="num flex items-center gap-1.5 text-caption font-medium text-muted-foreground"
                  title={t("listing.listedTitle", "When Motormila first spotted this ad — usually within hours of it going live on the source site.")}
                >
                  <Calendar aria-hidden className="h-3.5 w-3.5 text-primary-bright" /> {t("listing.listed", "Listed {date}", { date: listedDateTime })}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.section>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-[1320px] px-5 py-6 sm:px-6 lg:py-10">
        <div className="grid gap-6 lg:grid-cols-[1.75fr_1fr] lg:items-start lg:gap-8">

          {/* ── MAIN ──────────────────────────────────────────── */}
          {/* flex gap, not space-y: Tailwind's `space-y > :not([hidden]) ~ :not([hidden])`
              makes Chrome restyle the whole column on every child insert (~550
              elements, ~35 ms at 4× CPU per deferred section). */}
          <div className="flex min-w-0 flex-col gap-6">

            {/* 2. Price + badge (mobile flow; desktop shows it in the sidebar) */}
            {isMobileFlow && (
            <motion.div variants={revealItem} className="space-y-3 lg:hidden">
              {renderPriceBlock('mobile')}
              <BeforeYouPayStrip collapsible idSuffix="mobile" />
            </motion.div>
            )}

            {/* 3. Key specs — only what we actually know */}
            {rest && keySpecs.length > 0 && (
              <DeferredSection minHeight={180}>
              <motion.section {...onScroll} aria-labelledby="key-specs-title" className="space-y-3">
                <h2 id="key-specs-title" className="cine-eyebrow text-muted-foreground">{t("listing.keySpecs", "Key specs")}</h2>
                <dl className="cine-specs">
                  {keySpecs.map((s) => (
                    <div key={s.label} className="min-w-0">
                      <dt className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
                        <s.icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-primary" />
                        {s.label}
                      </dt>
                      <dd className="num mt-1.5 truncate text-callout font-semibold leading-tight text-foreground">{s.value}</dd>
                    </div>
                  ))}
                </dl>
                <MileageTrustChip mileageKm={listing.mileage_km} year={listing.year} />
              </motion.section>
              </DeferredSection>
            )}

            {/* 4. FMV / why (mobile flow) + Pro upsell below it */}
            {rest && isMobileFlow && (
            <DeferredSection minHeight={280}>
            <motion.div {...onScroll} className="space-y-3 lg:hidden">
              {renderFmvCard()}
              {renderProUpsell()}
            </motion.div>
            </DeferredSection>
            )}

            {/* 5. Price history */}
            {rest && priceHistory && priceHistory.points.length > 0 && (
              <DeferredSection minHeight={224}>
              <motion.div {...onScroll}>
                <Suspense fallback={<div className="h-56 rounded-2xl border border-border bg-card skeleton-shimmer" />}>
                  <ListingPriceTimeline
                    history={priceHistory}
                    marketMedianLkr={fmvLkr}
                    listingTitle={displayName}
                  />
                </Suspense>
              </motion.div>
              </DeferredSection>
            )}

            {rest ? (
              <>
              {/* 6. Trust Check */}
              <DeferredSection minHeight={420}>
              <motion.div {...onScroll} className="cv-section">
                <TrustCheckPanel
                  listing={listing}
                  verdict={dataReady ? verdict : null}
                  pricePoints={priceHistory?.points ?? null}
                  related={relatedListings}
                />
              </motion.div>
              {listing.id != null && <ListingHistoryReport listingId={listing.id} />}
              </DeferredSection>

              {/* 7. Finance planner */}
              {hasPrice && (lease.isLeaseTakeover ? (
                <DeferredSection minHeight={140}>
                <motion.section {...onScroll} className={cn(cardVariants({ padding: "md" }), "cv-section")}>
                  <h2 className="text-caption font-semibold text-muted-foreground">{t("listing.ownershipPlanning", "Ownership planning")}</h2>
                  <p className="mt-2 text-footnote leading-relaxed text-muted-foreground">
                    {t("listing.leaseNoFinance", "Finance estimates are hidden: the price on a lease takeover isn't the full price. Ask the seller for the settlement letter from the finance company first.")}
                  </p>
                </motion.section>
                </DeferredSection>
              ) : (() => {
                // brand_new already covers API-normalized "unregistered"/new imports
                const isUnregistered =
                  listing.condition === 'brand_new' ||
                  (typeof listing.year === 'number' && listing.year >= 2025);
                const financeClass = inferFinanceClass({
                  condition: listing.condition,
                  fuelType: listing.fuel_type,
                  year: listing.year,
                });
                return (
                  <DeferredSection lazy minHeight={520}>
                  <motion.div {...onScroll} className="cv-section space-y-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="text-caption font-semibold text-muted-foreground">{t("listing.ownershipPlanning", "Ownership planning")}</h2>
                      <Link to="/afford" className="text-caption font-semibold text-primary no-underline hover:underline">
                        {t("listing.whatCanIAfford", "What else fits my budget?")}
                      </Link>
                    </div>
                    <CashToOwnStrip priceLkr={listingPrice} financeClass={financeClass} />
                    <div className="grid items-start gap-4 md:grid-cols-2">
                      <LeaseCalculator price={listingPrice} financeClass={financeClass} />
                      {isUnregistered ? (
                        <TaxBreakdown
                          price={listingPrice}
                          engineCapacity={engineCc}
                          initialFuelType={importFuelType}
                        />
                      ) : (
                        <div className={cn(cardVariants({ padding: "md" }), "flex flex-col gap-4")}>
                          <div>
                            <h2 className="text-footnote font-semibold text-primary">{t("listing.importDutyTax", "Import duty and tax")}</h2>
                            <p className="mt-2 text-footnote leading-relaxed text-label-2">
                              {t(
                                "listing.importDutyRegistered",
                                "This vehicle is already registered in Sri Lanka, so import duty doesn't apply to buying it. Curious what importing the same spec fresh would cost under today's gazette?",
                              )}
                            </p>
                          </div>
                          <Link
                            to={`/calculator?tab=landed-cost&fuel=${importFuelType}${typeof listing.engine_cc === 'number' ? `&cc=${listing.engine_cc}` : ''}`}
                            className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-fit no-underline")}
                          >
                            {t("listing.modelFreshImport", "Model a fresh import")} <ArrowRight aria-hidden />
                          </Link>
                        </div>
                      )}
                    </div>
                  </motion.div>
                  </DeferredSection>
                );
              })())}

              {/* 8. Details */}
              <DeferredSection minHeight={150}>
              <motion.div {...onScroll} className={cn(cardVariants({ padding: "md" }), "cv-section")}>
                <h2 className="mb-3 text-caption font-semibold text-muted-foreground">{t("listing.description", "Description")}</h2>
                <p className="whitespace-pre-wrap text-footnote font-medium leading-[1.8] text-muted-foreground">
                  {listing.description || t("listing.noDescription", "The seller didn't add a description. Open the original ad for full details.")}
                </p>
              </motion.div>
              </DeferredSection>

              {/* Seller — info only; the one contact CTA lives in the price card / sticky bar */}
              <DeferredSection minHeight={150}>
              <motion.section {...onScroll} aria-labelledby="seller-title" className={cn(cardVariants({ padding: "md" }), "cv-section")}>
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheck aria-hidden className="h-4 w-4 text-primary" />
                  <h2 id="seller-title" className="text-caption font-semibold text-muted-foreground">{t("listing.sellerInfo", "Seller information")}</h2>
                </div>
                <p className="text-body font-bold leading-tight text-foreground">{sellerHeadline}</p>
                {sellerName && <p className="mt-1 truncate text-caption font-medium text-muted-foreground">{sellerName}</p>}
                <p className="mt-2 text-caption leading-relaxed text-muted-foreground">
                  {t("listing.sellerContactNote", "Contact the seller through {source}. Motormila doesn't share seller phone numbers.", { source: attribution.sourceName })}
                </p>
              </motion.section>
              </DeferredSection>

              <DeferredSection minHeight={150}>
              <motion.div {...onScroll} className="cv-section">
                <ListingLeadActions
                  listingId={listing.id ?? undefined}
                  vehicle={[listing.year, displayMake, displayModel].filter(Boolean).join(' ')}
                  priceLkr={hasPrice ? listingPrice : undefined}
                  district={listing.district ?? undefined}
                />
              </motion.div>
              </DeferredSection>

              <DeferredSection minHeight={300}>
              <div className="grid gap-5 md:grid-cols-2">
                {listing.make && (
                  <motion.div {...onScroll} className="cv-section">
                    <SafetyResearchCard research={safetyResearch} vin={listingVin(listing)} />
                  </motion.div>
                )}
                <motion.div {...onScroll} className="cv-section">
                  <ListingGeoCard geo={listingGeo} />
                </motion.div>
              </div>
              </DeferredSection>
              {listing.make && (
                <DeferredSection minHeight={200}>
                <motion.div {...onScroll} className="cv-section">
                  <NhtsaModelsCard make={listing.make} model={listing.model ?? undefined} compact vin={listingVin(listing)} />
                </motion.div>
                </DeferredSection>
              )}
              {trackedDays && (
                <p className="text-caption leading-relaxed text-muted-foreground">
                  {trackedDays === 1
                    ? t("listing.insightLineOne", "Tracked for 1 day.")
                    : t("listing.insightLine", "Tracked for {days} days.", { days: trackedDays })}
                  {avgPeerDays ? ` ${t("listing.insightPeers", "Similar ads average {days} days.", { days: avgPeerDays })}` : ''}
                </p>
              )}

              {/* 9. Similar */}
              <DeferredSection lazy minHeight={300}>
                <motion.div {...onScroll} className="cv-section">
                  <SimilarCarsStrip
                    listings={visibleSimilar}
                    fullAccess={fullAccess}
                    title={t("listing.similarTitle", "Similar vehicles")}
                  />
                </motion.div>
              </DeferredSection>
              </>
            ) : (
              <div aria-hidden className="min-h-[1200px]" />
            )}
          </div>

          {/* ── SIDEBAR (desktop) ─────────────────────────────── */}
          {isDesktop && (
          <aside className="hidden flex-col gap-5 lg:sticky lg:top-20 lg:flex">
            <motion.div variants={revealItem}>{renderPriceBlock('desktop')}</motion.div>
            {rest && <DeferredSection first minHeight={280}><motion.div variants={revealItem}>{renderFmvCard()}</motion.div></DeferredSection>}
            {rest && renderProUpsell() && <DeferredSection first><motion.div variants={revealItem}>{renderProUpsell()}</motion.div></DeferredSection>}
            {importFuelType === 'electric' && (
              <Link
                to="/ev-hub"
                className={cn(buttonVariants({ variant: "secondary", size: "md" }), "w-full no-underline")}
              >
                <PlugZap aria-hidden className="h-3.5 w-3.5" /> {t("listing.chargersNearby", "Charging stations")}
              </Link>
            )}
          </aside>
          )}
        </div>
      </div>

      <ListingStickyBar
        priceLkr={hasPrice ? listingPrice : null}
        badge={deal}
        href={listingUrl}
        sourceName={attribution.sourceName}
        listingId={listing.id}
        source={listing.source}
      />
    </motion.div>
  );
}
