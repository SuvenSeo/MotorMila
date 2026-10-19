import { cn } from "@/lib/utils";
import { ListingCardSkeleton } from "@/components/ListingCardSkeleton";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton-shimmer rounded-2xl", className)} />;
}

/** BestPicks-shaped loading skeleton: one featured block + card grid. */
export function CardSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-label="Loading">
      <Skeleton className="h-72 rounded-2xl border border-border" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }).map((_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
