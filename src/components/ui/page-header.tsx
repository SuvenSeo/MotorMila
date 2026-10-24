import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type PageHeaderStat = { label: string; value: React.ReactNode; hint?: React.ReactNode };

type PageHeaderProps = {
  /** compact: tools, data pages, legal, account (32px title). large: marketing (hero type). */
  size?: "compact" | "large";
  eyebrow?: React.ReactNode;
  eyebrowIcon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Small factual stats under a compact header (never decorative). */
  stats?: PageHeaderStat[];
  align?: "left" | "center";
  className?: string;
  children?: React.ReactNode;
  /** Rendered as the <h1> (default) or <h2>. */
  as?: "h1" | "h2";
};

/**
 * PageHeader — the one page title block (web/premium-p0).
 * Apple's model: a big headline only for product marketing; inside tools the
 * header is compact so the tool sits above the fold.
 */
export function PageHeader({
  size = "compact",
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  description,
  actions,
  stats,
  align = "left",
  className,
  children,
  as: Heading = "h1",
}: PageHeaderProps) {
  const large = size === "large";
  const centered = align === "center";
  return (
    <header
      className={cn(
        "layout-shell",
        large ? "pb-10 pt-14 sm:pb-14 sm:pt-20" : "pb-6 pt-8 sm:pb-8 sm:pt-10",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col gap-5",
          !centered && actions && "lg:flex-row lg:items-end lg:justify-between",
          centered && "items-center text-center",
        )}
      >
        <div className={cn("min-w-0", centered ? "max-w-3xl" : large ? "max-w-4xl" : "max-w-3xl")}>
          {eyebrow ? (
            <p className={cn("mb-2 inline-flex items-center gap-1.5 text-footnote font-semibold text-primary", large && "mb-4")}>
              {EyebrowIcon ? <EyebrowIcon className="h-4 w-4" aria-hidden /> : null}
              {eyebrow}
            </p>
          ) : null}
          <Heading
            className={cn(
              "font-display font-semibold text-foreground [overflow-wrap:break-word] [text-wrap:balance]",
              large ? "text-hero" : "text-title1",
            )}
          >
            {title}
          </Heading>
          {description ? (
            <p
              className={cn(
                "text-label-2 [text-wrap:pretty]",
                large ? "mt-5 max-w-2xl text-callout" : "mt-2 max-w-2xl text-body",
                centered && "mx-auto",
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className={cn("flex shrink-0 flex-wrap gap-2.5", centered && "justify-center")}>{actions}</div> : null}
      </div>
      {stats?.length ? (
        <dl
          className={cn(
            // Two up on phones; an odd last stat spans the row instead of sitting alone.
            "mt-6 grid grid-cols-2 gap-3 [&>*:last-child:nth-child(odd)]:col-span-2",
            stats.length >= 4
              ? "sm:grid-cols-4 sm:[&>*:last-child:nth-child(odd)]:col-span-1 lg:max-w-4xl"
              : "sm:grid-cols-3 sm:[&>*:last-child:nth-child(odd)]:col-span-1 lg:max-w-3xl",
            centered && "mx-auto",
          )}
        >
          {stats.map((s) => (
            <div key={s.label} className="rounded-card border border-border bg-surface-1 px-4 py-3 shadow-e1">
              <dt className="text-caption text-label-2">{s.label}</dt>
              <dd className="mt-1 text-title3 font-semibold tabular-nums text-foreground">{s.value}</dd>
              {s.hint ? <dd className="mt-0.5 text-caption text-label-2">{s.hint}</dd> : null}
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </header>
  );
}
