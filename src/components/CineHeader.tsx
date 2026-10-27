import type { CSSProperties, ReactNode } from "react";
import { AtmosphericImage } from "@/components/AtmosphericImage";
import type { VisualAsset } from "@/lib/visualAssets";
import "@/styles/cinematic-pages.css";

type CineHeaderProps = {
  eyebrow: ReactNode;
  /** Headline: plain `lead`, then an italic blue `accent`. */
  lead: ReactNode;
  accent?: ReactNode;
  body?: ReactNode;
  /** Optional photo plate on the right (desktop) / behind (mobile). */
  image?: VisualAsset;
  imagePosition?: string;
  children?: ReactNode;
  className?: string;
};

/**
 * Page header in the "Night drive" language: a dark ink band (both themes,
 * tokens scoped with .theme-dark) with an editorial headline, lit by an
 * optional photo plate or two static light pools. One-shot rise on arrival,
 * nothing that loops.
 */
export function CineHeader({ eyebrow, lead, accent, body, image, imagePosition = "70% 50%", children, className }: CineHeaderProps) {
  return (
    <header
      data-nav-stage
      className={`cine-stage theme-dark relative -mt-[var(--nav-offset)] overflow-hidden pt-[var(--nav-offset)] text-foreground ${className ?? ""}`}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {image ? (
          <>
            <AtmosphericImage
              src={image.src}
              srcSm={image.srcSm}
              className="cine-header__img"
              style={{ objectPosition: imagePosition }}
              priority
              sizes="(min-width: 1024px) 60vw, 100vw"
            />
            <div className="cine-header__scrim" />
          </>
        ) : (
          <div className="cine-header__pools" />
        )}
        <div className="cine-grain-static" />
      </div>
      <div className="relative z-10 mx-auto max-w-[1320px] px-5 pb-10 pt-10 sm:px-6 md:pb-14 md:pt-14">
        <p className="cine-eyebrow cine-rise text-white/70" style={{ "--i": 0 } as CSSProperties}>
          {eyebrow}
        </p>
        <h1
          className="cine-display cine-rise mt-4 max-w-[18ch] text-[clamp(2.25rem,1.4rem+3vw,4rem)] text-white"
          style={{ "--i": 1 } as CSSProperties}
        >
          {lead}
          {accent ? (
            <>
              {" "}
              <em>{accent}</em>
            </>
          ) : null}
        </h1>
        {body ? (
          <p className="cine-rise mt-4 max-w-xl text-body leading-relaxed text-white/75" style={{ "--i": 2 } as CSSProperties}>
            {body}
          </p>
        ) : null}
        {children ? (
          <div className="cine-rise mt-6" style={{ "--i": 3 } as CSSProperties}>
            {children}
          </div>
        ) : null}
      </div>
    </header>
  );
}
