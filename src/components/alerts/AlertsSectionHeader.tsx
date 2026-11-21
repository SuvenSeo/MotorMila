import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface AlertsSectionHeaderProps {
  id: string;
  eyebrow: string;
  title: string;
  aside?: ReactNode;
  className?: string;
}

/** Section header for the alerts page: micro-label eyebrow over a display-type title. */
export function AlertsSectionHeader({ id, eyebrow, title, aside, className }: AlertsSectionHeaderProps) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <p className="text-caption font-semibold uppercase tracking-caps text-label-2">{eyebrow}</p>
        <h2 id={id} className="mt-1 font-display text-title2 font-semibold tracking-tight text-foreground">
          {title}
        </h2>
      </div>
      {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
    </div>
  );
}
