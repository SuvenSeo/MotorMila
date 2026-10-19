import { ExternalLink } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { useAppPreferences } from "@/lib/appPreferences";
import type { DealBadge as DealBadgeModel } from "@/lib/dealBadge";
import { DealBadge } from "@/components/listing/DealBadge";
import { formatPrice } from "@/services/api";

interface ListingStickyBarProps {
  priceLkr: number | null;
  badge: DealBadgeModel;
  href: string | null;
  sourceName: string;
  listingId: number;
  source: string;
}

/*
 * Mobile/tablet (< lg) sticky CTA. Sits above the floating bottom nav (< md)
 * and nudges the chat launcher up while mounted so they never overlap.
 * Scoped <style> keeps that tweak inside this component (no global CSS edit).
 */
const FLOATING_OFFSET_CSS = `
@media (max-width: 767px) { .aw-fab-wrapper { bottom: calc(10.5rem + env(safe-area-inset-bottom)) !important; } }
@media (min-width: 768px) and (max-width: 1023px) { .aw-fab-wrapper { bottom: 6rem !important; } }
`;

export function ListingStickyBar({ priceLkr, badge, href, sourceName, listingId, source }: ListingStickyBarProps) {
  const { t } = useAppPreferences();
  if (!href) return null;
  // Long labels (lease / verify) don't fit beside price + CTA: show a short form.
  const compactBadge = badge.kind === "lease" || badge.kind === "verify" || badge.kind === "none" ? null : badge;
  return (
    <>
      <style>{FLOATING_OFFSET_CSS}</style>
      <div
        className="fixed inset-x-3 z-[60] lg:hidden bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-3"
        role="region"
        aria-label={t("listing.sticky.aria", "Price and contact")}
      >
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/95 p-2.5 pl-4 shadow-soft-xl backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <p className="num truncate text-[17px] font-extrabold leading-tight text-foreground">
              {priceLkr ? formatPrice(priceLkr) : t("listing.unlisted", "Unlisted")}
            </p>
            {compactBadge ? (
              <DealBadge badge={compactBadge} tone="soft" className="mt-0.5 max-w-full [&>span]:truncate" />
            ) : badge.kind === "verify" ? (
              <p className="mt-0.5 truncate text-[11.5px] font-semibold text-amber-700 dark:text-amber-300">
                {t("listing.sticky.verify", "Unusually low — verify first")}
              </p>
            ) : badge.kind === "lease" ? (
              <p className="mt-0.5 truncate text-[11.5px] font-semibold text-sky-700 dark:text-sky-300">
                {t("listing.sticky.lease", "Lease takeover — not full price")}
              </p>
            ) : null}
          </div>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent("contact_on_source_clicked", { listing_id: listingId, source, placement: "sticky" })}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-[13px] font-bold text-primary-foreground no-underline shadow-soft transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("listing.viewOnSource", "View on {source}", { source: sourceName })}
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </>
  );
}
