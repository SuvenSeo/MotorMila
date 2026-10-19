import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Smartphone, X } from "lucide-react";
import { useAppPreferences } from "@/lib/appPreferences";

const SEEN_KEY = "motormila.mobile_promo_seen";
/**
 * Never show where the strip would sit on top of task UI: listing detail
 * (sticky price/seller panel), filtered search, tools and the app page itself.
 */
const SUPPRESSED_PREFIXES = [
  "/mobile-app",
  "/compare",
  "/docs",
  "/listing/",
  "/calculator",
  "/afford",
  "/safe-transfer",
  "/sign-in",
  "/sign-up",
];

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Session-only then; acceptable.
  }
}

/**
 * One-time, non-blocking announcement strip for the Android app.
 *
 * - Slim bar pinned to the bottom edge (above the mobile bottom nav), never a
 *   floating card over filters or listing panels.
 * - Shown at most once per browser: it is marked seen the moment it renders,
 *   so it never comes back on the next visit even if the user ignores it.
 * - Hidden on search (any query string on "/") and task pages.
 */
export function MobileAppPromo() {
  const { t } = useAppPreferences();
  const { pathname, search } = useLocation();
  const [visible, setVisible] = useState(false);

  const isFilteredSearch = pathname === "/" && search.length > 1;
  const suppressed = isFilteredSearch || SUPPRESSED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  useEffect(() => {
    if (suppressed) {
      setVisible(false);
      return;
    }
    if (readSeen()) return;
    // Let the first paint settle before the strip appears.
    const timer = window.setTimeout(() => {
      setVisible(true);
      markSeen();
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [suppressed]);

  if (suppressed || !visible) return null;

  const dismiss = () => {
    setVisible(false);
    markSeen();
  };

  return (
    <aside
      role="complementary"
      aria-label={t("mobile.promoAria", "Motormila mobile app announcement")}
      className="pointer-events-none fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 md:bottom-4 md:justify-end md:px-4"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-2.5 rounded-2xl border border-border bg-card/95 py-2 pl-3 pr-1.5 text-foreground shadow-soft-lg backdrop-blur-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
        <Smartphone className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-[12.5px] leading-snug">
          <span className="font-semibold">{t("mobile.promoTitleShort", "Motormila for Android")}</span>
          <span className="text-muted-foreground"> · {t("mobile.promoBodyShort", "price-drop alerts and plate scan")}</span>
        </p>
        <Link
          to="/mobile-app"
          onClick={dismiss}
          className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {t("mobile.promoCtaShort", "Get the app")}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("mobile.promoClose", "Dismiss announcement")}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
