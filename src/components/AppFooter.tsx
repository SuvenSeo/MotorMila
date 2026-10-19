import { prefersReducedMotion, scrollBehavior } from "@/lib/motion";
import { useAppPreferences } from "@/lib/appPreferences";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { PrefetchLink } from "@/components/PrefetchLink";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

function FooterColumn({ title, links }: { title: string; links: Array<{ label: string; to: string }> }) {
  return (
    <div>
      <p className="text-[12px] font-semibold text-white/50">{title}</p>
      <ul className="mt-6 space-y-4">
        {links.map((link) => (
          <li key={link.label}>
            <PrefetchLink
              to={link.to}
              className="group inline-flex items-center gap-1.5 text-[14px] leading-none text-zinc-400 no-underline transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <span>{link.label}</span>
              <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity duration-200 group-hover:opacity-70" />
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
      { label: t("nav.evHub", "EV Hub"), to: "/ev-hub" },
      { label: t("nav.valuation", "Valuation"), to: "/estimate" },
      { label: t("nav.pricing", "Pricing"), to: "/pricing" },
      { label: t("nav.docs", "Docs"), to: "/docs" },
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
      { label: t("nav.proPreview", "Pro Preview"), to: "/pro-preview" },
      { label: t("nav.alerts", "Alerts"), to: "/alerts" },
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
        transition={{ duration: 0.8, ease: EASE }}
        className="app-footer__panel relative mx-auto max-w-[1680px] overflow-hidden rounded-[36px] border border-white/[0.1] px-5 py-12 shadow-[0_-24px_90px_rgba(8,47,73,0.28)] sm:px-8 md:rounded-[48px] md:px-14 md:py-16 lg:px-20"
      >
        {/* Atmosphere — one quiet brand glow, no noise */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(10,122,255,0.16),transparent_55%),linear-gradient(160deg,#05080f_0%,#060c18_42%,#04070d_100%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[-14rem] top-[-16rem] h-[32rem] w-[32rem] rounded-full bg-[radial-gradient(circle,rgba(10,122,255,0.18),transparent_68%)] blur-[110px]"
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
              <img
                src="/logo.png"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 rounded-[22%] object-cover shadow-sm ring-1 ring-white/15"
                decoding="async"
              />
              <span className="flex flex-col leading-none">
                <span className="font-display text-[17px] font-bold tracking-[-0.03em] text-white">
                  Motor<span className="text-[#3D94FF]">mila</span>
                </span>
                <span className="mt-1.5 text-[10px] font-medium tracking-[-0.005em] text-white/45">
                  {t("footer.tagline", "Market Intelligence")}
                </span>
              </span>
            </PrefetchLink>

            <p className="mt-6 text-[14px] leading-7 text-zinc-400">
              {t(
                "footer.body",
                "Sri Lanka vehicle market intelligence — live listings, fair-value signals, and tools built for buyers and dealers.",
              )}
            </p>

            <motion.div whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: 0.98 }}>
              <PrefetchLink
                to="/pricing"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#0A7AFF] px-6 py-3.5 text-[13px] font-semibold text-white no-underline shadow-[0_10px_40px_rgba(10,122,255,0.28)] transition-[filter,background-color] duration-200 hover:bg-[#3D94FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
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
              <p className="text-[12px] font-semibold text-white/50">{t("footer.studio", "Studio")}</p>
              <ul className="mt-6 space-y-4">
                {studioLinks.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-center gap-1.5 text-[14px] leading-none text-zinc-400 no-underline transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      <span>{link.label}</span>
                      <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity duration-200 group-hover:opacity-70" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>

        <div className="relative z-10 mt-16 flex flex-col gap-5 border-t border-white/[0.08] pt-8 md:flex-row md:items-center md:justify-between">
          <p className="text-[12px] text-zinc-500">
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
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-zinc-400 transition-colors duration-200 hover:border-primary/35 hover:bg-primary/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
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
              onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
              className="ml-1 rounded-full border border-white/[0.1] bg-white/[0.04] px-3.5 py-2 text-[12px] font-medium text-zinc-400 transition-colors duration-200 hover:border-primary/35 hover:bg-primary/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {t("footer.backToTop", "Back to top")}
            </button>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="relative z-0 mt-10 flex select-none items-center justify-center overflow-hidden border-t border-white/[0.06] pt-8 md:mt-12 md:pt-10"
        >
          <span className="app-footer__watermark whitespace-nowrap bg-gradient-to-b from-white/[0.10] via-white/[0.05] to-transparent bg-clip-text font-display text-[clamp(3.4rem,11.5vw,12rem)] font-bold uppercase leading-none tracking-[-0.03em] text-transparent">
            Motormila
          </span>
        </div>
      </motion.div>
    </footer>
  );
}
