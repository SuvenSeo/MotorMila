import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, MapPin, Calendar,
  Share2, Fuel, Gauge, Settings2, MessageCircle,
  Car as CarIcon, ArrowRight, Zap, Sparkles, ShieldCheck, Clock, Database, AlertTriangle, PlugZap, Scale,
  Heart
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
import { ListingGeoCard } from '@/components/ListingGeoCard';
import { FairPriceIndicator } from '@/components/FairPriceIndicator';
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
import { motion } from 'framer-motion';
import { revealContainer, revealItem, springSnappy } from '@/lib/motion';
import { AtmosphericImage } from '@/components/AtmosphericImage';
import { visuals } from '@/lib/visualAssets';
import { trackEvent } from '@/lib/analytics';
import { canonicalizeMake, canonicalizeModel } from '@/lib/makeNormalization';
import { ListingLeadActions } from '@/components/money/ListingLeadActions';

function formatToken(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  return value.replace(/[_-]/g, ' ').split(' ').filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
    if (result.atCap) toast.error(t("listing.compareFull", "Compare tray is full (max 3) — remove one first"));
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
          <p className="text-[12px] font-medium text-muted-foreground">{t("listing.unavailable", "Unavailable")}</p>
          <h1 className="mt-2 font-display text-xl font-semibold text-foreground">{t("listing.notFound", "Listing not found")}</h1>
          <p className="mt-2 max-w-sm text-[12px] text-muted-foreground">{t("listing.notFoundBody", "The source may have removed it or the ID is no longer in the live index.")}</p>
          <button type="button" onClick={() => navigate('/')} className="mt-5 rounded-full bg-primary px-5 py-2.5 text-[12px] font-semibold text-primary-foreground shadow-soft transition-all hover:bg-primary/95 hover:shadow-soft-lg active:scale-[0.97]">{t("listing.returnInventory", "Return to inventory")}</button>
        </div>
      </div>
    );
  }

  // ── Derived data ───────────────────────────────────────────
  const attribution = getSourceAttribution(listing);
  const listingUrl = attribution.href;
  // Full gallery for the carousel (primary photo first).
  const galleryImages = getListingImageList(listing);
  const specs = [
    { label: t("common.year", "Year"), value: listing.year ? String(listing.year) : t("common.unknown", "Unknown"), icon: Calendar },
    { label: t("common.mileage", "Mileage"), value: Number.isFinite(Number(listing.mileage_km)) && Number(listing.mileage_km) >= 0 ? `${Number(listing.mileage_km).toLocaleString()} KM` : t("common.unknown", "Unknown"), icon: Gauge },
    { label: t("common.transmission", "Transmission"), value: formatToken(listing.transmission), icon: Settings2 },
    { label: t("common.fuel", "Fuel"), value: formatToken(listing.fuel_type), icon: Fuel },
    { label: t("common.condition", "Condition"), value: formatToken(listing.condition), icon: Sparkles },
    { label: t("common.body", "Body"), value: formatToken(listing.body_type), icon: CarIcon },
  ];
  const listingPrice = Number(listing.price_lkr || 0);
  const hasPrice = Number.isFinite(listingPrice) && listingPrice >= 100_000 && listingPrice <= 500_000_000;
  // Map the listing's fuel label onto the import-tax model's fuel classes.
  const fuelRaw = String(listing.fuel_type || '').toLowerCase();
  const importFuelType: ImportFuelType =
    fuelRaw.includes('hybrid') || fuelRaw.includes('phev') ? 'hybrid'
    : fuelRaw.includes('electric') || fuelRaw === 'ev' ? 'electric'
    : fuelRaw.includes('diesel') ? 'diesel'
    : 'petrol';

  // null = rating suppressed server-side (thin cohort / old vehicle / extreme price / free plan)
  const hasDealScore = fullAccess && listing.deal_score !== null && listing.deal_score !== undefined;
  const dealScore = listing.deal_score || 0;
  const visibleSimilar = fullAccess ? similar : similar.slice(0, FREE_SIMILAR_LIMIT);
  const fmvSummary =
    hasPrice && Number.isFinite(Number(listing.market_median_lkr)) && Number(listing.market_median_lkr) > 0
      ? summarizeFmv(listingPrice, Number(listing.market_median_lkr))
      : null;
  const dealTone = dealScore >= 5
    ? 'text-emerald-600 dark:text-emerald-400'
    : dealScore <= -6
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-primary-bright';
  const dealDelta = dealScore ? `${Math.abs(dealScore)}% ${dealScore > 0 ? 'below' : 'above'} median` : 'at median';
  const sellerName = sellerProfile?.seller_name || listing.seller_name || `${listing.source} seller`;
  const sellerType = sellerProfile?.seller_type || (listing.is_dealer ? 'dealer' : 'unknown');
  const sellerHeadline = sellerType === 'dealer' ? t("listing.dealer", "Dealer") : sellerType === 'private' ? t("listing.privateSeller", "Private Seller") : t("listing.sourceSeller", "Source Seller");
  const trustBadges = (sellerProfile?.verified_badges || []).slice(0, 2);
  const ratingValue = sellerProfile?.rating;
  const reviewCount = sellerProfile?.review_count;
  const ratingStars = ratingValue ? Math.round(Math.max(1, Math.min(5, ratingValue))) : 0;
  const trustMeta = [sellerProfile?.member_since ? `Since ${sellerProfile.member_since}` : null, sellerProfile?.listing_count != null ? `${sellerProfile.listing_count} listings` : null].filter(Boolean).join(' · ') || 'No extended seller history available.';
  const trackedDays = (() => { const ts = parseFlexibleTime(listing.first_seen_at); return ts !== null ? Math.max(1, Math.round((Date.now() - ts) / 86_400_000)) : null; })();
  const trackedLabel = trackedDays ? `${trackedDays}d` : 'N/A';
  const listedDateTime = formatListedDateTime(listing.first_seen_at);
  const peerAges = visibleSimilar.map((s) => { const ts = parseFlexibleTime(s.first_seen_at); return ts !== null ? Math.max(1, Math.round((Date.now() - ts) / 86_400_000)) : null; }).filter((v): v is number => v !== null);
  const avgPeerDays = peerAges.length ? Math.round(peerAges.reduce((a, b) => a + b, 0) / peerAges.length) : null;

  // ── Render ─────────────────────────────────────────────────
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={revealContainer}
      className="min-h-screen relative overflow-hidden bg-background"
    >

      {/* Header — the editorial hero: eyebrow, towering title, ask + verdict */}
      <motion.section variants={revealItem} className="relative z-10 -mt-[var(--nav-offset)] border-b border-border bg-card/30 pt-[var(--nav-offset)] backdrop-blur-md">
        <div className="mx-auto max-w-[1320px] px-5 py-8 sm:px-6 sm:py-10">
          <button type="button" onClick={handleBack} className="group mb-5 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft aria-hidden className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> {t("common.back", "Back")}
          </button>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="section-eyebrow text-[10px] tracking-[0.18em]">{t("shell.copy.listingEyebrow", "For sale")}</span>
            <span aria-hidden className="text-muted-foreground/40 text-xs">•</span>
            <span className="text-[12px] font-medium tracking-tight text-muted-foreground">
              {t("listing.listedOnSource", "Listed on {source}", { source: attribution.sourceName })}
              {attribution.checkedAgo ? ` · ${t("listing.lastChecked", "last checked {ago}", { ago: attribution.checkedAgo })}` : ''}
            </span>
          </div>
          <SnapshotModeNotice className="mb-4 max-w-2xl" />

          {listing.is_active === false && (
            <div className="mb-5 flex items-start gap-2.5 rounded-3xl border border-amber-500/25 bg-amber-400/[0.06] p-3.5 max-w-2xl">
              <AlertTriangle aria-hidden className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-700 dark:text-amber-300">{t("listing.possiblySold", "Possibly sold or delisted")}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground font-medium">
                  This ad has not been seen at {listing.source}
                  {parseFlexibleTime(listing.last_seen_at) !== null ? ` since ${new Date(parseFlexibleTime(listing.last_seen_at)!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo' })}` : ' recently'}.
                  Pricing below is kept for market reference and may be historical.
                </p>
              </div>
            </div>
          )}

          <h1 className="display-1 max-w-4xl text-foreground">
            {canonicalizeMake(listing.make) || listing.make} {canonicalizeModel(listing.model) || listing.model}{listing.year ? ` · ${listing.year}` : ''}
          </h1>

          {/* Mobile: the sticky price sidebar stacks ~4 screens down — surface ask + verdict here */}
          <div className="mt-4 flex flex-wrap items-center gap-3 lg:hidden">
            <p className="num text-3xl font-extrabold tracking-tight text-foreground">
              {hasPrice ? formatPrice(listingPrice) : t("listing.unlisted", "Unlisted")}
            </p>
            {hasDealScore && (
              <span className="flex items-center gap-2">
                <FairPriceIndicator score={dealScore} condition={listing.condition} size="sm" />
                <span className={`num text-[11px] font-bold ${dealTone}`}>{dealDelta}</span>
              </span>
            )}
          </div>

          {listing.title && listing.title !== `${canonicalizeMake(listing.make) || listing.make} ${canonicalizeModel(listing.model) || listing.model}` && (
            <p className="mt-3 max-w-2xl text-[14px] text-muted-foreground leading-relaxed font-medium">{listing.title}</p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            {listingUrl && (
              <a href={listingUrl} target="_blank" rel="noopener noreferrer" className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground no-underline shadow-soft transition-all hover:bg-primary/95 hover:shadow-soft-lg active:scale-[0.97]">
                {t("listing.viewOnSource", "View on {source}", { source: attribution.sourceName })} <ExternalLink aria-hidden className="h-3 w-3" />
              </a>
            )}
            <button type="button" onClick={handleWhatsAppShare} className="flex h-9 items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3.5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400 transition-all hover:bg-emerald-500/15 active:scale-[0.97]">
              <MessageCircle aria-hidden className="h-3 w-3" /> {t("listing.shareWhatsApp", "Share on WhatsApp")}
            </button>
            <button type="button" onClick={handleShare} className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[12px] font-semibold text-muted-foreground transition-all hover:text-foreground hover:bg-surface active:scale-[0.97]">
              <Share2 aria-hidden className="h-3 w-3" /> {t("listing.share", "Share")}
            </button>
            <button
              type="button"
              onClick={handleWatchlistToggle}
              aria-pressed={watchlisted}
              className={`flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-semibold transition-all active:scale-[0.97] ${watchlisted ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/15" : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-surface"}`}
            >
              <Heart aria-hidden className={`h-3 w-3 ${watchlisted ? "fill-current" : ""}`} /> {watchlisted ? t("listing.saved", "Saved ✓") : t("listing.save", "Save")}
            </button>
            {importFuelType === 'electric' && (
              <Link
                to="/ev-hub"
                className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[12px] font-semibold text-muted-foreground no-underline transition-all hover:text-foreground hover:bg-surface active:scale-[0.97]"
              >
                <PlugZap aria-hidden className="h-3 w-3" /> {t("listing.chargersNearby", "Charging stations")}
              </Link>
            )}
          </div>
        </div>
      </motion.section>

      {/* Content */}
      <div className="mx-auto max-w-[1320px] px-5 py-8 sm:px-6 lg:py-12 relative z-10">
        <div className="grid gap-6 lg:grid-cols-[1.75fr_1fr] lg:items-start lg:gap-8">

          {/* ── MAIN ──────────────────────────────────────────── */}
          <div className="space-y-6">

            {/* Image — the car is the hero; overlays stay dark (they sit on the photo) */}
            <motion.div variants={revealItem} className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-soft">
              <div className="relative aspect-[16/10] min-h-[220px] overflow-hidden bg-black/40 group">
                {galleryImages.length > 0 ? (
                  <ListingImageCarousel
                    images={galleryImages}
                    listingId={listing.id}
                    alt={`${canonicalizeMake(listing.make) || listing.make} ${canonicalizeModel(listing.model) || listing.model}`}
                    variant="detail"
                    className="h-full w-full"
                    imageClassName="transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center"><CarIcon aria-hidden className="h-12 w-12 text-white/50" /></div>
                )}
                <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-10">
                  <span className="rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">{listing.make} {listing.model} · {listing.year || 'N/A'}</span>
                  {/* Fixed bright blue: this badge sits on a black photo scrim, where the
                      light-theme `--primary-bright` token is unreadable. */}
                  <span className="flex items-center gap-1 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-[#6CB8FF] backdrop-blur-md"><Database aria-hidden className="h-3 w-3" /> {attribution.sourceName}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 border-t border-border px-4 py-3 bg-card">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><MapPin aria-hidden className="h-3.5 w-3.5 text-primary-bright" /> {listing.district || t("common.unknown", "Unknown")}, Sri Lanka</span>
                <span aria-hidden className="text-muted-foreground/30 text-xs">•</span>
                <span className="num flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground"><Clock aria-hidden className="h-3.5 w-3.5 text-primary-bright" /> {t("listing.tracked", "Tracked {days}", { days: trackedLabel })}</span>
                {listedDateTime && (
                  <>
                    <span aria-hidden className="text-muted-foreground/30 text-xs">•</span>
                    <span
                      className="num flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground"
                      title={t("listing.listedTitle", "When Motormila first spotted this ad — usually within hours of it going live on the source site.")}
                    >
                      <Calendar aria-hidden className="h-3.5 w-3.5 text-primary-bright" /> {t("listing.listed", "Listed {date}", { date: listedDateTime })}
                    </span>
                  </>
                )}
              </div>
            </motion.div>

            {/* Specs Bento Grid */}
            <motion.div variants={revealItem} className="space-y-3">
              <h2 className="text-[12px] font-semibold text-muted-foreground">{t("listing.specifications", "Specifications")}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {specs.map((s) => (
                  <motion.div
                    key={s.label}
                    whileHover={{ scale: 1.02, y: -3 }}
                    transition={springSnappy}
                    className="rounded-[1.6rem] border border-border bg-card p-4 transition-colors hover:border-primary/30 relative overflow-hidden group shadow-soft"
                  >
                    <div aria-hidden className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <s.icon aria-hidden className="mb-2 h-4 w-4 text-primary" />
                    <p className="text-[10px] font-medium text-muted-foreground">{s.label}</p>
                    <p className="mt-1 text-[14px] font-bold text-foreground num leading-tight">{s.value}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {priceHistory && priceHistory.points.length > 0 && (
              <motion.div variants={revealItem}>
                <ListingPriceTimeline
                  history={priceHistory}
                  marketMedianLkr={listing.market_median_lkr}
                  listingTitle={`${canonicalizeMake(listing.make) || listing.make} ${canonicalizeModel(listing.model) || listing.model}`}
                />
              </motion.div>
            )}

            <motion.div variants={revealItem}>
              <TrustCheckPanel
                listing={listing}
                pricePoints={priceHistory?.points ?? null}
                related={relatedListings}
              />
            </motion.div>

            {listing.id != null && <ListingHistoryReport listingId={listing.id} />}

            <motion.div variants={revealItem}>
              <ListingLeadActions
                listingId={listing.id ?? undefined}
                vehicle={[listing.year, canonicalizeMake(listing.make) || listing.make, canonicalizeModel(listing.model) || listing.model].filter(Boolean).join(' ')}
                priceLkr={hasPrice ? listingPrice : undefined}
                district={listing.district ?? undefined}
              />
            </motion.div>

            {/* Description */}
            <motion.div variants={revealItem} className="rounded-[1.75rem] border border-border bg-card p-5 shadow-soft">
              <h2 className="mb-3.5 text-[12px] font-semibold text-muted-foreground">{t("listing.description", "Description")}</h2>
              <p className="whitespace-pre-wrap text-[13px] leading-[1.8] text-muted-foreground font-medium">
                {listing.description || t("listing.noDescription", "The seller didn't add a description. Open the original ad for full details.")}
              </p>
            </motion.div>

            {hasPrice && (() => {
              // brand_new already covers API-normalized "unregistered"/new imports
              const isUnregistered =
                listing.condition === 'brand_new' ||
                (typeof listing.year === 'number' && listing.year >= 2025);

              return (
                <motion.div variants={revealItem} className="space-y-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-[12px] font-semibold text-muted-foreground">{t("listing.ownershipPlanning", "Ownership planning")}</h2>
                    <Link to="/afford" className="text-[12px] font-semibold text-primary no-underline hover:underline">
                      {t("listing.whatCanIAfford", "What else fits my budget?")}
                    </Link>
                  </div>

                  <CashToOwnStrip
                    priceLkr={listingPrice}
                    financeClass={inferFinanceClass({
                      condition: listing.condition,
                      fuelType: listing.fuel_type,
                      year: listing.year,
                    })}
                  />
                <div className="grid gap-4 md:grid-cols-2 items-start">
                  <LeaseCalculator
                    price={listingPrice}
                    financeClass={inferFinanceClass({
                      condition: listing.condition,
                      fuelType: listing.fuel_type,
                      year: listing.year,
                    })}
                  />
                  {isUnregistered ? (
                    <TaxBreakdown
                      price={listingPrice}
                      engineCapacity={plausibleEngineCc(listing.engine_cc, listing.year)}
                      initialFuelType={importFuelType}
                    />
                  ) : (
                    <div className="page-panel flex flex-col justify-between gap-3 rounded-[1.75rem] p-6">
                      <div>
                        <h2 className="field-label text-foreground">{t("listing.importDutyTax", "Import duty and tax")}</h2>
                        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                          This vehicle is already registered in Sri Lanka, so import duty doesn't
                          apply to buying it. Curious what importing the same spec fresh would cost
                          under today's gazette?
                        </p>
                      </div>
                      <Link
                        to={`/calculator?tab=landed-cost&fuel=${importFuelType}${typeof listing.engine_cc === 'number' ? `&cc=${listing.engine_cc}` : ''}`}
                        className="inline-flex w-fit items-center gap-1.5 rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2 text-[12px] font-semibold text-primary-bright no-underline transition-all hover:bg-primary/15"
                      >
                        Model a fresh import <ArrowRight aria-hidden className="h-3 w-3" />
                      </Link>
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })()}
          </div>

          {/* ── SIDEBAR ───────────────────────────────────────── */}
          <aside className="space-y-5 lg:sticky lg:top-20">

            {/* Price — the money hero: the number towers, verdict reads in signal colour */}
            <motion.div
              variants={revealItem}
              className="rounded-[1.75rem] border border-border bg-card p-5 relative overflow-hidden shadow-soft-lg"
              style={{ backgroundImage: 'radial-gradient(circle at 100% 0%, hsl(var(--primary) / 0.06) 0%, transparent 60%)' }}
            >
              <div aria-hidden className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary to-transparent" />
              <h2 className="text-[12px] font-semibold text-muted-foreground">{t("listing.askingPrice", "Asking price")}</h2>
              <p className="num mt-2 text-[2.5rem] font-extrabold leading-[1.05] tracking-tight text-foreground">{hasPrice ? formatPrice(listingPrice) : t("listing.unlisted", "Unlisted")}</p>

              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                <HybridCliffBadge fuelType={listing.fuel_type} engineCc={plausibleEngineCc(listing.engine_cc, listing.year)} />
                <MileageTrustChip mileageKm={listing.mileage_km} year={listing.year} />
                <SellSpeedChip listing={listing} />
                <AdvertHealthChip listing={listing} />
                {priceHistory && priceHistory.cut_count > 0 && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300"
                    title={`Tracked since first sighting: ${priceHistory.cut_count} downward price ${priceHistory.cut_count === 1 ? 'move' : 'moves'}${priceHistory.change_pct !== null ? `, ${priceHistory.change_pct}% overall` : ''}`}
                  >
                    <Clock aria-hidden className="h-3 w-3" />
                    Price cut {priceHistory.cut_count}×
                    {priceHistory.change_pct !== null && priceHistory.change_pct < 0 && (
                      <span className="num">({priceHistory.change_pct}%)</span>
                    )}
                  </span>
                )}
              </div>

              {hasDealScore ? (
                <div className="mt-5 flex items-center gap-3">
                  <FairPriceIndicator score={dealScore} condition={listing.condition} size="lg" className="num font-extrabold" />
                  <span className={`num text-[11px] font-bold ${dealTone}`}>{dealDelta}</span>
                </div>
              ) : !fullAccess ? (
                <div className="mt-5">
                  <UpgradePrompt
                    title={freePlanCopy.scoresTitle}
                    body={freePlanCopy.scoresBody}
                    variant="strip"
                  />
                </div>
              ) : (
                <p className="mt-5 text-[11px] font-semibold text-muted-foreground">
                  No price rating — not enough comparable listings for a confident call on this vehicle.
                </p>
              )}

              {fmvSummary && (
                <div className="mt-3 rounded-3xl border border-border bg-surface px-3.5 py-3">
                  <p className="text-[12px] font-semibold text-muted-foreground">
                    {t("listing.fmv", "Fair market value")}
                  </p>
                  <p
                    className={`mt-1 text-[13px] font-bold ${
                      fmvSummary.band === "below"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : fmvSummary.band === "above"
                          ? "text-rose-700 dark:text-rose-400"
                          : "text-foreground"
                    }`}
                  >
                    {fmvSummary.label}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-muted-foreground num">
                    FMV {formatPrice(fmvSummary.fmv_lkr)}
                  </p>
                  {fmvDetail && fmvDetail.method !== "insufficient_data" && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {fmvDetail.sample_size > 0 ? `${fmvDetail.sample_size} comps · ` : ""}
                      {fmvDetail.method === "ols_comps" ? "OLS model" : fmvDetail.method === "adjusted_median" ? "Adj. median" : "Cohort median"}
                      {fmvDetail.confidence !== "none" ? ` · ${fmvDetail.confidence} confidence` : ""}
                    </p>
                  )}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border/70 pt-2.5">
                    <FmvExplainer
                      compsCount={fmvDetail?.sample_size ?? 0}
                      confidence={fmvDetail?.confidence ?? "none"}
                      method={fmvDetail?.method}
                      fmvLkr={fmvSummary.fmv_lkr}
                      updatedAt={fmvDetail?.updated_at}
                    />
                    <button
                      type="button"
                      onClick={handleComparePin}
                      aria-pressed={isPinnedForCompare(Number(listing.id))}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[12px] font-semibold text-primary-bright transition-all hover:bg-primary/15 active:scale-[0.97]"
                    >
                      <Scale aria-hidden className="h-3 w-3" />
                      {isPinnedForCompare(Number(listing.id)) ? t("listing.pinned", "Pinned ✓") : t("listing.addToCompare", "Add to compare")}
                    </button>
                  </div>
                </div>
              )}

              {hasPrice &&
                Number.isFinite(Number(listing.market_median_lkr)) &&
                Number(listing.market_median_lkr) > 0 && (
                  <div className="mt-2">
                    <DealLadder askingPrice={listingPrice} marketMedianLkr={Number(listing.market_median_lkr)} />
                  </div>
                )}
            </motion.div>

            {/* Seller */}
            <motion.div variants={revealItem} className="rounded-[1.75rem] border border-border bg-card p-5 shadow-soft">
              <div className="mb-3.5 flex items-center gap-2 border-b border-border pb-2.5">
                <ShieldCheck aria-hidden className="h-4 w-4 text-primary" />
                <h2 className="text-[12px] font-semibold text-muted-foreground">{t("listing.sellerInfo", "Seller information")}</h2>
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-foreground leading-tight">{sellerHeadline}</p>
                  <p className="mt-1 truncate text-[12px] text-muted-foreground font-medium">{sellerName}</p>
                </div>
                <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary-bright">{trustBadges[0] || 'Source'}</span>
              </div>

              <p className="mt-3 text-[11px] text-muted-foreground font-medium">{trustMeta}</p>

              {/* Contact happens on the source marketplace: Motormila doesn't
                  republish seller phone numbers (privacy + source terms). */}
              <div className="mt-4 space-y-2">
                {listingUrl ? (
                  <a
                    href={listingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent("contact_on_source_clicked", { listing_id: listing.id, source: listing.source })}
                    className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-primary px-4 text-[13px] font-bold text-primary-foreground no-underline shadow-soft transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]"
                  >
                    {t("listing.contactOnSource", "Contact seller on {source}", { source: attribution.sourceName })}
                    <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <p className="text-[12px] text-muted-foreground">{t("listing.noSourceLink", "The original ad link isn't available for this listing.")}</p>
                )}
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  {t("listing.contactNote", "Opens the original ad. Motormila doesn't share seller phone numbers.")}
                </p>
              </div>

              {ratingValue ? (
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3.5">
                  <div aria-hidden className="flex gap-0.5 text-primary">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <svg key={s} xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={s <= ratingStars ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" className={s > ratingStars ? 'text-muted-foreground/30' : ''}>
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    ))}
                  </div>
                  <span className="num text-[12px] font-bold text-foreground">{ratingValue.toFixed(1)}{reviewCount != null && <span className="text-muted-foreground font-medium"> ({reviewCount})</span>}</span>
                </div>
              ) : <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground italic">{t("listing.noSellerRating", "No public seller rating synced.")}</p>}

            </motion.div>

            {/* Peers */}
            <motion.div variants={revealItem} className="rounded-[1.75rem] border border-border bg-card p-5 shadow-soft">
              <div className="mb-3.5 flex items-center justify-between border-b border-border pb-2.5">
                <h2 className="text-[12px] font-semibold text-muted-foreground">{t("listing.marketPeers", "Market peers")}</h2>
                <ArrowRight aria-hidden className="h-3.5 w-3.5 text-primary" />
              </div>

              {visibleSimilar.length > 0 ? (
                <div className="space-y-2">
                  {visibleSimilar.map((s) => (
                    <Link
                      key={s.id}
                      to={`/listing/${s.id}`}
                      className="group flex items-center justify-between rounded-2xl border border-border bg-surface px-3.5 py-2.5 no-underline transition-all hover:bg-card hover:border-primary/30 hover:translate-y-[-1px]"
                    >
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{s.make} {s.model} · {s.year}</p>
                        <p className="num mt-1 text-[13px] font-bold text-foreground group-hover:text-primary transition-colors">{formatPrice(s.price_lkr)}</p>
                      </div>
                      {fullAccess && typeof s.deal_score === 'number' && s.deal_score > 0 && (
                        <span className="num text-[10px] font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 bg-emerald-500/10 rounded px-1.5 py-0.5">{s.deal_score}%</span>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center"><CarIcon aria-hidden className="mx-auto mb-2 h-5 w-5 text-muted-foreground/40" /><p className="text-[11px] text-muted-foreground">{t("listing.noPeers", "No active peers tracked.")}</p></div>
              )}
            </motion.div>

            {listing.make && (
              <motion.div variants={revealItem}>
                <SafetyResearchCard research={safetyResearch} />
              </motion.div>
            )}

            <motion.div variants={revealItem}>
              <ListingGeoCard geo={listingGeo} />
            </motion.div>

            {/* NHTSA catalog disclosure */}
            {listing.make && (
              <motion.div variants={revealItem}>
                <NhtsaModelsCard make={listing.make} model={listing.model ?? undefined} compact />
              </motion.div>
            )}

            {/* Insight */}
            <motion.div variants={revealItem} className="rounded-2xl border border-border bg-card p-5 shadow-soft relative overflow-hidden">
              <div aria-hidden className="absolute top-0 left-0 h-full w-[2px] bg-primary" />
              <div className="flex items-center gap-2 mb-2">
                <Zap aria-hidden className="h-4 w-4 text-primary" />
                <h2 className="text-[12px] font-bold text-foreground">{t("listing.insight", "Motormila Insight")}</h2>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground font-medium">
                Tracked for <span className="num font-bold text-foreground">{trackedLabel}</span>.
                {avgPeerDays && ` Peers average ${avgPeerDays}d.`}
                {visibleSimilar.length > 0 && ` ${visibleSimilar.length} comparable listings active.`}
              </p>
            </motion.div>
          </aside>
        </div>
      </div>
    </motion.div>
  );
}
