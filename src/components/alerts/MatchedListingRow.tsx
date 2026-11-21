import { Link } from "react-router-dom";
import { ChevronRight, TrendingDown, TrendingUp } from "lucide-react";

import { formatPrice, type AlertMatchListing } from "@/services/api";
import { VehicleThumbnail } from "@/components/VehicleThumbnail";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import { hasFullPlatformAccess } from "@/lib/planLimits";

/**
 * One vehicle matched by an alert, set in the same row language as the alert
 * cards: thumbnail, name, where it is, and the asking price in display type.
 */
export function MatchedListingRow({ listing }: { listing: AlertMatchListing }) {
  const { t } = useAppPreferences();
  const { hasProAccess, isAdmin } = useAuth();
  const fullAccess = hasFullPlatformAccess({ hasProAccess, isAdmin });
  const name = listing.title || `${listing.make} ${listing.model}`;
  const title = listing.year && !name.includes(String(listing.year)) ? `${name} ${listing.year}` : name;
  const price = Number(listing.price_lkr);
  const hasPrice = Number.isFinite(price) && price > 0;
  const dealLabel =
    fullAccess && listing.deal_score !== null
      ? t("alerts.dealSuffix", "· +{score} deal", { score: Number(listing.deal_score).toFixed(0) })
      : null;

  return (
    <li>
      <Link
        to={`/listing/${listing.id}`}
        aria-label={t("alerts.viewListingAria", "View listing {title}", { title })}
        className="group flex items-center gap-3 px-4 py-3 no-underline transition-colors duration-short hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
      >
        <div className="h-14 w-20 shrink-0 overflow-hidden rounded-control bg-surface-2">
          <VehicleThumbnail
            src={listing.thumbnail_url}
            listingId={listing.id}
            alt={title}
            sizes="80px"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-foreground transition-colors duration-short group-hover:text-primary">
            {title}
          </p>
          <p className="mt-0.5 truncate text-caption text-label-2">
            {listing.district || "LK"}
            {dealLabel ? ` ${dealLabel}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasPrice ? (
            <span className="font-display tabular-nums text-callout font-semibold tracking-tight text-foreground">
              {formatPrice(price)}
            </span>
          ) : (
            <span className="text-caption text-label-2">{t("listingCard.priceUnavailable", "Price unavailable")}</span>
          )}
          <ChevronRight
            aria-hidden
            className="h-4 w-4 text-label-2 transition-transform duration-short ease-standard group-hover:translate-x-0.5"
          />
        </div>
      </Link>
    </li>
  );
}

/** Small up/down chip: the cheapest live match against the alert's target price. */
export function TargetPriceChip({ targetPrice, cheapest }: { targetPrice: number; cheapest: number }) {
  const { t } = useAppPreferences();
  const gap = Math.abs(targetPrice - cheapest);
  const under = cheapest <= targetPrice;
  return (
    <span
      className={
        under
          ? "inline-flex h-6 items-center gap-1 rounded-pill border border-deal-good/30 bg-deal-good/10 px-2.5 text-caption font-semibold text-deal-good-text"
          : "inline-flex h-6 items-center gap-1 rounded-pill border border-deal-high/30 bg-deal-high/10 px-2.5 text-caption font-semibold text-deal-high-text"
      }
    >
      {under ? <TrendingDown aria-hidden className="h-3.5 w-3.5" /> : <TrendingUp aria-hidden className="h-3.5 w-3.5" />}
      <span className="num">
        {under
          ? t("alerts.underTarget", "{amount} under target", { amount: formatPrice(gap) })
          : t("alerts.overTarget", "{amount} over target", { amount: formatPrice(gap) })}
      </span>
    </span>
  );
}
