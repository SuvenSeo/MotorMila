import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, MapPin, Calendar,
  Share2, Fuel, Gauge, Settings2, MessageCircle,
  Car as CarIcon, ArrowRight, Zap, Sparkles, ShieldCheck, Clock, Database, AlertTriangle, PlugZap, Scale,
  TrendingDown, Layers
} from 'lucide-react';
import { getListing, getListingFmv, getListingGeo, getListingHistoryReport, getListingPriceHistory, getListingSafetyResearch, getSimilarListings, formatPrice } from '@/services/api';
import { TrustCheckPanel } from '@/components/TrustCheckPanel';
import { SnapshotModeNotice } from '@/components/SnapshotModeNotice';
import { getSourceAttribution } from '@/lib/sourceAttribution';
import { parseFlexibleTime } from '@/lib/parseTime';
import type { TrustRelatedListing } from '@/lib/trustSignals';
import type { EnrichmentEnvelope, ListingFmvDetail, SafetyResearchResponse } from '@/services/api';
import type { CarListing, PriceHistoryInfo, SellerTrustProfile } from '@/types/car';
import { summarizeFmv } from '@/lib/fmv';
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
import { LeaseCalculator } from '@/components/LeaseCalculator';
import { TaxBreakdown } from '@/components/TaxBreakdown';
import { CashToOwnStrip } from '@/components/CashToOwnStrip';
import { HybridCliffBadge } from '@/components/HybridCliffBadge';
import { MileageTrustChip } from '@/components/MileageTrustChip';
import { SellSpeedChip } from '@/components/SellSpeedChip';
import { AdvertHealthChip } from '@/components/AdvertHealthChip';
import { ListingHistoryReport } from '@/components/ListingHistoryReport';
import { ListingPriceTimeline } from '@/components/ListingPriceTimeline';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import { inferFinanceClass } from '@/lib/cashToOwn';
import { useAppPreferences } from '@/lib/appPreferences';
import { useAuth } from '@/lib/authContext';
import {
  FREE_SIMILAR_LIMIT,
  freePlanCopy,
  hasFullPlatformAccess,
} from '@/lib/planLimits';
import type { ImportFuelType } from '@/lib/importTaxModel';
import { motion } from 'motion/react';
import { fadeIn, fadeUp, revealContainer, revealItem, useReducedMotionOrLowData } from '@/lib/motion';
import { SaveHeartIcon } from '@/components/listing/SaveHeart';
import { trackEvent } from '@/lib/analytics';
import { canonicalizeMake, canonicalizeModel } from '@/lib/makeNormalization';
import { ListingLeadActions } from '@/components/money/ListingLeadActions';
import { formatLkrFull } from '@/lib/price';
import { computeDealBadge, DEAL_TEXT_CLASSES } from '@/lib/dealBadge';
import { detectListingLeaseTakeover } from '@/lib/leaseTakeover';
import { estimateListingMonthly, formatMonthlyLkr } from '@/lib/listingFinance';
import { DealBadge, type DealWhyData } from '@/components/listing/DealBadge';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, cardVariants } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { cn } from '@/lib/utils';
import { BeforeYouPayStrip } from '@/components/listing/BeforeYouPayStrip';
import { ListingStickyBar } from '@/components/listing/ListingStickyBar';
import { SimilarCarsStrip } from '@/components/listing/SimilarCarsStrip';
import { AnimatedPrice } from '@/components/listing/AnimatedPrice';

