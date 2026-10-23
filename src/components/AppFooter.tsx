import { prefersReducedMotion, scrollBehavior, tween } from "@/lib/motion";
import { useAppPreferences } from "@/lib/appPreferences";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { PrefetchLink } from "@/components/PrefetchLink";
import { openFeedbackDialog } from "@/lib/feedbackEvents";
import { HOW_WE_PRICE_PATH } from "@/lib/howWePrice";


function FooterColumn({ title, links }: { title: string; links: Array<{ label: string; to: string }> }) {
  return (
    <div>
      <p className="text-caption font-semibold text-white/50">{title}</p>
      <ul className="mt-6 space-y-4">
        {links.map((link) => (
          <li key={link.label}>
            <PrefetchLink
              to={link.to}
              className="group inline-flex items-center gap-1.5 text-body leading-none text-muted-foreground no-underline transition-colors duration-short hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <span>{link.label}</span>
              <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity duration-short group-hover:opacity-70" />
            </PrefetchLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AppFooter() {
  const year = new Date().getFullYear();
  const reduceMotion = useReducedMotion() ?? prefersReducedMotion();
  const { t } = useAppPreferences();

  const platformLinks = useMemo(
    () => [
      { label: t("nav.home", "Home"), to: "/" },
      { label: t("nav.market", "Market"), to: "/#market" },
      { label: t("nav.trends", "Trends"), to: "/trends" },
      { label: t("nav.calculator", "Calculator"), to: "/calculator" },
    ],
    [t],
  );

  const toolLinks = useMemo(
    () => [
      { label: t("nav.afford", "What can I afford?"), to: "/afford" },
      { label: t("nav.safeTransfer", "Safe-Transfer Kit"), to: "/safe-transfer" },
      { label: t("nav.evHub", "EV Hub"), to: "/ev-hub" },
      { label: t("nav.valuation", "Valuation"), to: "/estimate" },
      { label: t("nav.pricing", "Pricing"), to: "/pricing" },
      { label: t("nav.docs", "Docs"), to: "/docs" },
      { label: t("footer.howWePrice", "How we score prices"), to: HOW_WE_PRICE_PATH },
    ],
    [t],
  );

  const moreLinks = useMemo(
    () => [
      { label: t("nav.mobileApp", "Mobile App"), to: "/mobile-app" },
      { label: t("nav.officialPulse", "Official Pulse"), to: "/official-pulse" },
      { label: t("nav.dealer", "Dealer"), to: "/dealer" },
      { label: t("nav.bestPicks", "Best Picks"), to: "/best-picks" },
      { label: t("nav.compare", "Compare"), to: "/compare" },
      { label: t("nav.leasing", "Leasing quotes"), to: "/finance" },
      { label: t("nav.inspection", "Book an inspection"), to: "/inspection" },
      { label: t("shell.nav.insurance", "Insurance quotes"), to: "/insurance" },
      { label: t("shell.nav.permits", "Import permit prices"), to: "/permits" },
      { label: t("shell.nav.sellVehicle", "Sell your vehicle"), to: "/sell" },
      { label: t("nav.myListings", "My listings"), to: "/profile" },
      { label: t("nav.proPreview", "Pro Preview"), to: "/pro-preview" },
      { label: t("shell.nav.saved", "Saved"), to: "/alerts" },
      { label: t("nav.settings", "Settings"), to: "/settings" },
    ],
    [t],
  );

  const legalLinks = useMemo(
    () => [
      { label: t("footer.privacy", "Privacy Policy"), to: "/privacy" },
      { label: t("footer.terms", "Terms of Use"), to: "/terms" },
      { label: t("footer.cookies", "Cookie notice"), to: "/cookies" },
      { label: t("footer.removal", "Remove a listing"), to: "/removal" },
      { label: t("footer.deleteAccount", "Delete my account"), to: "/delete-account" },
    ],
    [t],
  );

  const studioLinks = useMemo(
    () => [
      { label: t("footer.ardenoStudio", "Ardeno Studio"), href: "https://ardeno-studio-website.vercel.app/", external: true },
    ],
    [t],
  );

  const socialLinks = useMemo(
    () => [
      {
        label: t("footer.ardenoStudio", "Ardeno Studio"),
        href: "https://ardeno-studio-website.vercel.app/",
        icon: ExternalLink,
      },
    ],
    [t],
  );

  return (
    <footer
      className="app-footer relative z-10 overflow-hidden px-3 pb-32 pt-8 sm:pb-36 md:px-6 md:pb-6 md:pt-12"
      aria-labelledby="platform-footer-title"
    >
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 28 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={tween.long}
        className="app-footer__panel relative mx-auto max-w-[1680px] overflow-hidden rounded-[36px] border border-border px-5 py-12 shadow-e3 sm:px-8 md:rounded-[48px] md:px-14 md:py-16 lg:px-20"
      >
        {/* Atmosphere — one quiet brand glow, no noise */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(10,122,255,0.16),transparent_55%),linear-gradient(160deg,#05080f_0%,#060c18_42%,#04070d_100%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[-14rem] top-[-16rem] h-[32rem] w-[32rem] rounded-full bg-[radial-gradient(circle,rgba(10,122,255,0.18),transparent_68%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
        />

        <div className="relative z-10 grid gap-12 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.45fr)] lg:gap-16">
          <div className="max-w-sm">
            <h2 id="platform-footer-title" className="sr-only">
              Motormila
            </h2>
            <PrefetchLink
              to="/"
              className="group inline-flex items-center no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-label={t("footer.homeAria", "Go to Motormila home")}
            >
              <span className="flex flex-col items-start leading-none">
                {/* Footer is always dark: fixed lockup with light lettering. */}
                <img
                  src="/logo-wordmark-dark.svg"
                  alt="MotorMila"
                  width={167}
                  height={28}
                  className="block h-7 w-auto max-w-none"
                  draggable={false}
                  decoding="async"
                />
                <span className="mt-2 text-caption font-medium tracking-normal text-white/45">
                  {t("footer.tagline", "Market Intelligence")}
                </span>
              </span>
            </PrefetchLink>

            <p className="mt-6 text-body leading-7 text-muted-foreground">
              {t(
                "footer.body",
                "Sri Lanka vehicle market intelligence — live listings, fair-value signals, and tools built for buyers and dealers.",
              )}
            </p>

            <motion.div whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: 0.98 }}>
              <PrefetchLink
                to="/pricing"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#0A7AFF] px-6 py-3.5 text-footnote font-semibold text-white no-underline shadow-e2 transition-[filter,background-color] duration-short hover:bg-[#3D94FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
              >
                {t("footer.explorePro", "Explore Pro")}
                <ArrowUpRight className="h-4 w-4" />
              </PrefetchLink>
            </motion.div>
          </div>

          <nav aria-label={t("footer.navAria", "Footer navigation")} className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4 xl:grid-cols-5">
            <FooterColumn title={t("footer.platform", "Platform")} links={platformLinks} />
            <FooterColumn title={t("footer.tools", "Tools")} links={toolLinks} />
            <FooterColumn title={t("footer.more", "More")} links={moreLinks} />
            <FooterColumn title={t("footer.legal", "Legal")} links={legalLinks} />

            <div>
              <p className="text-caption font-semibold text-white/50">{t("footer.studio", "Studio")}</p>
              <ul className="mt-6 space-y-4">
                {studioLinks.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-center gap-1.5 text-body leading-none text-muted-foreground no-underline transition-colors duration-short hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      <span>{link.label}</span>
                      <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity duration-short group-hover:opacity-70" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>

        <div className="relative z-10 mt-16 flex flex-col gap-5 border-t border-border pt-8 md:flex-row md:items-center md:justify-between">
          <p className="text-caption text-muted-foreground">
            {t("footer.copyright", "© {year} Ardeno Studio. Built in Sri Lanka.", { year })}
          </p>

          <div className="flex flex-wrap items-center gap-2.5">
            {socialLinks.map(({ icon: Icon, label, href }) => (
              <motion.a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-foreground/[0.04] text-muted-foreground transition-colors duration-short hover:border-primary/35 hover:bg-primary/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                whileHover={
                  reduceMotion
                    ? undefined
                    : { y: -2, borderColor: "rgba(10,122,255,0.4)", backgroundColor: "rgba(10,122,255,0.14)" }
                }
                whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              >
                <Icon className="h-3.5 w-3.5" />
              </motion.a>
            ))}
            <button
              type="button"
              onClick={() => openFeedbackDialog()}
              className="rounded-full border border-border bg-foreground/[0.04] px-3.5 py-2 text-caption font-medium text-muted-foreground transition-colors duration-short hover:border-primary/35 hover:bg-primary/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {t("shell.nav.feedback", "Send feedback")}
            </button>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
              className="ml-1 rounded-full border border-border bg-foreground/[0.04] px-3.5 py-2 text-caption font-medium text-muted-foreground transition-colors duration-short hover:border-primary/35 hover:bg-primary/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {t("footer.backToTop", "Back to top")}
            </button>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="relative z-0 mt-10 flex select-none items-center justify-center overflow-hidden border-t border-border pt-8 md:mt-12 md:pt-10"
        >
          <span className="app-footer__watermark whitespace-nowrap bg-gradient-to-b from-white/[0.10] via-white/[0.05] to-transparent bg-clip-text font-display text-[clamp(3.4rem,11.5vw,12rem)] font-bold uppercase leading-none tracking-tight text-transparent">
            Motormila
          </span>
        </div>
      </motion.div>
    </footer>
  );
}
