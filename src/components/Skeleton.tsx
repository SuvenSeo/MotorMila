import { cn } from "@/lib/utils";
import { ListingCardSkeleton } from "@/components/ListingCardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The one Skeleton lives in components/ui/skeleton; re-exported for older imports. */
export { Skeleton };

/** BestPicks-shaped loading skeleton: one featured block + card grid. */
export function CardSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-label="Loading">
      <Skeleton className="h-72 border border-border" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }).map((_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
