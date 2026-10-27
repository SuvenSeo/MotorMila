import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import "@/styles/cinematic-pages.css";

type CineSectionProps = {
  /** Two-digit index ("01"), set in primary. */
  index: string;
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  id?: string;
  className?: string;
  children: ReactNode;
};

/**
 * A numbered editorial section in the "Night drive" language: hairline rule,
 * index, display title, optional lede and actions. Static (no motion).
 */
export function CineSection({ index, title, body, actions, id, className, children }: CineSectionProps) {
  return (
    <section className={cn("cine-section", className)} aria-labelledby={id}>
      <div className="mb-5 flex flex-col gap-3 border-t border-separator pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <div className="flex items-baseline gap-3">
            <span aria-hidden className="font-display text-footnote font-semibold tabular-nums text-primary">{index}</span>
            <h2 id={id} className="font-display text-title3 font-semibold text-foreground [text-wrap:balance]">{title}</h2>
          </div>
          {body ? <p className="mt-1.5 text-footnote text-label-2 [text-wrap:pretty]">{body}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** The header's one hero figure: a big display number over a quiet caption. */
export function CineFigure({ label, value, caption, className }: { label: ReactNode; value: ReactNode; caption?: ReactNode; className?: string }) {
  return (
    <div className={cn("max-w-3xl", className)}>
      <p className="cine-eyebrow text-white/60">{label}</p>
      <p className="cine-display mt-3 text-[clamp(2rem,1.5rem+2vw,3rem)] leading-none tabular-nums text-white">{value}</p>
      {caption ? <p className="mt-2 max-w-xl text-footnote leading-snug text-white/70">{caption}</p> : null}
    </div>
  );
}
