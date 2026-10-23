import { LayoutGroup, m, motion } from "motion/react";
import { useLocation } from "react-router-dom";
import { PrefetchLink } from "@/components/PrefetchLink";
import { useAppPreferences } from "@/lib/appPreferences";
import { spring, usePrefersReducedMotionOrLowData, tween } from "@/lib/motion";
import { NAV_DESTINATIONS, isDestinationActive, type NavDestination } from "@/lib/siteNav";

/**
 * Mobile bottom nav: the same five destinations as the header (Buy, Prices,
 * Tools, Sell, Saved). Saved sits behind sign-in — tapping it goes through
 * RequireAuth, which asks the visitor to sign in and returns them after.
 * Labels are short, truncate with an ellipsis and every tab has a min width so
 * Sinhala / Tamil words never collide.
 */
function TabItem({ dest, calm }: { dest: NavDestination; calm: boolean }) {
  const { pathname } = useLocation();
  const { t } = useAppPreferences();
  const isActive = isDestinationActive(dest, pathname);
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
        {isActive && (
          <motion.span
            layoutId="mobile-nav-pill"
            className="absolute inset-0 rounded-full bg-primary/12"
            transition={calm ? { duration: 0 } : spring.snappy}
            aria-hidden
          />
        )}
        {/* Micro-bounce: squish on tap, small hop when the tab becomes active. */}
        <m.span
          className="relative z-10 flex"
          initial={false}
          animate={calm ? undefined : isActive ? { y: [0, -3, 0], scale: [1, 1.08, 1] } : { y: 0, scale: 1 }}
          transition={tween.medium}
          whileTap={calm ? undefined : { scale: 0.86 }}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </m.span>
      </span>
      <span
        className={`bottom-nav-label block w-full truncate text-center text-caption font-semibold leading-tight ${
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

  return (
    <nav
      aria-label={t("nav.mobileNavigation", "Mobile bottom navigation")}
      className="bottom-nav md:hidden fixed inset-x-3 bottom-3 z-bottom-nav pointer-events-auto"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="nav-glass overflow-hidden rounded-full">
        <div className="flex min-h-16 items-stretch px-2">
          <LayoutGroup id="mobile-bottom-nav">
            {NAV_DESTINATIONS.map((dest) => (
              <TabItem key={dest.id} dest={dest} calm={calm} />
            ))}
          </LayoutGroup>
        </div>
      </div>
    </nav>
  );
}
