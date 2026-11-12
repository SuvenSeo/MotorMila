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
  /** Task pages (tools): a shorter band on phones so the form starts sooner. */
  compact?: boolean;
};

/**
 * Page header in the "Night drive" language: a dark ink band (both themes,
 * tokens scoped with .theme-dark) with an editorial headline, lit by an
 * optional photo plate or two static light pools. One-shot rise on arrival,
 * nothing that loops.
 */
export function CineHeader({ eyebrow, lead, accent, body, image, imagePosition = "70% 50%", children, className, compact = false }: CineHeaderProps) {
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
      <div className={`relative z-10 mx-auto max-w-[1320px] px-5 sm:px-6 md:pb-14 md:pt-14 ${compact ? "pb-7 pt-5" : "pb-10 pt-10"}`}>
        <p className="cine-eyebrow cine-rise text-white/70" style={{ "--i": 0 } as CSSProperties}>
          {eyebrow}
        </p>
        <h1
          className={`cine-display cine-rise max-w-[18ch] text-white ${compact ? "mt-3 text-[clamp(2rem,1.3rem+3vw,4rem)]" : "mt-4 text-[clamp(2.25rem,1.4rem+3vw,4rem)]"}`}
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
          <p className={`cine-rise max-w-xl leading-relaxed text-white/75 ${compact ? "mt-3 line-clamp-3 text-footnote sm:mt-4 sm:line-clamp-none sm:text-body" : "mt-4 text-body"}`} style={{ "--i": 2 } as CSSProperties}>
            {body}
          </p>
        ) : null}
        {children ? (
          <div className={`cine-rise ${compact ? "mt-4 sm:mt-6" : "mt-6"}`} style={{ "--i": 3 } as CSSProperties}>
            {children}
          </div>
        ) : null}
      </div>
    </header>
  );
}
