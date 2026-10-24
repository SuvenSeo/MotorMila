import * as React from "react";

import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  id?: string;
  as?: "h2" | "h3";
  className?: string;
};

/**
 * SectionHeading — the in-page section title (web/p1-data): footnote eyebrow
 * in primary, title2 display title, body description in label-2, optional
 * actions on the right (stack under the title on mobile).
 */
export function SectionHeading({ eyebrow, title, description, actions, id, as: Heading = "h2", className }: SectionHeadingProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 max-w-2xl">
        {eyebrow ? <p className="mb-1.5 text-footnote font-semibold text-primary">{eyebrow}</p> : null}
        <Heading
          id={id}
          className={cn(
            "font-display font-semibold text-foreground [text-wrap:balance]",
            Heading === "h2" ? "text-title2" : "text-title3",
          )}
        >
          {title}
        </Heading>
        {description ? <p className="mt-2 text-body text-label-2 [text-wrap:pretty]">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
