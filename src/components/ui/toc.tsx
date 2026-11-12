import * as React from "react";
import { m } from "motion/react";

import { cn } from "@/lib/utils";
import { spring, usePrefersReducedMotionOrLowData } from "@/lib/motion";

export type TocItem = { id: string; title: React.ReactNode };

/**
 * useScrollSpy — id of the first section currently in the reading band
 * (just under the header). IntersectionObserver only; no scroll listeners.
 */
export function useScrollSpy(ids: string[], rootMargin = "-96px 0px -60% 0px"): string | null {
  const [active, setActive] = React.useState<string | null>(ids[0] ?? null);
  const key = ids.join("|");
  React.useEffect(() => {
    const list = key ? key.split("|") : [];
    setActive(list[0] ?? null);
    if (!list.length || typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        const first = list.find((id) => visible.get(id));
        if (first) setActive(first);
      },
      { rootMargin },
    );
    list.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [key, rootMargin]);
  return active;
}

type TocProps = {
  items: TocItem[];
  active: string | null;
  label: string;
  /** Visible heading above the list (defaults to `label`). */
  heading?: React.ReactNode;
  className?: string;
};

/**
 * Toc — "On this page" list for legal and docs pages. A 2px indicator
 * slides between items (motion layoutId, spring.snappy); snaps under reduced motion.
 */
export function Toc({ items, active, label, heading, className }: TocProps) {
  const calm = usePrefersReducedMotionOrLowData();
  const layoutId = React.useId();
  return (
    <nav aria-label={label} className={className}>
      <p className="mb-3 text-caption font-semibold uppercase tracking-caps text-label-2">{heading ?? label}</p>
      <ul className="space-y-0.5 border-l border-separator">
        {items.map((item) => {
          const on = item.id === active;
          return (
            <li key={item.id} className="relative">
              {on ? (
                <m.span
                  layoutId={`${layoutId}-toc`}
                  aria-hidden
                  className="absolute -left-px top-0 h-full w-0.5 rounded-full bg-primary"
                  transition={calm ? { duration: 0 } : spring.snappy}
                />
              ) : null}
              <a
                href={`#${item.id}`}
                aria-current={on ? "location" : undefined}
                className={cn(
                  "block rounded-control py-1.5 pl-4 pr-2 text-footnote no-underline transition-colors duration-short ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "font-semibold text-foreground" : "text-label-2 hover:text-foreground",
                )}
              >
                {item.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
