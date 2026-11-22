import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one panel anatomy every desk surface uses: label → figure → evidence →
 * footer. Uniform panels are what make a dense screen read as an instrument
 * rather than a pile of cards, so nothing in the Pro workspace draws its own
 * container.
 */
export function Panel({
  label,
  meta,
  value,
  delta,
  hint,
  actions,
  footer,
  children,
  flush = false,
  className,
  bodyClassName,
}: {
  /** Sentence-case label, set in caps at caption size. */
  label: ReactNode;
  /** Right-hand context beside the label (a count, a window). */
  meta?: ReactNode;
  /** The figure itself; use `Figure` for the house style. */
  value?: ReactNode;
  /** A delta chip or verdict pill shown beside the figure. */
  delta?: ReactNode;
  /** One quiet line under the figure. */
  hint?: ReactNode;
  actions?: ReactNode;
  /** Meta line pinned to the bottom: sample size, source, freshness. */
  footer?: ReactNode;
  children?: ReactNode;
  /** Drop the body padding for a table or a chart that should reach the edges. */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col bg-surface-1", className)}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="tech-label text-label-2">{label}</h3>
            {meta ? <span className="text-caption font-medium text-label-3">{meta}</span> : null}
          </div>
          {value || delta ? (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
              {value}
              {delta}
            </div>
          ) : null}
          {hint ? <p className="mt-1.5 text-caption leading-snug text-label-3">{hint}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>
      {children ? (
        <div className={cn("min-w-0 flex-1", flush ? "mt-3" : "px-4 py-3 sm:px-5", bodyClassName)}>{children}</div>
      ) : (
        <div className="flex-1" />
      )}
      {footer ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-separator px-4 py-2 text-caption text-label-3 sm:px-5">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

/**
 * A bay: panels joined by 1px hairlines on the page's own border colour, so a
 * grid of figures reads as one desk rather than separate cards.
 */
export function PanelGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-px overflow-hidden rounded-card border border-border bg-separator", className)}>
      {children}
    </div>
  );
}

/** A titled block on the desk: hairline rule, caps label, optional actions. */
export function DeskSection({
  label,
  title,
  body,
  actions,
  children,
  className,
  id,
}: {
  label?: ReactNode;
  title?: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={cn("min-w-0", className)} aria-labelledby={id}>
      <div className="mb-3 flex flex-col gap-2 border-t border-separator pt-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {label ? <p className="tech-label text-label-3">{label}</p> : null}
          {title ? (
            <h2 id={id} className="mt-1 font-display text-title3 font-semibold tracking-tight text-foreground [text-wrap:balance]">
              {title}
            </h2>
          ) : null}
          {body ? <p className="mt-1 max-w-2xl text-footnote leading-snug text-label-2 [text-wrap:pretty]">{body}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** The house figure: display face, tabular, with a quieter unit tail. */
export function Figure({
  children,
  unit,
  size = "md",
  className,
  tone = "default",
}: {
  children: ReactNode;
  unit?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  tone?: "default" | "primary" | "muted";
}) {
  const sizes = {
    sm: "text-title3",
    md: "text-title1",
    lg: "text-large",
  } as const;
  const tones = {
    default: "text-foreground",
    primary: "text-primary",
    muted: "text-label-2",
  } as const;
  return (
    <p className={cn("font-display font-semibold leading-none tracking-tight tabular-nums", sizes[size], tones[tone], className)}>
      {children}
      {unit ? <span className="ml-1 align-baseline text-footnote font-medium tracking-normal text-label-3">{unit}</span> : null}
    </p>
  );
}
