import { useRef, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BellRing, Bookmark, Sparkles } from "lucide-react";
import { AtmosphericImage } from "@/components/AtmosphericImage";
import { BrandLogo } from "@/components/BrandLogo";
import { usePointerParallax } from "@/hooks/usePointerParallax";
import { useAppPreferences } from "@/lib/appPreferences";
import { useReducedMotionOrLowData } from "@/lib/motion";
import { visuals } from "@/lib/visualAssets";
import "@/styles/cinematic.css";

type AuthShellProps = {
  children: ReactNode;
  /** Where the logo goes (home for sign-in, sign-in for sign-up). */
  logoTo?: string;
  logoLabel?: string;
  /** Visual-panel headline: `lead` then an italic blue `accent`. */
  title?: { lead: string; accent: string };
  /** Visual-panel value lines (desktop). Defaults to the sign-in set. */
  bullets?: Array<{ icon: ReactNode; text: string }>;
};

/**
 * Auth frame shared by Sign in and Sign up — the same "Night drive" film
 * language as the home hero. Desktop: form left, a tall cinematic showroom
 * panel right (pointer parallax, light strike, sweep, grain). Mobile: the
 * showroom is a band on top and the form rises over it as a sheet. The form
 * side follows the theme; the visual stays dark in both.
 */
export function AuthShell({ children, logoTo = "/", logoLabel = "Motormila home", title, bullets }: AuthShellProps) {
  const { t } = useAppPreferences();
  const still = useReducedMotionOrLowData();
  const stageRef = useRef<HTMLDivElement>(null);
  usePointerParallax(stageRef, !still);

  const heading = title ?? {
    lead: t("auth.visual.titleLead", "Know the price"),
    accent: t("auth.visual.titleAccent", "before you pay."),
  };
  const lines = bullets ?? [
    { icon: <Bookmark className="h-4 w-4" aria-hidden />, text: t("auth.visual.saved", "Saved vehicles on every device") },
    { icon: <BellRing className="h-4 w-4" aria-hidden />, text: t("auth.visual.alerts", "Price-drop alerts the moment they land") },
    { icon: <Sparkles className="h-4 w-4" aria-hidden />, text: t("auth.visual.aiValue", "AI Value on every ad") },
  ];

  return (
    <div className="relative min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]">
      {/* ── Visual ── */}
      <div className="cine-auth__visual lg:order-2">
        <div ref={stageRef} className="cine-auth__frame">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="cine-depth" data-depth="-16">
              <div className="cine-settle">
                <AtmosphericImage
                  src={visuals.authShowroom.src}
                  srcSm={visuals.authShowroom.srcSm}
                  className="cine-auth__img"
                  priority
                  sizes="(min-width: 1024px) 55vw, 100vw"
                />
              </div>
            </div>
            <div className="cine-depth" data-depth="-30">
              <div className="cine-auth__glow" />
            </div>
            <div className="cine-auth__scrim" />
            <div className="cine-sweep" />
            <div className="cine-grain" />
            <div className="cine-exposure cine-exposure--strike" />
          </div>

          {/* Mobile: logo over the band. */}
          <div className="relative z-10 flex items-start justify-between p-5 sm:p-8 lg:hidden">
            <Link
              to={logoTo}
              className="cine-in cine-on-dark flex w-fit rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              style={{ "--i": 0, "--cine-t0": "0.3s" } as CSSProperties}
              aria-label={logoLabel}
            >
              <BrandLogo size="nav" showTagline={false} />
            </Link>
          </div>

          {/* Desktop: editorial copy at the foot of the panel. */}
          <div className="absolute inset-x-0 bottom-0 z-10 hidden p-10 xl:p-14 lg:block" data-depth="6">
            <p
              className="cine-overline cine-in text-caption font-semibold text-white/75"
              style={{ "--i": 0, "--cine-t0": "0.9s" } as CSSProperties}
            >
              {t("signin.brandWhisper", "Sri Lanka vehicle intelligence")}
            </p>
            <h2 className="cine-auth__title mt-5 max-w-[15ch] text-white">
              <span className="cine-word">
                <span className="cine-word__in" style={{ "--i": 0, "--cine-t0": "1s" } as CSSProperties}>{heading.lead}</span>
              </span>{" "}
              {/* No mask on the accent: its glow must not be clipped. */}
              <em className="cine-accent-in inline-block" style={{ "--i": 2, "--cine-t0": "1s" } as CSSProperties}>
                {heading.accent}
              </em>
            </h2>
            <ul className="mt-8 grid max-w-xl gap-2.5">
              {lines.map((line, i) => (
                <li
                  key={line.text}
                  className="cine-in flex items-center gap-3 text-footnote text-white/85"
                  style={{ "--i": i, "--cine-t0": "1.35s" } as CSSProperties}
                >
                  <span className="cine-auth__icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                    {line.icon}
                  </span>
                  {line.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ── Form ── */}
      <div className="cine-auth__panel flex justify-center px-5 pb-14 pt-9 sm:px-8 lg:order-1 lg:min-h-screen lg:items-center lg:py-14">
        <div className="relative w-full max-w-[26rem]">
          <Link
            to={logoTo}
            className="cine-in mb-12 hidden w-fit rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex"
            style={{ "--i": 0, "--cine-t0": "0.15s" } as CSSProperties}
            aria-label={logoLabel}
          >
            <BrandLogo size="nav" showTagline={false} />
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Staggered rise-in wrapper for auth form blocks (CSS, compositor-only). */
export function AuthIn({ i, children, className }: { i: number; children: ReactNode; className?: string }) {
  return (
    <div className={className ? `cine-in ${className}` : "cine-in"} style={{ "--i": i, "--cine-t0": "0.25s" } as CSSProperties}>
      {children}
    </div>
  );
}
