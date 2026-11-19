import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ArrowUpRight, ChevronDown } from "lucide-react";
import { prefetchRoute } from "@/lib/routePrefetch";
import { INSTANT, spring, tween as motionTween } from "@/lib/motion";
import { isDestinationActive, NAV_DESTINATIONS, type NavDestination, type NavDestinationId } from "@/lib/siteNav";
import { cn } from "@/lib/utils";

type T = (key: string, fallback?: string) => string;

type PanelCopy = {
  heading: [key: string, fallback: string];
  subheading: [key: string, fallback: string];
  footer: { text: [key: string, fallback: string]; label: [key: string, fallback: string]; href: string };
};

/**
 * One panel per destination that has something to expand; "Saved" is a single
 * route, so it stays a plain link. The groups and their items come from
 * siteNav, so the header, the phone menu and the footer never drift apart.
 */
const PANEL_COPY: Record<Exclude<NavDestinationId, "saved">, PanelCopy> = {
  buy: {
    heading: ["shell.nav.panel.buyHeading", "Marketplace"],
    subheading: ["shell.nav.panel.buySub", "Cars, bikes, three-wheelers and vans"],
    footer: {
      text: ["shell.nav.panel.buyFoot", "Prices shown in Sri Lankan rupees"],
      label: ["shell.nav.panel.buyFootLink", "How we price"],
      href: "/how-we-price",
    },
  },
  prices: {
    heading: ["shell.nav.panel.pricesHeading", "Market intelligence"],
    subheading: ["shell.nav.panel.pricesSub", "Asking prices, trends and official updates"],
    footer: {
      text: ["shell.nav.panel.pricesFoot", "Built from live asking prices"],
      label: ["shell.nav.panel.pricesFootLink", "How it works"],
      href: "/docs",
    },
  },
  tools: {
    heading: ["shell.nav.panel.toolsHeading", "Costs & paperwork"],
    subheading: ["shell.nav.panel.toolsSub", "Work out the real cost before you commit"],
    footer: {
      text: ["shell.nav.panel.toolsFoot", "Everything is free while Motormila is in beta"],
      label: ["shell.nav.panel.toolsFootLink", "Pricing"],
      href: "/pricing",
    },
  },
  sell: {
    heading: ["shell.nav.panel.sellHeading", "Sell & manage"],
    subheading: ["shell.nav.panel.sellSub", "List a vehicle and keep your ads in order"],
    footer: {
      text: ["shell.nav.panel.sellFoot", "Motormila for Android"],
      label: ["shell.nav.panel.sellFootLink", "Get the app"],
      href: "/mobile-app",
    },
  },
};

const PANEL_ID = "nav-mega-panel";
const PANEL_WIDTH = 380;
/** Hover intent: opening waits a beat, closing gives the pointer time to reach the panel. */
const OPEN_DELAY = 70;
const CLOSE_DELAY = 160;
/** Keep the panel inside the viewport when it hangs off a tab near an edge. */
const VIEWPORT_MARGIN = 8;

function hasPanel(dest: NavDestination): dest is NavDestination & { id: keyof typeof PANEL_COPY } {
  return dest.id !== "saved" && dest.items.length > 1;
}

/**
 * Desktop centre navigation (lg+): the five destinations as one pill cluster.
 * Hovering (or focusing) a destination with more than one route slides a single
 * highlighted pill under the pointer and morphs one shared panel between the
 * groups, so the tray never flickers between menus and the panel's size animates
 * from panel to panel instead of jumping. The panel is centred under the tab
 * that opened it and slides to the next tab's centre, clamped to the viewport.
 *
 * The trigger is still a real link: a click goes to the destination's hub page,
 * ArrowDown opens the panel and moves focus into it, Escape closes it and
 * returns focus. All colour comes from the header tokens, so the over-hero
 * (white ink) state and the scrolled capsule are inherited, not re-implemented.
 */
