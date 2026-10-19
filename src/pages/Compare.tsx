import { useEffect, useState, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Link2, Scale, Search, X } from "lucide-react";
import { toast } from "sonner";
import { getListingsBatch } from "@/services/api";
import { CarListing } from "@/types/car";
import { ComparisonModal } from "@/components/ComparisonModal";
import { DealScoreBadge } from "@/components/DealScoreBadge";
import { FmvExplainer } from "@/components/FmvExplainer";
import { buildCompareLink, loadPinned, useCompareTray } from "@/lib/compareTray";
import { PageCanvas } from "@/components/PageCanvas";

const MAX_COMPARE_IDS = 3;

export default function Compare() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [listings, setListings] = useState<CarListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const { toggle: toggleCompare, isPinned } = useCompareTray();

  const rawIds = searchParams.get("ids") ?? "";
  const urlIds = rawIds
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, MAX_COMPARE_IDS);
  // Fall back to the persisted tray so a direct visit to /compare (navbar,
  // bookmark, refresh) keeps the user's pinned selection instead of showing
  // an empty "no vehicles selected" state.
  const ids = urlIds.length > 0 ? urlIds : loadPinned().map((p) => p.id).slice(0, MAX_COMPARE_IDS);

  const fetchListings = useCallback(async () => {
    if (ids.length === 0) {
      setListings([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getListingsBatch(ids);
      setListings(result);
      if (result.length >= 2) setModalOpen(true);
    } catch {
      setError("Failed to load listings. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [rawIds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const hasIds = ids.length > 0;
  const hasEnough = listings.length >= 2;

  const handleRemove = (id: number) => {
    const remaining = ids.filter((n) => n !== id);
    setSearchParams(remaining.length ? { ids: remaining.join(",") } : {});
  };

  const handleCopyShareLink = async () => {
    const url = `${window.location.origin}${buildCompareLink(ids)}`;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else throw new Error("no clipboard");
      toast.success("Compare link copied");
    } catch {
      window.prompt("Copy compare link:", url);
    }
  };

  const handleTilePin = (listing: CarListing) => {
    const median = Number(listing.market_median_lkr);
    const result = toggleCompare({
      id: Number(listing.id),
      make: listing.make,
      model: listing.model,
      year: listing.year,
      price_lkr: Number(listing.price_lkr) || null,
      fmv_lkr: Number.isFinite(median) && median > 0 ? median : null,
      mileage_km: Number(listing.mileage_km) || null,
      district: listing.district,
      deal_score: typeof listing.deal_score === "number" ? listing.deal_score : null,
    });
    if (result.atCap) toast.error("Compare tray is full (max 3) — remove one first");
    else if (result.pinned) toast.success("Pinned to compare tray");
  };

  return (
    <PageCanvas>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        {/* Header */}
        <div className="mb-6 flex items-start gap-4">
          <Link
            to="/"
            className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground no-underline transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Back to Dashboard"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
          <div>
            <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[12px] font-medium text-primary-bright">
              <Scale className="h-3 w-3" />
              Compare
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Vehicle Comparison
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Side-by-side specs, pricing, and deal scores for up to {MAX_COMPARE_IDS} vehicles.
            </p>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex h-48 items-center justify-center">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-full border-2 border-foreground/[0.08]" />
              <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin" />
            </div>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-5 py-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Empty state — no ids in URL */}
        {!loading && !error && !hasIds && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/80 bg-card/85 py-16 text-center shadow-soft backdrop-blur-xl">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary-bright">
              <Scale className="h-7 w-7" />
            </div>
            <h2 className="mb-2 font-display text-xl font-semibold text-foreground">
              No vehicles selected
            </h2>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              Select vehicles from the Dashboard by clicking the compare toggle on each listing card, then open the full compare view.
            </p>
            <Link
              to="/"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border/80 bg-card/85 px-5 py-3 text-[13px] font-semibold text-foreground no-underline transition-all hover:bg-surface active:scale-[0.97]"
            >
              <Search className="h-3.5 w-3.5" />
              Browse listings
            </Link>
          </div>
        )}

        {/* Partial — ids provided but couldn't load enough */}
        {!loading && !error && hasIds && !hasEnough && listings.length > 0 && (
          <div className="rounded-3xl border border-border/80 bg-card/85 px-6 py-6 backdrop-blur-xl">
            <p className="text-sm font-semibold text-foreground">Only {listings.length} listing loaded.</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Need at least 2 vehicles to compare. Some IDs may be invalid or inactive.
            </p>
            <Link
              to="/"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/85 px-5 py-2.5 text-[13px] font-semibold text-foreground no-underline transition-all hover:bg-surface active:scale-[0.97]"
            >
              <Search className="h-3.5 w-3.5" />
              Select more vehicles
            </Link>
          </div>
        )}

        {/* Ready state — show ComparisonModal inline */}
        {!loading && !error && hasEnough && (
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-[13px] text-muted-foreground">
                Comparing <span className="font-semibold text-foreground">{listings.length}</span> vehicles
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/80 bg-card/85 px-4 text-[12px] font-semibold text-foreground transition-all hover:bg-surface active:scale-[0.97]"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Share ?ids= link
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-4 text-[12px] font-semibold text-primary-bright transition-all hover:bg-primary/15 active:scale-[0.97]"
                >
                  <Scale className="h-3.5 w-3.5" />
                  Open full compare
                </button>
              </div>
            </div>

            {/* Vehicle summary tiles — price vs FMV/km/year/district + explainer + tray pin */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => {
                const median = Number(listing.market_median_lkr);
                const fmv = Number.isFinite(median) && median > 0 ? median : null;
                const pinned = isPinned(Number(listing.id));
                return (
                  <div
                    key={listing.id}
                    className="rounded-3xl border border-border/80 bg-card/85 p-5 shadow-soft backdrop-blur-xl transition-all hover:border-primary/30 hover:shadow-soft-lg"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to={`/listing/${listing.id}`}
                        className="font-display text-[15px] font-semibold text-foreground no-underline hover:text-primary-bright"
                      >
                        {listing.make} {listing.model}
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleRemove(Number(listing.id))}
                        aria-label={`Remove ${listing.make} ${listing.model} from compare`}
                        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {listing.year ?? "—"}
                      {listing.variant ? ` · ${listing.variant}` : ""}
                      {listing.district ? ` · ${listing.district}` : ""}
                    </p>
                    {listing.price_lkr ? (
                      <p className="mt-2 text-[13px] font-semibold tabular-nums text-primary-bright">
                        LKR {Number(listing.price_lkr).toLocaleString()}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                      FMV {fmv ? `LKR ${fmv.toLocaleString()}` : "—"}
                      {listing.mileage_km != null ? ` · ${Number(listing.mileage_km).toLocaleString()} km` : ""}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border/70 pt-2.5">
                      <DealScoreBadge
                        score={listing.deal_score}
                        priceLkr={Number(listing.price_lkr) || null}
                        fmvLkr={fmv}
                      />
                      <FmvExplainer compsCount={0} confidence="low" method="cohort_median" fmvLkr={fmv} />
                      <button
                        type="button"
                        onClick={() => handleTilePin(listing)}
                        aria-pressed={pinned}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[12px] font-semibold text-primary-bright transition-all hover:bg-primary/15 active:scale-[0.97]"
                      >
                        <Scale className="h-3 w-3" aria-hidden />
                        {pinned ? "Pinned ✓" : "Pin"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <ComparisonModal listings={listings} open={modalOpen} onClose={() => setModalOpen(false)} />
          </>
        )}
      </div>
    </PageCanvas>
  );
}