function formatToken(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  return value.replace(/[_-]/g, ' ').split(' ').filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const motionCalm = useReducedMotionOrLowData();
  // Below-the-fold sections reveal once as they scroll in (opacity only when calm).
  const onScroll = {
    initial: 'hidden',
    whileInView: 'show',
    viewport: { once: true, margin: '0px 0px -8% 0px' },
    variants: motionCalm ? fadeIn : fadeUp,
  } as const;
  const { t } = useAppPreferences();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  const [listing, setListing] = useState<CarListing | null>(null);
  const [similar, setSimilar] = useState<CarListing[]>([]);
  const [sellerProfile, setSellerProfile] = useState<SellerTrustProfile | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryInfo | null>(null);
  const [fmvDetail, setFmvDetail] = useState<ListingFmvDetail | null>(null);
  const [safetyResearch, setSafetyResearch] = useState<SafetyResearchResponse | null>(null);
  const [listingGeo, setListingGeo] = useState<EnrichmentEnvelope | null>(null);
  /** Cross-site linked listings; null = history service unavailable. */
  const [relatedListings, setRelatedListings] = useState<TrustRelatedListing[] | null>(null);
  const [loading, setLoading] = useState(true);
  const { toggle: toggleCompare, isPinned: isPinnedForCompare } = useCompareTray();
  const [watchlisted, setWatchlisted] = useState(false);

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
    if (window.history.length > 1) navigate(-1);
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
    const median = Number(listing.market_median_lkr);
    const result = toggleCompare({
      id: Number(listing.id),
      make: listing.make,
      model: listing.model,
      year: listing.year,
      price_lkr: priced ? price : null,
      fmv_lkr: fmvDetail?.fmv_lkr ?? (Number.isFinite(median) && median > 0 ? median : null),
      mileage_km: Number(listing.mileage_km) || null,
      district: listing.district,
      deal_score: typeof listing.deal_score === 'number' ? listing.deal_score : null,
    });
    if (result.atCap) toast.error(t("listing.compareFull", "Compare tray is full (max 4) — remove one first"));
    else if (result.pinned) toast.success(t("listing.compareAdded", "Pinned to compare tray"));
  };

  useEffect(() => {
    if (!id) return;
    window.scrollTo(0, 0); // peer links navigate mid-scroll; open each listing at the top
    let cancelled = false;
    setLoading(true); setSellerProfile(null); setPriceHistory(null); setFmvDetail(null); setSafetyResearch(null); setListingGeo(null); setRelatedListings(null);
    Promise.all([
      getListing(id).catch(() => null),
      getSimilarListings(id).catch(() => []),
      // seller-profile is retired (410): seller contact happens on the source site.
      Promise.resolve(null as SellerTrustProfile | null),
      getListingPriceHistory(id).catch(() => null),
      getListingFmv(id).catch(() => null),
    ])
      .then(([detail, sim, profile, history, fmv]) => {
        // Ignore a slow response for a listing the user already navigated away from.
        if (cancelled) return;
        setListing(detail); setSimilar(sim); setSellerProfile(profile); setPriceHistory(history); setFmvDetail(fmv); setLoading(false);
        setWatchlisted(detail ? loadWatchlistIds().includes(Number(detail.id)) : false);
        if (detail) {
          document.title = `${detail.title} — Motormila`;
          trackEvent("listing_viewed", { listing_id: detail.id, make: detail.make, model: detail.model, source: detail.source });
        }
      });
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
  const hasPrice = Number.isFinite(listingPrice) && listingPrice >= 100_000 && listingPrice <= 500_000_000;
  // Map the listing's fuel label onto the import-tax model's fuel classes.
  const fuelRaw = String(listing.fuel_type || '').toLowerCase();
  const importFuelType: ImportFuelType =
    fuelRaw.includes('hybrid') || fuelRaw.includes('phev') ? 'hybrid'
    : fuelRaw.includes('electric') || fuelRaw === 'ev' ? 'electric'
    : fuelRaw.includes('diesel') ? 'diesel'
    : 'petrol';

  const lease = detectListingLeaseTakeover(listing);
  const median = Number(listing.market_median_lkr);
  const hasMedian = Number.isFinite(median) && median > 0;
  const fmvLkr = fmvDetail?.fmv_lkr && fmvDetail.fmv_lkr > 0 ? fmvDetail.fmv_lkr : hasMedian ? median : null;
  // null deal_score = rating suppressed server-side (thin cohort / old vehicle / extreme price / free plan)
  const ratingAllowed = fullAccess && listing.deal_score !== null && listing.deal_score !== undefined;
  const deal = computeDealBadge({
    askingLkr: hasPrice ? listingPrice : null,
    fmvLkr,
    confidence: fmvDetail?.confidence ?? null,
    compsCount: fmvDetail ? fmvDetail.sample_size : null,
    isLeaseTakeover: lease.isLeaseTakeover,
    ratingAllowed,
  });
  const dealWhy: DealWhyData = {
    fmvLkr,
    askingLkr: hasPrice ? listingPrice : null,
    compsCount: fmvDetail ? fmvDetail.sample_size : null,
    confidence: fmvDetail?.confidence ?? null,
    method: fmvDetail?.method ?? null,
  };
  const fmvSummary = hasPrice && fmvLkr && !lease.isLeaseTakeover ? summarizeFmv(listingPrice, fmvLkr) : null;
  const fmvKind = deal.kind === 'verify' ? 'verify' : fmvSummary?.band === 'below' ? 'below' : fmvSummary?.band === 'above' ? 'above' : 'fair';
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

  const knownToken = (v: string | null | undefined) => {
    const s = formatToken(v);
    return s === 'Unknown' || /^(n\/?a|none|other)$/i.test(s) ? null : s;
  };
  const engineCc = plausibleEngineCc(listing.engine_cc, listing.year);
  const keySpecs = [
    { label: t("common.year", "Year"), value: listing.year ? String(listing.year) : null, icon: Calendar },
    { label: t("common.mileage", "Mileage"), value: Number.isFinite(Number(listing.mileage_km)) && Number(listing.mileage_km) > 0 ? `${Number(listing.mileage_km).toLocaleString()} km` : null, icon: Gauge },
    { label: t("common.fuel", "Fuel"), value: knownToken(listing.fuel_type), icon: Fuel },
    { label: t("common.transmission", "Transmission"), value: knownToken(listing.transmission), icon: Settings2 },
    { label: t("listing.engine", "Engine"), value: engineCc ? `${Math.round(engineCc).toLocaleString()} cc` : null, icon: Zap },
    { label: t("common.condition", "Condition"), value: knownToken(listing.condition), icon: Sparkles },
    { label: t("common.body", "Body"), value: knownToken(listing.body_type), icon: CarIcon },
  ].filter((s): s is { label: string; value: string; icon: typeof Calendar } => Boolean(s.value));

  const priceCut = priceHistory && priceHistory.cut_count > 0 ? priceHistory : null;

  // ── Blocks (some render in both the mobile flow and the desktop sidebar) ──
  const renderPriceBlock = (placement: 'mobile' | 'desktop') => (
    <div className={placement === 'desktop' ? cn(cardVariants({ padding: "md" }), "shadow-e2") : ''}>
      <h2 className="text-caption font-semibold text-muted-foreground">{t("listing.askingPrice", "Asking price")}</h2>
      <p className={`num mt-1 font-display font-semibold leading-[1.05] tracking-tight text-foreground ${placement === 'desktop' ? 'text-large' : 'text-title1'}`}>
        {hasPrice ? <AnimatedPrice priceLkr={listingPrice} /> : t("listing.unlisted", "Unlisted")}
      </p>
      {deal.kind !== 'none' && (
        <DealBadge badge={deal} tone="soft" size="md" why={deal.kind === 'lease' ? null : dealWhy} className="mt-3 flex-wrap" />
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
          <p className="num mt-1 text-title2 font-extrabold tracking-tight text-foreground">{formatLkrFull(fmvSummary.fmv_lkr)}</p>
          <p className={`mt-0.5 text-footnote font-bold ${DEAL_TEXT_CLASSES[fmvKind]}`}>{fmvSummary.label}</p>
          {fmvDetail && fmvDetail.method !== "insufficient_data" && (
            <p className="mt-1 text-caption text-muted-foreground">
              {fmvDetail.sample_size > 0 ? t("listing.compsLine", "{n} comparable listings", { n: fmvDetail.sample_size }) : ""}
              {fmvDetail.confidence !== "none" ? ` · ${t("listing.confidenceLine", "{level} confidence", { level: fmvDetail.confidence })}` : ""}
            </p>
          )}
          {hasPrice && (
            <div className="mt-3">
              <DealLadder askingPrice={listingPrice} marketMedianLkr={fmvSummary.fmv_lkr} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
            <FmvExplainer
              compsCount={fmvDetail?.sample_size ?? 0}
              confidence={fmvDetail?.confidence ?? "none"}
              method={fmvDetail?.method}
              fmvLkr={fmvSummary.fmv_lkr}
              updatedAt={fmvDetail?.updated_at}
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
      ) : (
        <p className="mt-2 text-caption text-muted-foreground">
          {t("listing.noFmv", "Not enough comparable listings for a confident typical price on this vehicle.")}
        </p>
      )}
    </section>
  );

  // Pro upsell sits *below* the FMV card, never between price and valuation.
  const renderProUpsell = () =>
    !fullAccess && !lease.isLeaseTakeover ? (
      <UpgradePrompt title={freePlanCopy.scoresTitle} body={freePlanCopy.scoresBody} variant="strip" />
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
      {/* Header — back + quiet actions, then one clear title */}
      <motion.section variants={revealItem} className="relative z-10 -mt-[var(--nav-offset)] border-b border-border bg-card/30 pt-[var(--nav-offset)]">
        <div className="mx-auto max-w-[1320px] px-5 py-6 sm:px-6 sm:py-8">
          <div className="mb-4 flex items-center justify-between gap-3">
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

          <p className="mb-2 text-caption font-medium tracking-tight text-muted-foreground">
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
                  This ad has not been seen at {listing.source}
                  {parseFlexibleTime(listing.last_seen_at) !== null ? ` since ${new Date(parseFlexibleTime(listing.last_seen_at)!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo' })}` : ' recently'}.
                  Pricing below is kept for market reference and may be historical.
                </p>
              </div>
            </div>
          )}

          <h1 className="display-2 max-w-4xl text-foreground">
            {displayName}{listing.year ? ` · ${listing.year}` : ''}
          </h1>
          {listing.title && listing.title !== displayName && (
            <p className="mt-2 max-w-2xl text-body font-medium leading-relaxed text-muted-foreground">{listing.title}</p>
          )}
        </div>
      </motion.section>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-[1320px] px-5 py-6 sm:px-6 lg:py-10">
        <div className="grid gap-6 lg:grid-cols-[1.75fr_1fr] lg:items-start lg:gap-8">

          {/* ── MAIN ──────────────────────────────────────────── */}
          <div className="min-w-0 space-y-6">

            {/* 1. Gallery — the car is the hero; overlays stay dark (they sit on the photo) */}
            <motion.div variants={revealItem} data-listing-gallery className={cn(cardVariants({ variant: "media" }), "rounded-sheet")}>
              <div className="group relative aspect-[16/10] min-h-[220px] overflow-hidden bg-black/40">
                <ListingImageCarousel
                  images={galleryImages}
                  listingId={listing.id}
                  alt={displayName}
                  variant="detail"
                  source={listing.source}
                  priority
                  className="h-full w-full"
                  imageClassName="transition-transform duration-long ease-decelerate group-hover:scale-[1.02] motion-reduce:transform-none"
                />
                <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
                {/* Source credit for hotlinked photos. Fixed bright blue: sits on a black scrim. */}
                <span className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full border border-border bg-black/60 px-2.5 py-1 text-caption font-semibold text-[#6CB8FF]">
                  <Database aria-hidden className="h-3 w-3" /> {t("listingImage.credit", "Photo: {source}", { source: attribution.sourceName })}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border bg-card px-4 py-3">
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
            </motion.div>

            {/* 2. Price + badge (mobile flow; desktop shows it in the sidebar) */}
            <motion.div variants={revealItem} className="space-y-3 lg:hidden">
              {renderPriceBlock('mobile')}
              <BeforeYouPayStrip collapsible idSuffix="mobile" />
            </motion.div>

            {/* 3. Key specs — only what we actually know */}
            {keySpecs.length > 0 && (
              <motion.section {...onScroll} aria-labelledby="key-specs-title" className="space-y-3">
                <h2 id="key-specs-title" className="text-caption font-semibold text-muted-foreground">{t("listing.keySpecs", "Key specs")}</h2>
                <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {keySpecs.map((s) => (
                    <Card key={s.label} padding="none" className="flex items-center gap-3 px-3.5 py-3">
                      <s.icon aria-hidden className="h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <dt className="text-caption font-medium text-muted-foreground">{s.label}</dt>
                        <dd className="num truncate text-footnote font-semibold leading-tight text-foreground">{s.value}</dd>
                      </div>
                    </Card>
                  ))}
                </dl>
                <MileageTrustChip mileageKm={listing.mileage_km} year={listing.year} />
              </motion.section>
            )}

            {/* 4. FMV / why (mobile flow) + Pro upsell below it */}
            <motion.div {...onScroll} className="space-y-3 lg:hidden">
              {renderFmvCard()}
              {renderProUpsell()}
            </motion.div>

            {/* 5. Price history */}
            {priceHistory && priceHistory.points.length > 0 && (
              <motion.div {...onScroll}>
                <ListingPriceTimeline
                  history={priceHistory}
                  marketMedianLkr={listing.market_median_lkr}
                  listingTitle={displayName}
                />
              </motion.div>
            )}

            {/* 6. Trust Check */}
            <motion.div {...onScroll}>
              <TrustCheckPanel
                listing={listing}
                pricePoints={priceHistory?.points ?? null}
                related={relatedListings}
              />
            </motion.div>
            {listing.id != null && <ListingHistoryReport listingId={listing.id} />}

            {/* 7. Finance planner */}
            {hasPrice && (lease.isLeaseTakeover ? (
              <motion.section {...onScroll} className={cardVariants({ padding: "md" })}>
                <h2 className="text-caption font-semibold text-muted-foreground">{t("listing.ownershipPlanning", "Ownership planning")}</h2>
                <p className="mt-2 text-footnote leading-relaxed text-muted-foreground">
                  {t("listing.leaseNoFinance", "Finance estimates are hidden: the price on a lease takeover isn't the full price. Ask the seller for the settlement letter from the finance company first.")}
                </p>
              </motion.section>
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
                <motion.div {...onScroll} className="space-y-4">
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
                      <div className="page-panel flex flex-col justify-between gap-3 rounded-[1.75rem] p-6">
                        <div>
                          <h2 className="field-label text-foreground">{t("listing.importDutyTax", "Import duty and tax")}</h2>
                          <p className="mt-2 text-caption leading-relaxed text-muted-foreground">
                            This vehicle is already registered in Sri Lanka, so import duty doesn't
                            apply to buying it. Curious what importing the same spec fresh would cost
                            under today's gazette?
                          </p>
                        </div>
                        <Link
                          to={`/calculator?tab=landed-cost&fuel=${importFuelType}${typeof listing.engine_cc === 'number' ? `&cc=${listing.engine_cc}` : ''}`}
                          className="inline-flex w-fit items-center gap-1.5 rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2 text-caption font-semibold text-primary-bright no-underline transition-ui hover:bg-primary/15"
                        >
                          Model a fresh import <ArrowRight aria-hidden className="h-3 w-3" />
                        </Link>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })())}

            {/* 8. Details */}
            <motion.div {...onScroll} className={cardVariants({ padding: "md" })}>
              <h2 className="mb-3 text-caption font-semibold text-muted-foreground">{t("listing.description", "Description")}</h2>
              <p className="whitespace-pre-wrap text-footnote font-medium leading-[1.8] text-muted-foreground">
                {listing.description || t("listing.noDescription", "The seller didn't add a description. Open the original ad for full details.")}
              </p>
            </motion.div>

            {/* Seller — info only; the one contact CTA lives in the price card / sticky bar */}
            <motion.section {...onScroll} aria-labelledby="seller-title" className={cardVariants({ padding: "md" })}>
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

            <motion.div {...onScroll}>
              <ListingLeadActions
                listingId={listing.id ?? undefined}
                vehicle={[listing.year, displayMake, displayModel].filter(Boolean).join(' ')}
                priceLkr={hasPrice ? listingPrice : undefined}
                district={listing.district ?? undefined}
              />
            </motion.div>

            <div className="grid gap-5 md:grid-cols-2">
              {listing.make && (
                <motion.div {...onScroll}>
                  <SafetyResearchCard research={safetyResearch} vin={listingVin(listing)} />
                </motion.div>
              )}
              <motion.div {...onScroll}>
                <ListingGeoCard geo={listingGeo} />
              </motion.div>
            </div>
            {listing.make && (
              <motion.div {...onScroll}>
                <NhtsaModelsCard make={listing.make} model={listing.model ?? undefined} compact vin={listingVin(listing)} />
              </motion.div>
            )}
            {trackedDays && (
              <p className="text-caption leading-relaxed text-muted-foreground">
                {t("listing.insightLine", "Tracked for {days} days.", { days: trackedDays })}
                {avgPeerDays ? ` ${t("listing.insightPeers", "Similar ads average {days} days.", { days: avgPeerDays })}` : ''}
              </p>
            )}

            {/* 9. Similar */}
            <motion.div {...onScroll}>
              <SimilarCarsStrip
                listings={visibleSimilar}
                fullAccess={fullAccess}
                title={t("listing.similarTitle", "Similar vehicles")}
              />
            </motion.div>
          </div>

          {/* ── SIDEBAR (desktop) ─────────────────────────────── */}
          <aside className="hidden space-y-5 lg:sticky lg:top-20 lg:block">
            <motion.div variants={revealItem}>{renderPriceBlock('desktop')}</motion.div>
            <motion.div variants={revealItem}>{renderFmvCard()}</motion.div>
            {renderProUpsell() && <motion.div variants={revealItem}>{renderProUpsell()}</motion.div>}
            {importFuelType === 'electric' && (
              <Link
                to="/ev-hub"
                className={cn(buttonVariants({ variant: "secondary", size: "md" }), "w-full no-underline")}
              >
                <PlugZap aria-hidden className="h-3.5 w-3.5" /> {t("listing.chargersNearby", "Charging stations")}
              </Link>
            )}
          </aside>
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
