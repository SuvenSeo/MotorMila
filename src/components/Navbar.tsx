import { BrandLogo } from "@/components/BrandLogo";
import { scrollBehavior } from "@/lib/motion";
import { prefetchRoute } from "@/lib/routePrefetch";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Crown, LogOut, Menu, Search, Settings, UserCircle2, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { SignInPortalModal } from "@/components/SignInPortalModal";
import { Button } from "@/components/ui/button";
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

/**
 * Site header (ui/shell).
 *
 * Desktop: brand · five destinations (Buy, Prices, Tools, Sell, Saved) · search ·
 * data-freshness hint (only when data is behind) · language · account · menu.
 * Mobile: brand · search · menu — the five destinations live in the bottom nav.
 * Every other route is in the menu panel (grouped under its destination) and the
 * footer.
 */
export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { user, logout, isAuthenticated, hasProAccess } = useAuth();
  const { t } = useAppPreferences();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion() ?? false;
  const navSpring = reducedMotion
    ? { duration: 0.2 }
    : { type: "spring" as const, stiffness: 260, damping: 32, mass: 0.7, restDelta: 0.0008 };

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = window.scrollY > 24;
      setIsScrolled((cur) => (cur === next ? cur : next));
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

  // Close the menu panel on navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

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

  return (
    <header
      className="site-nav-header fixed inset-x-0 top-0 z-header pointer-events-none"
      data-scrolled={isScrolled}
      data-nav-mode={isScrolled ? "compact" : "full"}
    >
      <div
        aria-hidden
        className="site-nav-fade absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-background via-background/75 to-transparent"
      />
      <motion.div
        className="site-nav-offset relative flex justify-center"
        initial={false}
        animate={{
          paddingTop: isScrolled ? 16 : 0,
          paddingLeft: isScrolled ? 16 : 0,
          paddingRight: isScrolled ? 16 : 0,
        }}
        transition={navSpring}
      >
        <motion.nav
          className="site-nav nav-glass pointer-events-auto overflow-visible"
          initial={false}
          animate={{ maxWidth: isScrolled ? 1080 : 1480, borderRadius: isScrolled ? 28 : 0 }}
          transition={navSpring}
          aria-label={t("nav.primaryNavigation", "Primary navigation")}
        >
          <motion.div
            className="site-nav__inner relative flex items-center gap-2 px-2 sm:px-3"
            initial={false}
            animate={{
              height: isScrolled ? 64 : 80,
              paddingTop: isScrolled ? 4 : 6,
              paddingBottom: isScrolled ? 4 : 6,
            }}
            transition={navSpring}
          >
            {/* Brand */}
            <Link
              to="/"
              className="site-nav__brand-link group flex shrink-0 items-center rounded-full px-2 no-underline outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/50 sm:px-2.5"
              aria-label={t("nav.homeAria", "Motormila home")}
            >
              <BrandLogo className="site-nav__brand-logo" size="nav" showTagline={false} />
            </Link>

            {/* Five destinations (desktop) */}
            <div className="hidden min-w-0 flex-1 justify-center lg:flex">
              <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-foreground/[0.03] p-1 shadow-inner">
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
                      className={`relative min-w-[4.25rem] max-w-[9rem] truncate rounded-full px-3.5 py-1.5 text-center text-[13px] font-medium tracking-tight no-underline outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary/50 ${
                        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="desktop-nav-pill"
                          className="absolute inset-0 rounded-full bg-card shadow-soft"
                          transition={{ type: "spring", bounce: 0, duration: 0.32 }}
                          aria-hidden
                        />
                      )}
                      <span className="relative z-10">{label(dest)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Right actions */}
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={openCommandPalette}
                className="inline-flex h-9 w-9 items-center justify-center gap-1.5 rounded-full border border-border bg-foreground/[0.03] text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50 xl:w-auto xl:px-3"
                aria-label={t("nav.search", "Search")}
                title={t("nav.searchHint", "Search (Ctrl+K)")}
              >
                <Search className="h-4 w-4" aria-hidden />
                <span className="hidden text-[13px] font-medium tracking-tight xl:inline">{t("nav.search", "Search")}</span>
              </button>

              <NavFreshnessIndicator />

              <div className="hidden md:flex">
                <LocaleSwitcher compact />
              </div>

              <NotificationBell />

              {isAuthenticated && user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="hidden h-9 items-center gap-1.5 rounded-full border border-border bg-foreground/[0.03] pl-2 pr-2.5 text-foreground/85 outline-none transition-colors hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-primary/50 sm:inline-flex"
                      aria-label={t("shell.nav.account", "Your account")}
                    >
                      <UserCircle2 className="h-4 w-4" aria-hidden />
                      <span className="max-w-[7rem] truncate text-[13px] font-medium">{user.name || t("shell.nav.account", "Your account")}</span>
                      <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={10} className="w-56 rounded-2xl">
                    <DropdownMenuLabel className="text-[12px] font-medium text-muted-foreground">
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={openSignIn}
                  className="hidden h-9 gap-1.5 rounded-full border-border bg-transparent px-4 text-foreground/85 hover:bg-foreground/[0.04] hover:text-foreground sm:inline-flex"
                >
                  <UserCircle2 className="h-3.5 w-3.5" aria-hidden />
                  <span className="text-[13px] font-medium tracking-tight">{t("nav.signIn", "Sign In")}</span>
                </Button>
              )}

              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setMenuOpen(false);
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground/85 outline-none transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50"
                aria-label={menuOpen ? t("nav.closeMenu", "Close menu") : t("nav.openMenu", "Open menu")}
                aria-expanded={menuOpen}
                aria-controls="site-menu"
              >
                {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </motion.div>
        </motion.nav>
      </motion.div>

      {/* Menu panel — every route, grouped under its destination */}
      {menuOpen && (
        <div
          id="site-menu"
          className="pointer-events-auto mx-auto mt-2 w-[min(1480px,calc(100vw-16px))] px-2 sm:px-3"
          aria-label={t("nav.navigationMenu", "Navigation menu")}
          onKeyDown={(e) => {
            if (e.key === "Escape") setMenuOpen(false);
          }}
        >
          <div className="ml-auto max-h-[min(78vh,720px)] overflow-y-auto overscroll-contain rounded-3xl border border-border bg-popover/[0.98] p-3.5 shadow-soft-lg md:max-w-[760px]">
            <div className="grid gap-4 sm:grid-cols-2">
              {NAV_DESTINATIONS.map((dest) => (
                <MenuGroup
                  key={dest.id}
                  title={label(dest)}
                  items={dest.items}
                  pathname={pathname}
                  onPick={goTo}
                  t={t}
                />
              ))}
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
              <div className="md:hidden">
                <LocaleSwitcher compact />
              </div>
              {isAuthenticated && user ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:border-destructive/30 hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive/40 sm:hidden"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden />
                  {t("nav.signOut", "Sign out")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openSignIn}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-[13px] font-medium text-foreground/85 outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-primary/50 sm:hidden"
                >
                  <UserCircle2 className="h-3.5 w-3.5" aria-hidden />
                  {t("nav.signIn", "Sign In")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
  title: string;
  items: NavLinkItem[];
  pathname: string;
  onPick: (href: string) => void;
  t: (key: string, fallback?: string) => string;
}) {
  return (
    <div>
      <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold text-muted-foreground">{title}</p>
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
