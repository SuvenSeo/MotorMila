import { useLayoutEffect, useRef } from "react";
import { m } from "motion/react";
import { useLocation } from "react-router-dom";
import { PrefetchLink } from "@/components/PrefetchLink";
import { useAppPreferences } from "@/lib/appPreferences";
import { usePrefersReducedMotionOrLowData, tween } from "@/lib/motion";
import { NAV_DESTINATIONS, isDestinationActive, type NavDestination } from "@/lib/siteNav";

/**
 * Mobile bottom nav: the same five destinations as the header (Buy, Prices,
 * Tools, Sell, Saved). Saved sits behind sign-in — tapping it goes through
 * RequireAuth, which asks the visitor to sign in and returns them after.
 * Labels are short and never truncate: like a native tab bar their size is
 * capped (index.css .bottom-nav-label) so 200% text keeps whole words, and
 * every tab has a min width so Sinhala / Tamil words never collide.
 */
/** Index of the tab that was active before the current one (for the pill glide). */
let lastActiveIndex = -1;
/** Tab width, measured off the critical path (idle / resize), never in a route commit. */
let tabWidth = 0;

/**
 * The active pill glides from the previous tab: a one-off WAAPI transform
 * (compositor) armed when a tab becomes active. Replaces motion's shared
 * `layoutId`, whose projection tree re-measured every tab (a forced layout)
 * on each of the nav's re-renders — every search-param change on home.
 */
function useTabPillGlide(isActive: boolean, index: number, calm: boolean) {
  const pillRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!isActive) return;
    const from = lastActiveIndex;
    lastActiveIndex = index;
    const pill = pillRef.current;
    if (calm || from < 0 || from === index || !pill || typeof pill.animate !== "function") return;
    const dx = (from - index) * tabWidth;
    if (!dx) return;
    pill.animate([{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }], {
      duration: 380,
      easing: "cubic-bezier(0.32, 0.72, 0, 1)",
    });
  }, [isActive, index, calm]);
  return pillRef;
}

function TabItem({ dest, index, calm }: { dest: NavDestination; index: number; calm: boolean }) {
  const { pathname } = useLocation();
  const { t } = useAppPreferences();
  const isActive = isDestinationActive(dest, pathname);
  const pillRef = useTabPillGlide(isActive, index, calm);
  const Icon = dest.icon;
  const label = t(dest.labelKey, dest.fallback);

  return (
    <PrefetchLink
      to={dest.href}
      aria-current={isActive ? "page" : undefined}
      data-active={isActive}
      title={label}
      className={`bottom-nav-tab group relative flex min-w-[3.5rem] flex-1 basis-0 flex-col items-center justify-center gap-1 overflow-hidden px-0.5 py-2 no-underline outline-none transition-colors duration-short focus-visible:ring-2 focus-visible:ring-primary/50 ${
        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className="relative flex h-7 w-10 items-center justify-center">
        {isActive && <span ref={pillRef} className="absolute inset-0 rounded-full bg-primary/12" aria-hidden />}
        {/* Micro-bounce: squish on tap, small hop when the tab becomes active. */}
        <m.span
          className="relative z-10 flex"
          initial={false}
          animate={calm ? undefined : isActive ? { y: [0, -3, 0], scale: [1, 1.08, 1] } : { y: 0, scale: 1 }}
          transition={tween.medium}
          whileTap={calm ? undefined : { scale: 0.86 }}
          // Motion adds tabindex="0" to whileTap elements; the link is the tab stop, not the icon.
          tabIndex={-1}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </m.span>
      </span>
      <span
        className={`bottom-nav-label block w-full whitespace-normal text-center font-semibold leading-tight [overflow-wrap:normal] ${
          isActive ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </PrefetchLink>
  );
}

export function MobileBottomNav() {
  const { t } = useAppPreferences();
  const calm = usePrefersReducedMotionOrLowData();
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    // ResizeObserver delivers sizes after layout, so this never forces one.
    const ro = new ResizeObserver(() => {
      const tab = nav.querySelector<HTMLElement>(".bottom-nav-tab");
      if (tab) tabWidth = tab.getBoundingClientRect().width;
    });
    const row = nav.querySelector(".bottom-nav-tab")?.parentElement;
    if (row) ro.observe(row);
    return () => ro.disconnect();
  }, []);

  return (
    <nav
      ref={navRef}
      aria-label={t("nav.mobileNavigation", "Mobile bottom navigation")}
      className="bottom-nav md:hidden fixed inset-x-3 bottom-3 z-bottom-nav pointer-events-auto"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="nav-glass overflow-hidden rounded-full">
        <div className="flex min-h-16 items-stretch px-2">
          {NAV_DESTINATIONS.map((dest, i) => (
            <TabItem key={dest.id} dest={dest} index={i} calm={calm} />
          ))}
        </div>
      </div>
    </nav>
  );
}
