import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Smartphone, X } from "lucide-react";
import { useAppPreferences } from "@/lib/appPreferences";
import { setDockExtra } from "@/lib/dock";

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
 * - Never over the hero: it waits until the page is scrolled past the fold
 *   and steps away near the top.
 */
export function MobileAppPromo() {
  const { t } = useAppPreferences();
  const { pathname, search } = useLocation();
  const [visible, setVisible] = useState(false);
  const stripRef = useRef<HTMLElement>(null);

  const isFilteredSearch = pathname === "/" && search.length > 1;
  const suppressed = isFilteredSearch || SUPPRESSED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  // Due: 8s after the first paint settles, at most once per browser.
  const [due, setDue] = useState(false);
  // Past the fold: never over the hero at the top of a page — the strip only
  // appears once the reader has scrolled, and steps away again near the top.
  const [pastFold, setPastFold] = useState(false);

  useEffect(() => {
    if (suppressed) {
      setVisible(false);
      return;
    }
    if (visible || readSeen()) return;
    const timer = window.setTimeout(() => setDue(true), 8000);
    return () => window.clearTimeout(timer);
  }, [suppressed, visible]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = window.scrollY > Math.min(window.innerHeight * 0.75, 640);
      setPastFold((cur) => (cur === next ? cur : next));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  // Becomes visible once due and past the fold.
  useEffect(() => {
    if (suppressed || visible || !due || !pastFold) return;
    setVisible(true);
    markSeen();
  }, [suppressed, visible, due, pastFold]);

  const shown = !suppressed && visible && pastFold;

  // Claim dock height while shown so the compare tray stacks
  // above the strip instead of overlapping it.
  useLayoutEffect(() => {
    if (!shown) {
      setDockExtra(0);
      return;
    }
    const el = stripRef.current;
    const measure = () => setDockExtra((el?.offsetHeight ?? 0) + 12);
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      setDockExtra(0);
    };
  }, [shown]);

  if (!shown) return null;

  const dismiss = () => {
    setVisible(false);
    setDue(false);
    markSeen();
  };

  return (
    <aside
      ref={stripRef}
      role="complementary"
      aria-label={t("mobile.promoAria", "Motormila mobile app announcement")}
      className="dock-strip pointer-events-none inset-x-0 flex justify-center px-3 md:justify-end md:px-6"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-2.5 rounded-2xl border border-border bg-card py-2 pl-3 pr-1.5 text-foreground shadow-soft-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
        <Smartphone className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-footnote leading-snug">
          <span className="block font-semibold">{t("mobile.promoTitleShort", "Motormila for Android (preview)")}</span>
          <span className="block text-muted-foreground">{t("mobile.promoBodyShort", "price-drop alerts and plate scan")}</span>
        </p>
        <Link
          to="/mobile-app"
          onClick={dismiss}
          className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-caption font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {t("mobile.promoCtaShort", "Get the preview")}
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
