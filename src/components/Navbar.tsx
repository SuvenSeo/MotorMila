import { BrandLogo } from "@/components/BrandLogo";
import { scrollBehavior } from "@/lib/motion";
import { prefetchRoute } from "@/lib/routePrefetch";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  Crown,
  LogOut,
  Menu,
  MoreHorizontal,
  Scale,
  Search,
  Settings,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Tag,
  UserCircle2,
  Wallet,
  ShieldCheck,
  X,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { SignInPortalModal } from "@/components/SignInPortalModal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePipelineStatus } from "@/hooks/usePipelineStatus";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import { formatRelativeTimeI18n } from "@/lib/formatting";
import { NotificationBell } from "@/components/NotificationBell";
import { openCommandPalette } from "@/lib/commandPalette";

type NavSection = {
  label: string;
  href: string;
  id: string;
  isRoute?: boolean;
  activeOn?: string[];
};

type MoreItem = {
  label: string;
  detail: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type MoreGroup = { id: string; label: string; items: MoreItem[] };

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  const [moreOpen, setMoreOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { user, logout, isAuthenticated, hasProAccess } = useAuth();
  const pipelineStatus = usePipelineStatus();
  const { t } = useAppPreferences();
  const { hash, pathname } = useLocation();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion() ?? false;
  const navSpring = reducedMotion
    ? { duration: 0.2 }
    : { type: "spring" as const, stiffness: 260, damping: 32, mass: 0.7, restDelta: 0.0008 };

  const sections = useMemo<NavSection[]>(
    () => [
      { label: t("nav.home", "Home"), href: "/", id: "home", isRoute: true, activeOn: ["overview"] },
      { label: t("nav.market", "Market"), href: "#market", id: "market" },
      { label: t("nav.trends", "Trends"), href: "/trends", id: "trends", isRoute: true },
      { label: t("nav.calculator", "Calculator"), href: "/calculator", id: "calculator", isRoute: true },
      { label: t("nav.evHub", "EV Hub"), href: "/ev-hub", id: "ev-hub", isRoute: true },
      { label: t("nav.valuation", "Valuation"), href: "/estimate", id: "estimate", isRoute: true },
      { label: t("nav.sell", "Sell"), href: "/sell", id: "sell", isRoute: true },
      { label: t("nav.pricing", "Pricing"), href: "/pricing", id: "pricing", isRoute: true },
    ],
    [t],
  );

  /**
   * Grouped overflow menu. Descriptions are the whole point — a flat list of
   * link names is what made the old "More" menu feel like an afterthought.
   */
  const moreGroups = useMemo<MoreGroup[]>(
    () => [
      {
        id: "market",
        label: t("nav.groupMarket", "Market intelligence"),
        items: [
          {
            label: t("nav.bestPicks", "Best Picks"),
            detail: t("nav.bestPicksDetail", "Score-gated shortlist"),
            href: "/best-picks",
            icon: Star,
          },
          {
            label: t("nav.officialPulse", "Official Pulse"),
            detail: t("nav.officialPulseDetail", "DMT, Customs & news signals"),
            href: "/official-pulse",
            icon: Sparkles,
          },
          {
            label: t("nav.permits", "Permit Market"),
            detail: t("nav.permitsDetail", "Import permit price tracker"),
            href: "/permits",
            icon: Scale,
          },
        ],
      },
      {
        id: "tools",
        label: t("nav.groupTools", "Tools & workspaces"),
        items: [
          {
            label: t("nav.afford", "What can I afford?"),
            detail: t("nav.affordDetail", "Search by cash and monthly budget"),
            href: "/afford",
            icon: Wallet,
          },
          {
            label: t("nav.safeTransfer", "Safe-Transfer Kit"),
            detail: t("nav.safeTransferDetail", "Transfer checklist and sale agreement"),
            href: "/safe-transfer",
            icon: ShieldCheck,
          },
          {
            label: t("nav.compare", "Compare"),
            detail: t("nav.compareDetail", "Put up to three cars side by side"),
            href: "/compare",
            icon: Scale,
          },
          {
            label: t("nav.alerts", "Alerts"),
            detail: t("nav.alertsDetail", "Watchlists and price-drop pings"),
            href: "/alerts",
            icon: Bell,
          },
          {
            label: t("nav.dealer", "Dealer"),
            detail: t("nav.dealerDetail", "Operator command center"),
            href: "/dealer",
            icon: Store,
          },
        ],
      },
      {
        id: "account",
        label: t("nav.groupAccount", "Your account"),
        items: [
          {
            label: t("nav.myListings", "My listings"),
            detail: t("nav.myListingsDetail", "Manage your vehicle ads"),
            href: "/profile",
            icon: UserCircle2,
          },
          isAuthenticated
            ? {
                label: t("nav.proDashboard", "Pro Dashboard"),
                detail: t("nav.proDetail", "Paid market terminal"),
                href: "/pro",
                icon: Crown,
              }
            : {
                label: t("nav.proPreview", "Pro Preview"),
                detail: t("nav.proPreviewDetail", "See the terminal before paying"),
                href: "/pro-preview",
                icon: Crown,
              },
          {
            label: t("nav.settings", "Settings"),
            detail: t("nav.settingsDetail", "Language, theme and preferences"),
            href: "/settings",
            icon: Settings,
          },
          {
            label: t("nav.docs", "Docs"),
            detail: t("nav.docsDetail", "How scoring and data work"),
            href: "/docs",
            icon: BarChart3,
          },
          {
            label: t("nav.mobileApp", "Mobile App"),
            detail: t("nav.mobileAppDetail", "Android APK · releasing soon"),
            href: "/mobile-app",
            icon: Smartphone,
          },
        ],
      },
    ],
    [isAuthenticated, t],
  );

  useEffect(() => {
    if (pathname === "/" && hash) {
      setActiveSection(hash.replace("#", ""));
    }
  }, [hash, pathname]);

  useEffect(() => {
    let frame = 0;

    const updateScrollState = () => {
      frame = 0;
      const nextScrolled = window.scrollY > 24;
      setIsScrolled((current) => (current === nextScrolled ? current : nextScrolled));
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateScrollState);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    updateScrollState();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (pathname !== "/") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible?.target?.id) {
          const nextId = visible.target.id;
          setActiveSection((prev) => (prev === nextId ? prev : nextId));
        }
      },
      { root: null, threshold: [0.55], rootMargin: "-12% 0px -40% 0px" },
    );

    sections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [pathname, sections]);

  const latestSyncIso = useMemo(() => {
    if (!pipelineStatus?.jobs?.length) return null;
    return pipelineStatus.jobs
      .map((job) => job.last_success || job.last_run)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  }, [pipelineStatus]);

  // null = still loading / failed — do not pretend the pipeline is actively syncing.
  const liveState = pipelineStatus?.overall_status ?? null;
  const liveLabel =
    liveState === "ok"
      ? t("nav.live", "Live")
      : liveState === "delayed"
        ? t("nav.delayed", "Delayed")
        : liveState === "running"
          ? t("nav.syncing", "Syncing")
          : t("nav.statusUnknown", "Status unknown");
  const liveFreshnessLabel = latestSyncIso
    ? formatRelativeTimeI18n(latestSyncIso, t)
    : liveState
      ? t("nav.awaiting", "Awaiting sync")
      : t("nav.statusUnavailable", "Unavailable");

  const statusDot =
    liveState === "ok"
      ? "bg-emerald-500"
      : liveState === "delayed"
        ? "bg-primary"
        : liveState === "running"
          ? "bg-primary/70 animate-pulse-soft"
          : "bg-muted-foreground/50";

  const isSectionActive = ({ id, href, activeOn, isRoute }: NavSection) => {
    if (id === "home") {
      return pathname === "/" && (activeSection === "overview" || activeSection === "home");
    }
    if (isRoute) return pathname === href;
    return pathname === "/" && [id, ...(activeOn ?? [])].includes(activeSection);
  };

  const handleScroll = (e: MouseEvent<HTMLAnchorElement>, path: string, isRoute?: boolean) => {
    if (isRoute) {
      e.preventDefault();
      if (path === "/" && pathname === "/") {
        window.scrollTo({ top: 0, behavior: scrollBehavior() });
        setActiveSection("overview");
        setMobileOpen(false);
        return;
      }
      navigate(path);
      setMobileOpen(false);
      return;
    }

    if (!path.startsWith("#")) return;

    e.preventDefault();
    const targetId = path.replace("#", "");

    const scrollToTarget = () => {
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
        setActiveSection(targetId);
      }
      setMobileOpen(false);
    };

    if (pathname === "/") {
      scrollToTarget();
    } else {
      navigate({ pathname: "/", hash: targetId });
      setActiveSection(targetId);
      setMobileOpen(false);
    }
  };

  const onHomeLinkClick = () => {
    setMobileOpen(false);
    setActiveSection("overview");
  };

  const openSignIn = () => {
    setSignInOpen(true);
    setMobileOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate("/sign-in");
    setMobileOpen(false);
  };

  const goTo = (href: string) => {
    setMoreOpen(false);
    setMobileOpen(false);
    navigate(href);
  };

  const mobileAppActive = pathname.startsWith("/mobile-app");

  return (
    <header
      className="site-nav-header fixed inset-x-0 top-0 z-[1000] pointer-events-none"
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
          animate={{
            maxWidth: isScrolled ? 1080 : 1480,
            borderRadius: isScrolled ? 28 : 0,
          }}
          transition={navSpring}
          aria-label={t("nav.primaryNavigation", "Primary navigation")}
        >
          <motion.div
            className="site-nav__inner relative flex items-center px-2 sm:px-3"
            initial={false}
            animate={{
              height: isScrolled ? 64 : 80,
              paddingTop: isScrolled ? 4 : 6,
              paddingBottom: isScrolled ? 4 : 6,
            }}
            transition={navSpring}
          >
            {/* ── Brand ─────────────────────────────────── */}
            <Link
              to="/"
              onClick={onHomeLinkClick}
              className="site-nav__brand-link group flex shrink-0 items-center rounded-full px-2 no-underline outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/50 sm:px-2.5"
              aria-label={t("nav.homeAria", "Motormila home")}
            >
              <span className="relative">
                <BrandLogo className="site-nav__brand-logo" size="nav" showTagline={false} />
                <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-background ${statusDot}`} />
              </span>
            </Link>

            {/* ── Desktop nav tabs ────────────────────────
                Compact (scrolled) mode shows only the first 5 sections so the
                pill never overflows and truncates labels (e.g. "Valuation"
                rendering as "Vali"). Full mode keeps every section. */}
            <div className="hidden min-w-0 flex-1 justify-center lg:flex">
              <div
                className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-foreground/[0.03] p-1 shadow-inner [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: "none" }}
              >
                {(isScrolled ? sections.slice(0, 5) : sections).map((section) => {
                  const active = isSectionActive(section);
                  return (
                    <a
                      key={`${section.id}-${section.label}`}
                      href={section.href}
                      onPointerEnter={() => prefetchRoute(section.href)}
                      onFocus={() => prefetchRoute(section.href)}
                      onClick={(event) => handleScroll(event, section.href, section.isRoute)}
                      aria-current={active ? "page" : undefined}
                      data-active={active}
                      className={`relative whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium tracking-tight no-underline outline-none transition-all duration-200 ease-apple active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/50 2xl:px-3.5 ${
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
                      <span className="relative z-10">{section.label}</span>
                    </a>
                  );
                })}
              </div>
            </div>

            {/* ── Right actions ─────────────────────────── */}
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {/* Search — opens the command palette (touch-friendly; ⌘K/Ctrl+K also works) */}
              <button
                type="button"
                onClick={openCommandPalette}
                className="inline-flex h-8 w-8 items-center justify-center gap-1.5 rounded-full border border-border bg-foreground/[0.03] text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50 sm:w-auto sm:px-3"
                aria-label={t("nav.search", "Search")}
                title={t("nav.searchHint", "Search (Ctrl+K)")}
              >
                <Search className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden text-[13px] font-medium tracking-tight md:inline">
                  {t("nav.search", "Search")}
                </span>
                <kbd
                  className="hidden rounded border border-border bg-foreground/[0.04] px-1 text-[10px] font-semibold lg:inline"
                  aria-hidden
                >
                  ⌘K
                </kbd>
              </button>
              {/* More — grouped mega menu */}
              <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={`hidden h-8 items-center gap-1.5 rounded-full border px-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 md:inline-flex ${
                      moreOpen
                        ? "border-primary/30 bg-primary/10 text-primary-bright"
                        : "border-border bg-foreground/[0.03] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                    }`}
                    aria-label={t("nav.more", "More")}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                    <span className="text-[13px] font-medium tracking-tight">{t("nav.more", "More")}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={10}
                  className="w-[min(94vw,480px)] overflow-hidden rounded-[1.75rem] border border-border bg-popover/95 p-0 text-foreground shadow-[0_28px_80px_-16px_rgba(0,0,0,0.7)] ring-1 ring-foreground/10 backdrop-blur-2xl"
                >
                  <div className="max-h-[min(74vh,620px)] overflow-y-auto overscroll-contain p-2.5">
                    {/* Mobile app spotlight */}
                    <button
                      type="button"
                      onClick={() => goTo("/mobile-app")}
                      onPointerEnter={() => prefetchRoute("/mobile-app")}
                      className="group/mobile relative w-full overflow-hidden rounded-2xl border border-primary/20 bg-[radial-gradient(ellipse_at_top_left,hsl(var(--primary)/0.16),transparent_62%)] px-3.5 py-3 text-left outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      <span className="flex items-start gap-3">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/[0.12]">
                          <Smartphone className="h-4 w-4 text-primary" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold tracking-tight text-foreground">
                              {t("nav.mobileApp", "Mobile App")}
                            </span>
                            <span className="rounded-full border border-amber-400/35 bg-amber-400/[0.12] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-amber-600 dark:text-amber-300">
                              {t("mobile.releasingSoon", "Releasing soon")}
                            </span>
                          </span>
                          <span className="mt-1 block text-[11.5px] leading-relaxed text-muted-foreground">
                            {t(
                              "nav.mobileAppSpotlight",
                              "Live listings, deal scores, price alerts and plate scanning — the Android APK is in final build.",
                            )}
                          </span>
                        </span>
                        <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover/mobile:translate-x-0.5 group-hover/mobile:-translate-y-0.5" aria-hidden />
                      </span>
                    </button>

                    {moreGroups.map((group) => (
                      <div key={group.id} className="mt-2.5">
                        <p className="px-2 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                          {group.label}
                        </p>
                        <div className="grid gap-1 sm:grid-cols-2">
                          {group.items.map((item) => {
                            const Icon = item.icon;
                            const active = pathname === item.href;
                            return (
                              <button
                                key={item.href}
                                type="button"
                                onPointerEnter={() => prefetchRoute(item.href)}
                                onClick={() => goTo(item.href)}
                                aria-current={active ? "page" : undefined}
                                className={`group/item flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 ${
                                  active ? "bg-primary/10" : "hover:bg-accent"
                                }`}
                              >
                                <span
                                  className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                                    active
                                      ? "border-primary/30 bg-primary/[0.12] text-primary"
                                      : "border-border bg-foreground/[0.03] text-muted-foreground group-hover/item:text-foreground"
                                  }`}
                                >
                                  <Icon className="h-3.5 w-3.5" aria-hidden />
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-[12.5px] font-semibold tracking-tight text-foreground">
                                    {item.label}
                                  </span>
                                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                                    {item.detail}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-border bg-foreground/[0.02] px-3.5 py-2.5">
                    <button
                      type="button"
                      onClick={() => goTo("/pricing")}
                      className="text-[11.5px] font-semibold text-primary-bright outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      {t("nav.comparePlans", "Compare plans")}
                    </button>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Locale switcher */}
              <div className="hidden md:flex">
                <LocaleSwitcher compact />
              </div>

              {/* Sell CTA */}
              <button
                type="button"
                onClick={() => navigate("/sell")}
                className="hidden h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[12px] font-semibold text-primary-foreground outline-none shadow-soft transition-all hover:bg-primary/95 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/50 sm:inline-flex"
              >
                <Tag className="h-3.5 w-3.5" aria-hidden />
                {t("nav.sellYourCar", "Sell your car")}
              </button>

              {/* Notification bell */}
              <NotificationBell />

              {/* Live status pill */}
              <div
                className="site-nav__status hidden items-center gap-2 rounded-full border border-border bg-foreground/[0.03] px-3 py-1.5 xl:inline-flex"
                title={`${liveLabel} · ${liveFreshnessLabel}`}
                aria-hidden={isScrolled}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
                <span className="text-[12px] font-medium tracking-tight text-foreground">{liveLabel}</span>
              </div>

              {/* Auth actions */}
              {isAuthenticated && user ? (
                <div className="hidden items-center gap-1 sm:flex">
                  <span
                    className={`inline-flex h-8 items-center rounded-full border px-2.5 text-[11px] font-semibold tracking-[-0.005em] ${
                      hasProAccess
                        ? "border-primary/25 bg-primary/10 text-primary-bright"
                        : "border-border bg-foreground/[0.03] text-muted-foreground"
                    }`}
                  >
                    {user.plan}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate(hasProAccess ? "/pro" : "/pricing")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 text-primary-bright outline-none transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    <Crown className="h-3 w-3" />
                    <span className="text-[13px] font-medium tracking-tight">
                      {hasProAccess ? t("common.pro", "Pro") : t("nav.upgrade", "Upgrade")}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground outline-none transition-colors hover:border-destructive/30 hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive/40"
                    aria-label={t("nav.signOut", "Sign out")}
                  >
                    <LogOut className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={openSignIn}
                  className="hidden h-8 gap-1.5 rounded-full border-border bg-transparent px-4 text-foreground/80 hover:bg-foreground/[0.04] hover:text-foreground sm:inline-flex"
                >
                  <UserCircle2 className="h-3 w-3" />
                  <span className="text-[13px] font-medium tracking-tight">{t("nav.signIn", "Sign In")}</span>
                </Button>
              )}

              {/* Mobile toggle */}
              <button
                type="button"
                onClick={() => setMobileOpen((open) => !open)}
                onKeyDown={(e) => { if (e.key === "Escape") setMobileOpen(false); }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground/80 outline-none transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50 lg:hidden"
                aria-label={mobileOpen ? t("nav.closeMenu", "Close menu") : t("nav.openMenu", "Open menu")}
                aria-expanded={mobileOpen}
                aria-controls="mobile-menu"
              >
                {mobileOpen ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
              </button>
             </div>
           </motion.div>
         </motion.nav>
       </motion.div>

       {/* ── Mobile menu ──────────────────────────────────── */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          className="mx-auto mt-2 w-[min(1480px,calc(100vw-16px))] pointer-events-auto px-2 sm:px-3"
          aria-label={t("nav.navigationMenu", "Navigation menu")}
          onKeyDown={(e) => { if (e.key === "Escape") setMobileOpen(false); }}
        >
          <div className="max-h-[min(78vh,720px)] overflow-y-auto overscroll-contain rounded-3xl border border-border bg-popover/96 p-3.5 shadow-soft-lg backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-4 px-1 pb-3">
              <div>
                <p className="text-[13px] font-semibold tracking-tight text-foreground">Motormila</p>
                <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{t("nav.platform", "Platform")}</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-foreground/[0.03] px-3 py-1">
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
                <span className="text-[11px] font-medium tracking-tight text-foreground">{liveLabel}</span>
              </div>
            </div>

            {/* Mobile app spotlight */}
            <a
              href="/mobile-app"
              onClick={(event) => handleScroll(event, "/mobile-app", true)}
              data-active={mobileAppActive}
              className={`mb-3 flex items-start gap-3 rounded-2xl border px-3.5 py-3 no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 ${
                mobileAppActive
                  ? "border-primary/30 bg-primary/10"
                  : "border-primary/20 bg-primary/[0.06] hover:border-primary/35"
              }`}
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/[0.12]">
                <Smartphone className="h-4 w-4 text-primary" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold tracking-tight text-foreground">
                    {t("nav.mobileApp", "Mobile App")}
                  </span>
                  <span className="rounded-full border border-amber-400/35 bg-amber-400/[0.12] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-amber-600 dark:text-amber-300">
                    {t("mobile.releasingSoon", "Releasing soon")}
                  </span>
                </span>
                <span className="mt-1 block text-[11.5px] leading-relaxed text-muted-foreground">
                  {t("nav.mobileAppDetail", "Android APK · releasing soon")}
                </span>
              </span>
            </a>

            {/* Primary destinations */}
            <div className="grid grid-cols-2 gap-1.5">
              {sections.map((section) => {
                const active = isSectionActive(section);
                return (
                  <a
                    key={`${section.id}-${section.label}`}
                    href={section.href}
                    onClick={(event) => handleScroll(event, section.href, section.isRoute)}
                    aria-current={active ? "page" : undefined}
                    data-active={active}
                    className={`rounded-2xl border px-3 py-2.5 text-center text-[13px] font-medium tracking-tight no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 ${
                      active
                        ? "border-primary/25 bg-primary/10 text-primary-bright"
                        : "border-border text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                    }`}
                  >
                    {section.label}
                  </a>
                );
              })}
            </div>

            {/* Grouped overflow items — same grouping as desktop */}
            {moreGroups.map((group) => (
              <div key={group.id} className="mt-3">
                <p className="px-1 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                  {group.label}
                </p>
                <div className="grid gap-1.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        onClick={(event) => handleScroll(event, item.href, true)}
                        aria-current={active ? "page" : undefined}
                        data-active={active}
                        className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 ${
                          active
                            ? "border-primary/25 bg-primary/10"
                            : "border-border hover:bg-foreground/[0.04]"
                        }`}
                      >
                        <span
                          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                            active ? "border-primary/30 bg-primary/[0.12] text-primary" : "border-border text-muted-foreground"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-semibold tracking-tight text-foreground">
                            {item.label}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{item.detail}</span>
                        </span>
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {isAuthenticated && user ? (
                <>
                  <button
                    type="button"
                    onClick={() => { navigate("/pro"); setMobileOpen(false); }}
                    className="col-span-2 flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2.5 text-primary-bright outline-none transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    <span className="inline-flex items-center gap-2 text-[13px] font-medium tracking-tight">
                      <Crown className="h-3 w-3" />
                      {t("nav.proDashboard", "Pro Dashboard")}
                    </span>
                    <span className="text-[11px] font-medium text-primary/70">{user.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="col-span-2 flex items-center gap-2 rounded-2xl border border-border px-3 py-2.5 text-muted-foreground outline-none transition-colors hover:border-destructive/30 hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive/40"
                  >
                    <LogOut className="h-3 w-3" />
                    <span className="text-[13px] font-medium tracking-tight">{t("nav.signOut", "Sign out")}</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={openSignIn}
                  className="col-span-2 flex items-center justify-between rounded-2xl border border-border px-3 py-2.5 text-foreground/80 outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <span className="inline-flex items-center gap-2 text-[13px] font-medium tracking-tight">
                    <UserCircle2 className="h-3 w-3" />
                    {t("nav.signIn", "Sign In")}
                  </span>
                </button>
              )}
            </div>

            <div className="mt-2.5 flex items-center justify-between rounded-2xl border border-border px-3 py-2">
              <LocaleSwitcher compact />
            </div>
          </div>
        </div>
      )}

      <SignInPortalModal open={signInOpen} onOpenChange={setSignInOpen} />
    </header>
  );
}