export function NavMegaMenu({ pathname, calm, t }: { pathname: string; calm: boolean; t: T }) {
  const [openId, setOpenId] = useState<NavDestinationId | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  /** Panel offset inside the cluster, so it sits under the tab that opened it. */
  const [panelX, setPanelX] = useState(0);
  const clusterRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const anchorEl = useRef<HTMLElement | null>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  // Escape closes the panel and hands focus back to the trigger; that focus
  // must not immediately re-open it.
  const suppressFocusOpen = useRef(false);

  /**
   * Centre the panel under `el`, then pull it back inside the viewport. Kept in
   * a ref via anchorEl so a resize can re-run it without reopening anything.
   */
  const anchorTo = useCallback((el: HTMLElement | null) => {
    const cluster = clusterRef.current;
    if (!el || !cluster) return;
    anchorEl.current = el;
    const clusterBox = cluster.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const centred = box.left - clusterBox.left + box.width / 2 - PANEL_WIDTH / 2;
    const clamped = Math.min(
      Math.max(centred, VIEWPORT_MARGIN - clusterBox.left),
      window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN - clusterBox.left,
    );
    setPanelX(clamped);
  }, []);

  useEffect(() => {
    if (!openId) return;
    const onResize = () => anchorTo(anchorEl.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [openId, anchorTo]);

  const clearTimers = useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    openTimer.current = undefined;
    closeTimer.current = undefined;
  }, []);

  const closeNow = useCallback(() => {
    clearTimers();
    setOpenId(null);
    setHoverId(null);
  }, [clearTimers]);

  const scheduleClose = useCallback(() => {
    window.clearTimeout(openTimer.current);
    openTimer.current = undefined;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setOpenId(null);
      setHoverId(null);
    }, CLOSE_DELAY);
  }, []);

  const requestOpen = useCallback(
    (id: Exclude<NavDestinationId, "saved">) => {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
      window.clearTimeout(openTimer.current);
      // With a panel already up, switching groups is instant; the first open
      // waits a beat so a pointer crossing the row never pops a menu.
      openTimer.current = window.setTimeout(() => {
        openTimer.current = undefined;
        setOpenId(id);
      }, openId ? 0 : OPEN_DELAY);
    },
    [openId],
  );

  // The first row of the open panel, after React has committed it.
  const focusFirstItem = useCallback(() => {
    window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLAnchorElement>("a[data-panel-link]")?.focus({ preventScroll: true });
    });
  }, []);

  // A new page closes whatever was open (the click may not have blurred the row).
  useEffect(() => {
    closeNow();
  }, [pathname, closeNow]);

  // Escape works from the page too, not only while the row holds focus.
  useEffect(() => {
    if (!openId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeNow();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openId, closeNow]);

  useEffect(() => clearTimers, [clearTimers]);

  const panelDest = openId ? NAV_DESTINATIONS.find((dest) => dest.id === openId && hasPanel(dest)) : undefined;
  const copy = panelDest ? PANEL_COPY[panelDest.id as keyof typeof PANEL_COPY] : undefined;

  return (
    // Pointer-only hover management around real links; keyboard paths live on
    // the triggers and the panel links themselves.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={clusterRef}
      className="relative flex items-center gap-0.5"
      onPointerLeave={(event) => {
        if (event.pointerType && event.pointerType !== "mouse") return;
        setHoverId(null);
        scheduleClose();
      }}
      onBlur={(event) => {
        // relatedTarget is null when the focused row unmounts (a group swap),
        // so only a real move to something outside closes the panel.
        const next = event.relatedTarget as Node | null;
        if (!next || clusterRef.current?.contains(next)) return;
        closeNow();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !openId) return;
        event.stopPropagation();
        const id = openId;
        closeNow();
        suppressFocusOpen.current = true;
        clusterRef.current?.querySelector<HTMLAnchorElement>(`[data-dest="${id}"]`)?.focus({ preventScroll: true });
      }}
    >
      {NAV_DESTINATIONS.map((dest) => {
        const active = isDestinationActive(dest, pathname);
        const expandable = hasPanel(dest);
        const panelOpen = openId === dest.id;

        return (
          <Link
            key={dest.id}
            to={dest.href}
            data-dest={dest.id}
            data-active={active}
            aria-current={active ? "page" : undefined}
            aria-expanded={expandable ? panelOpen : undefined}
            aria-controls={expandable ? PANEL_ID : undefined}
            onPointerEnter={(event) => {
              if (event.pointerType && event.pointerType !== "mouse") return;
              setHoverId(dest.id);
              if (hasPanel(dest)) {
                anchorTo(event.currentTarget);
                requestOpen(dest.id);
              } else if (openId) scheduleClose();
            }}
            onPointerLeave={(event) => {
              if (event.pointerType && event.pointerType !== "mouse") return;
              setHoverId((current) => (current === dest.id ? null : current));
              scheduleClose();
            }}
            onFocus={(event) => {
              setHoverId(dest.id);
              if (suppressFocusOpen.current) {
                suppressFocusOpen.current = false;
                return;
              }
              if (hasPanel(dest)) {
                window.clearTimeout(openTimer.current);
                openTimer.current = undefined;
                anchorTo(event.currentTarget);
                setOpenId(dest.id);
              }
            }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" || !hasPanel(dest)) return;
              event.preventDefault();
              anchorTo(event.currentTarget);
              setOpenId(dest.id);
              focusFirstItem();
            }}
            className="site-nav__link nav-mega__trigger"
          >
            {active && (
              <motion.span
                layoutId="desktop-nav-pill"
                // Measure only when the route changes, not on every render.
                layoutDependency={pathname}
                className="site-nav__pill"
                transition={calm ? INSTANT : spring.snappy}
                aria-hidden
              />
            )}
            {hoverId === dest.id && (
              <motion.span
                layoutId="nav-mega-hover-pill"
                className="nav-mega__hover-pill"
                transition={calm ? INSTANT : spring.snappy}
                aria-hidden
              />
            )}
            <span className="relative z-10">{t(dest.labelKey, dest.fallback)}</span>
            {expandable && (
              <ChevronDown
                className={cn(
                  "relative z-10 h-3 w-3 opacity-60 transition-transform duration-200 motion-reduce:transition-none",
                  panelOpen && "rotate-180 opacity-100",
                )}
                aria-hidden
              />
            )}
          </Link>
        );
      })}

      {/* Kept in flow so the pointer can travel from a trigger into the panel
          without leaving the cluster (the padding is the travel corridor). */}
      <AnimatePresence>
        {panelDest && copy ? (
          <motion.div
            key="nav-mega-surface"
            ref={panelRef}
            id={PANEL_ID}
            role="group"
            aria-label={t(panelDest.labelKey, panelDest.fallback)}
            initial={calm ? false : { opacity: 0, y: 8, scale: 0.98, x: panelX }}
            animate={{ opacity: 1, y: 0, scale: 1, x: panelX }}
            exit={
              calm
                ? { opacity: 0, transition: INSTANT }
                : { opacity: 0, y: 6, scale: 0.985, transition: motionTween.exit }
            }
            transition={
              calm
                ? INSTANT
                : { x: spring.smooth, opacity: motionTween.enter, y: motionTween.enter, scale: motionTween.enter }
            }
            className="absolute left-0 top-full z-header pt-[18px]"
          >
            <div onPointerEnter={() => window.clearTimeout(closeTimer.current)}>
              <motion.div
                layout
                transition={calm ? INSTANT : spring.smooth}
                className="nav-mega__panel w-[380px] overflow-hidden rounded-2xl border border-border bg-popover shadow-e3"
              >
                {/* A new group fades in while the surface above morphs its
                    height, so the swap reads as one move, not two. */}
                <motion.div
                  key={panelDest.id}
                  initial={calm ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={calm ? INSTANT : motionTween.short}
                >
                  <div className="px-3.5 pb-1.5 pt-3">
                    <p className="px-1.5 text-caption font-semibold uppercase tracking-caps text-muted-foreground">
                      {t(...copy.heading)}
                    </p>
                    <p className="px-1.5 text-caption text-muted-foreground">{t(...copy.subheading)}</p>
                  </div>

                  <div className="grid gap-0.5 px-2 pb-2">
                    {panelDest.items.map((item) => {
                      const Icon = item.icon;
                      const current = pathname === item.href;
                      return (
                        <Link
                          key={item.key}
                          to={item.href}
                          data-panel-link
                          data-current={current}
                          aria-current={current ? "page" : undefined}
                          onPointerEnter={() => prefetchRoute(item.href)}
                          onFocus={() => prefetchRoute(item.href)}
                          className={cn(
                            "group/item flex items-start gap-3 rounded-xl p-2.5 no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50",
                            current ? "bg-primary/[0.08]" : "hover:bg-accent focus-visible:bg-accent",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-px flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                              current
                                ? "border-primary/30 bg-primary/[0.12] text-primary"
                                : "border-border bg-foreground/[0.03] text-muted-foreground group-hover/item:border-primary/30 group-hover/item:bg-primary/[0.12] group-hover/item:text-primary",
                            )}
                          >
                            <Icon className="h-4 w-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-footnote font-semibold tracking-tight text-foreground">
                                {t(item.labelKey, item.fallback)}
                              </span>
                              <ArrowRight
                                className="h-3 w-3 shrink-0 -translate-x-1 text-primary opacity-0 transition-ui group-hover/item:translate-x-0 group-hover/item:opacity-100 motion-reduce:transition-none"
                                aria-hidden
                              />
                            </span>
                            {item.detailKey ? (
                              <span className="mt-0.5 block text-caption leading-snug text-muted-foreground">
                                {t(item.detailKey, item.detailFallback)}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-border bg-foreground/[0.02] px-4 py-2.5">
                    <span className="truncate text-caption text-muted-foreground">{t(...copy.footer.text)}</span>
                    <Link
                      to={copy.footer.href}
                      onPointerEnter={() => prefetchRoute(copy.footer.href)}
                      className="inline-flex shrink-0 items-center gap-1 text-caption font-medium text-foreground no-underline transition-colors hover:text-primary"
                    >
                      {t(...copy.footer.label)}
                      <ArrowUpRight className="h-3 w-3" aria-hidden />
                    </Link>
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
