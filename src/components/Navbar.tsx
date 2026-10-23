import { BrandLogo } from "@/components/BrandLogo";
import { scrollBehavior, spring, transition as motionTransition, usePrefersReducedMotionOrLowData } from "@/lib/motion";
import { prefetchRoute } from "@/lib/routePrefetch";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, m, motion } from "motion/react";
import { ChevronDown, Crown, LayoutGrid, LogOut, Menu, Search, Settings, UserCircle2, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { SignInPortalModal } from "@/components/SignInPortalModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import { NotificationBell } from "@/components/NotificationBell";
import { openCommandPalette } from "@/lib/commandPalette";
import { openFeedbackDialog } from "@/lib/feedbackEvents";
import { FEEDBACK_LINK, MORE_LINKS, NAV_DESTINATIONS, isDestinationActive, type NavLinkItem } from "@/lib/siteNav";
import { NavFreshnessIndicator } from "@/components/NavFreshnessIndicator";
import { NavMoreMenu } from "@/components/NavMoreMenu";
import { fitNav } from "@/lib/navFit";
import { cn } from "@/lib/utils";

const SCROLLED_AT = 24;
const HIDE_AFTER = 96;
const HIDE_DELTA = 6;
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Site header (polish/shell).
 *
 * One 64px row on a 3-column grid: brand left · five destinations centred on
 * the viewport (lg+) with a compact "More" dropdown (NavMoreMenu) holding only
 * the routes no destination reaches · actions right (search, freshness hint,
 * language, bell, account), all 36px controls. Below lg the destinations live
 * in the bottom nav (mobile) / hamburger menu panel, which lists every route.
 *
 * Transparent at the top so page heroes run underneath it; a translucent
 * blurred background + hairline fade in once the page scrolls. On phones the
 * header slides away while scrolling down and returns on scroll up.
 */
export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const { user, logout, isAuthenticated, hasProAccess } = useAuth();
  const { t, language } = useAppPreferences();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const calm = usePrefersReducedMotionOrLowData();
  const menuOpenRef = useRef(menuOpen);
  menuOpenRef.current = menuOpen;
  const headerRef = useRef<HTMLElement>(null);
  const capsule = isScrolled || menuOpen;
  const capsuleRef = useRef(capsule);
  capsuleRef.current = capsule;

  // Keep the three clusters from ever overlapping: re-fit on resize, on the
  // top ↔ capsule switch, and whenever the clusters' content can change
  // (sign-in state, user name, language, fonts).
  useIsoLayoutEffect(() => {
    const header = headerRef.current;
    if (header) fitNav(header, capsule);
  }, [capsule, isAuthenticated, user?.name, language]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const refit = () => fitNav(header, capsuleRef.current);
    // Header width changes (resize) and cluster content changes that arrive
    // after mount (bell / freshness hint loading, name truncation, fonts).
    // fitNav ends on the same sizes it started from, so this cannot loop.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(refit);
    const nav = header.querySelector(".site-nav");
    ro?.observe(header);
    if (nav?.firstElementChild) ro?.observe(nav.firstElementChild);
    if (nav?.lastElementChild) ro?.observe(nav.lastElementChild);
    void document.fonts?.ready.then(refit).catch(() => undefined);
    return () => ro?.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    let lastY = window.scrollY;
    const mobile = window.matchMedia?.("(max-width: 767px)");
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const next = y > SCROLLED_AT;
      setIsScrolled((cur) => (cur === next ? cur : next));
      const delta = y - lastY;
      if (Math.abs(delta) >= HIDE_DELTA || y <= SCROLLED_AT) {
        const hide = Boolean(mobile?.matches) && !menuOpenRef.current && delta > 0 && y > HIDE_AFTER;
        setHidden((cur) => (cur === hide ? cur : hide));
        lastY = y;
      }
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // Close the menu panel on navigation; always reveal the header on a new page.
  useEffect(() => {
    setMenuOpen(false);
    setHidden(false);
  }, [pathname]);

  useEffect(() => {
    if (menuOpen) setHidden(false);
  }, [menuOpen]);

  const goTo = (href: string) => {
    setMenuOpen(false);
    if (href === "/" && pathname === "/") {
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
      return;
    }
    navigate(href);
  };

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
    navigate("/sign-in");
  };

  const openSignIn = () => {
    setMenuOpen(false);
    setSignInOpen(true);
  };

  const label = (item: { labelKey: string; fallback: string }) => t(item.labelKey, item.fallback);
  const menuLabel = menuOpen ? t("nav.closeMenu", "Close menu") : t("nav.openMenu", "Open menu");

  return (
    <header
      ref={headerRef}
      className="site-nav-header right-scroll-bar-position fixed inset-x-0 top-0 z-header"
      data-scrolled={isScrolled}
      data-nav-mode={isScrolled ? "compact" : "full"}
      data-hidden={hidden}
      data-menu-open={menuOpen}
      data-fit="0"
    >
      <div aria-hidden className="site-nav-bg" />
      <nav className="site-nav" aria-label={t("nav.primaryNavigation", "Primary navigation")}>
        {/* Brand */}
        <div className="flex min-w-0 items-center justify-self-start">
          <Link
            to="/"
            className="site-nav__brand-link group flex shrink-0 items-center rounded-xl no-underline outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label={t("nav.homeAria", "Motormila home")}
          >
            <BrandLogo className="site-nav__brand-logo" size="nav" showTagline={false} />
          </Link>
        </div>

        {/* Five destinations + More (desktop), centred on the viewport */}
        <LayoutGroup id="desktop-nav">
          <div className="site-nav__center hidden lg:flex">
            {NAV_DESTINATIONS.map((dest) => {
              const active = isDestinationActive(dest, pathname);
              return (
                <Link
                  key={dest.id}
                  to={dest.href}
                  onPointerEnter={() => prefetchRoute(dest.href)}
                  onFocus={() => prefetchRoute(dest.href)}
                  onClick={(e) => {
                    if (dest.href === "/" && pathname === "/") {
                      e.preventDefault();
                      window.scrollTo({ top: 0, behavior: scrollBehavior() });
                    }
                  }}
                  aria-current={active ? "page" : undefined}
                  data-active={active}
                  data-dest={dest.id}
                  className="site-nav__link"
                >
                  {active && (
                    <motion.span
                      layoutId="desktop-nav-pill"
                      className="site-nav__pill"
                      transition={calm ? { duration: 0 } : spring.snappy}
                      aria-hidden
                    />
                  )}
                  <span className="relative z-10">{label(dest)}</span>
                </Link>
              );
            })}
            <span aria-hidden className="mx-1 h-4 w-px bg-border" />
            <NavMoreMenu pathname={pathname} t={t} />
          </div>
        </LayoutGroup>

        {/* Actions */}
        <div className="flex min-w-0 items-center justify-end gap-1.5 justify-self-end">
          <button
            type="button"
            onClick={openCommandPalette}
            className="nav-control nav-search"
            aria-label={t("nav.search", "Search")}
            title={t("nav.searchHint", "Search (Ctrl+K)")}
          >
            <Search className="h-4 w-4" aria-hidden />
            <span className="nav-search__label">{t("nav.search", "Search")}</span>
            <kbd className="nav-search__kbd rounded-md border border-border px-1.5 text-[10.5px] font-medium text-muted-foreground">
              Ctrl K
            </kbd>
          </button>

          <NavFreshnessIndicator />

          <div className="hidden md:flex">
            <LocaleSwitcher />
          </div>

          <NotificationBell />

          {isAuthenticated && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="nav-control nav-account hidden gap-1.5 pl-2 pr-2.5 sm:inline-flex"
                  aria-label={t("shell.nav.account", "Your account")}
                >
                  <UserCircle2 className="h-[18px] w-[18px]" aria-hidden />
                  <span className="nav-account__name max-w-[7rem] truncate">{user.name || t("shell.nav.account", "Your account")}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-56">
                <DropdownMenuLabel className="text-[12px] font-medium text-muted-foreground">
                  {user.name ? <span className="block truncate text-[13px] font-semibold text-foreground">{user.name}</span> : null}
                  {hasProAccess ? t("common.pro", "Pro") : t("shell.nav.freePlan", "Free plan")}
                </DropdownMenuLabel>
                {hasProAccess ? (
                  <DropdownMenuItem onSelect={() => navigate("/pro")}>
                    <Crown className="mr-2 h-3.5 w-3.5" aria-hidden /> {t("nav.proDashboard", "Pro Dashboard")}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => navigate("/profile")}>
                  <UserCircle2 className="mr-2 h-3.5 w-3.5" aria-hidden /> {t("nav.myListings", "My listings")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/settings")}>
                  <Settings className="mr-2 h-3.5 w-3.5" aria-hidden /> {t("nav.settings", "Settings")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-3.5 w-3.5" aria-hidden /> {t("nav.signOut", "Sign out")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button type="button" onClick={openSignIn} className="nav-control hidden gap-1.5 px-3.5 sm:inline-flex">
              <UserCircle2 className="h-4 w-4" aria-hidden />
              <span>{t("nav.signIn", "Sign In")}</span>
            </button>
          )}

          {/* Hamburger only where the centre nav is collapsed */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setMenuOpen(false);
            }}
            className="nav-control nav-control--icon lg:hidden"
            aria-label={menuLabel}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {/* Hamburger menu panel (below lg) — every route, grouped under its destination */}
      <AnimatePresence>
        {menuOpen && (
          <m.div
            key="site-menu"
            id="site-menu"
            className="site-menu-panel-wrap"
            aria-label={t("nav.navigationMenu", "Navigation menu")}
            initial={calm ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: motionTransition.fast }}
            exit={calm ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -4, transition: motionTransition.exit }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setMenuOpen(false);
            }}
          >
            <div className="max-h-[min(78vh,720px)] overflow-y-auto overscroll-contain rounded-3xl border border-border bg-popover/[0.98] p-3.5 shadow-soft-lg">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Destinations collapse to one row each (the current one starts open) so the panel stays short. */}
                <div className="grid content-start gap-0.5">
                  {NAV_DESTINATIONS.map((dest) => {
                    const DestIcon = dest.icon;
                    const current = isDestinationActive(dest, pathname);
                    return (
                      <details key={dest.id} className="site-menu-dest group/dest" open={current || undefined}>
                        <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-xl px-2.5 py-2 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/50 [&::-webkit-details-marker]:hidden">
                          <span
                            className={cn(
                              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
                              current ? "border-primary/30 bg-primary/[0.12] text-primary" : "border-border bg-foreground/[0.03] text-muted-foreground",
                            )}
                          >
                            <DestIcon className="h-3.5 w-3.5" aria-hidden />
                          </span>
                          <span className="flex-1 text-[13px] font-semibold tracking-tight text-foreground">{label(dest)}</span>
                          <ChevronDown
                            className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-open/dest:rotate-180 motion-reduce:transition-none"
                            aria-hidden
                          />
                        </summary>
                        <div className="pb-1 pl-5">
                          <MenuGroup items={dest.items} pathname={pathname} onPick={goTo} t={t} />
                        </div>
                      </details>
                    );
                  })}
                </div>
                <div>
                  <MenuGroup title={t("footer.more", "More")} items={MORE_LINKS} pathname={pathname} onPick={goTo} t={t} />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      openFeedbackDialog();
                    }}
                    className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-foreground/[0.03] text-muted-foreground">
                      <FEEDBACK_LINK.icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="text-[12.5px] font-semibold tracking-tight text-foreground">{label(FEEDBACK_LINK)}</span>
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <div className="flex items-center gap-2 md:hidden">
                  <LocaleSwitcher showName />
                  <NavFreshnessIndicator className="!inline-flex" />
                </div>
                <span className="hidden items-center gap-1.5 text-[11.5px] text-muted-foreground md:inline-flex">
                  <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                  {t("nav.navigationMenu", "Navigation menu")}
                </span>
                {isAuthenticated && user ? (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="nav-control gap-2 px-4 hover:border-destructive/30 hover:text-destructive sm:hidden"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden />
                    {t("nav.signOut", "Sign out")}
                  </button>
                ) : (
                  <button type="button" onClick={openSignIn} className="nav-control gap-2 px-4 sm:hidden">
                    <UserCircle2 className="h-3.5 w-3.5" aria-hidden />
                    {t("nav.signIn", "Sign In")}
                  </button>
                )}
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <SignInPortalModal open={signInOpen} onOpenChange={setSignInOpen} />
    </header>
  );
}

function MenuGroup({
  title,
  items,
  pathname,
  onPick,
  t,
}: {
  title?: string;
  items: NavLinkItem[];
  pathname: string;
  onPick: (href: string) => void;
  t: (key: string, fallback?: string) => string;
}) {
  return (
    <div>
      {title ? <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold text-muted-foreground">{title}</p> : null}
      <div className="grid gap-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <a
              key={item.key}
              href={item.href}
              onPointerEnter={() => prefetchRoute(item.href)}
              onClick={(e) => {
                e.preventDefault();
                onPick(item.href);
              }}
              aria-current={active ? "page" : undefined}
              className={`group/item flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 ${
                active ? "bg-primary/10" : "hover:bg-accent"
              }`}
            >
              <span
                className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                  active ? "border-primary/30 bg-primary/[0.12] text-primary" : "border-border bg-foreground/[0.03] text-muted-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold tracking-tight text-foreground">
                  {t(item.labelKey, item.fallback)}
                </span>
                {item.detailKey ? (
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {t(item.detailKey, item.detailFallback)}
                  </span>
                ) : null}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
