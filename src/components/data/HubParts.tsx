import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { m } from "motion/react";
import { ChevronRight } from "lucide-react";
import { listItem } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { cardVariants } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared building blocks for the make / model / district hubs (web/p1-data):
 * an interactive link tile on the kit Card (hover lift, press, focus ring,
 * capped first-load stagger) and a matching skeleton grid.
 */
export function HubLinkTile({
  to,
  index = 0,
  title,
  meta,
  value,
  icon,
  className,
}: {
  to: string;
  index?: number;
  title: ReactNode;
  /** Small right-aligned figure (count). */
  meta?: ReactNode;
  /** Larger figure under the title (price). */
  value?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <m.li variants={listItem} custom={index} initial="hidden" animate="show" className="min-w-0 list-none">
      <Link
        to={to}
        className={cn(cardVariants({ variant: "interactive", padding: "sm" }), "group flex h-full flex-col no-underline", className)}
      >
        <span className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            {icon}
            <span className="truncate text-callout font-semibold text-foreground">{title}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {meta}
            <ChevronRight
              aria-hidden
              className="h-4 w-4 text-label-3 transition-transform duration-short ease-standard group-hover:translate-x-0.5"
            />
          </span>
        </span>
        {value ? <span className="mt-2 text-title3 font-semibold tabular-nums text-foreground">{value}</span> : null}
      </Link>
    </m.li>
  );
}

export function HubTileGrid({ children, className }: { children: ReactNode; className?: string }) {
  // grid-cols-1 (minmax(0,1fr)) so a long model name truncates instead of widening
  // the implicit track past the phone viewport.
  return <ul className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>{children}</ul>;
}

export function HubTileSkeleton({ count = 6, tall = true }: { count?: number; tall?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={tall ? "h-24" : "h-14"} />
      ))}
    </div>
  );
}
