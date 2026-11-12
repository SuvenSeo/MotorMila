import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { m } from "motion/react";
import { duration, ease, spring, useReducedMotionOrLowData } from "@/lib/motion";
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


/**
 * Shown once the hero gallery ([data-listing-gallery]) has scrolled away and
 * hidden again when the footer comes near, so it never covers either. Without
 * IntersectionObserver it simply stays up.
 */
function useStickyBarVisible(): boolean {
  const [heroGone, setHeroGone] = useState(() => typeof IntersectionObserver === "undefined");
  const [footerNear, setFooterNear] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const hero = document.querySelector("[data-listing-gallery]");
    const footer = document.querySelector("footer");
    const observers: IntersectionObserver[] = [];
    if (hero) {
      const io = new IntersectionObserver(([e]) => setHeroGone(!e.isIntersecting && e.boundingClientRect.top < 0), {
        threshold: 0,
      });
      io.observe(hero);
      observers.push(io);
    } else {
      setHeroGone(true);
    }
    if (footer) {
      const io = new IntersectionObserver(([e]) => setFooterNear(e.isIntersecting), { rootMargin: "0px 0px 96px 0px" });
      io.observe(footer);
      observers.push(io);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, []);
  return heroGone && !footerNear;
}

export function ListingStickyBar({ priceLkr, badge, href, sourceName, listingId, source }: ListingStickyBarProps) {
  const { t } = useAppPreferences();
  const visible = useStickyBarVisible();
  const calm = useReducedMotionOrLowData();
  if (!href) return null;
  // Long labels (lease / verify) don't fit beside price + CTA: show a short form.
  const compactBadge = badge.kind === "lease" || badge.kind === "verify" || badge.kind === "none" ? null : badge;
  // Portal to <body>: the route wrapper (.route-stage) has will-change: transform,
  // which makes it the containing block for position:fixed descendants — rendered
  // in place, the bar would sit at the bottom of the page instead of the viewport.
  const bar = (
    <>
      <m.div
        className="mm-over-overlay fixed inset-x-3 z-[60] lg:hidden bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-3"
        role="region"
        aria-label={t("listing.sticky.aria", "Price and contact")}
        data-visible={visible ? "true" : "false"}
        // Off-screen = inert (out of tab order / a11y tree) but still mounted.
        {...({ inert: visible ? undefined : "" } as Record<string, string | undefined>)}
        initial={false}
        animate={
          calm
            ? { opacity: visible ? 1 : 0, y: visible ? 0 : 160, transition: { duration: visible ? duration.short : 0 } }
            : visible
              ? { opacity: 1, y: 0, transition: spring.smooth }
              : { opacity: 0, y: 160, transition: { duration: duration.medium, ease: ease.accelerate } }
        }
        style={{ pointerEvents: visible ? undefined : "none" }}
      >
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 pl-4 shadow-soft-xl">
          <div className="min-w-0 flex-1">
            <p className="num truncate text-callout font-extrabold leading-tight text-foreground">
              {priceLkr ? formatPrice(priceLkr) : t("listing.unlisted", "Unlisted")}
            </p>
            {compactBadge ? (
              <DealBadge badge={compactBadge} tone="soft" className="mt-0.5 max-w-full [&>span]:truncate" />
            ) : badge.kind === "verify" ? (
              <p className="mt-0.5 truncate text-caption font-semibold text-deal-caution-text">
                {t("listing.sticky.verify", "Unusually low — verify first")}
              </p>
            ) : badge.kind === "lease" ? (
              <p className="mt-0.5 truncate text-caption font-semibold text-primary">
                {t("listing.sticky.lease", "Lease takeover — not full price")}
              </p>
            ) : null}
          </div>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent("contact_on_source_clicked", { listing_id: listingId, source, placement: "sticky" })}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-footnote font-bold text-primary-foreground no-underline shadow-soft transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("listing.viewOnSource", "View on {source}", { source: sourceName })}
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          </a>
        </div>
      </m.div>
    </>
  );
  return typeof document === "undefined" ? bar : createPortal(bar, document.body);
}
