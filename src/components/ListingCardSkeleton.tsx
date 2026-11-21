import { Skeleton } from "@/components/ui/skeleton";
import { cardVariants } from "@/components/ui/card";

/** Same geometry as ListingCard (4:3 photo, title row, price row, value band, footer) so the swap never shifts. */
export function ListingCardSkeleton() {
  return (
    <div className={cardVariants({ variant: "media", padding: "none", className: "block h-full" })} aria-hidden>
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <Skeleton shape="text" className="h-5 w-3/5" />
          <Skeleton shape="text" className="w-10" />
        </div>
        <Skeleton shape="text" className="h-3.5 w-4/5" />
        <div className="flex items-center justify-between gap-4">
          <Skeleton shape="text" className="h-7 w-2/5" />
          <Skeleton shape="text" className="h-6 w-20" />
        </div>
        <Skeleton shape="text" className="h-14 w-full" />
        <div className="mt-1 flex items-center justify-between border-t border-separator pt-3">
          <div className="space-y-1.5">
            <Skeleton shape="text" className="h-3.5 w-24" />
            <Skeleton shape="text" className="h-3 w-20" />
          </div>
          <Skeleton shape="text" className="h-4 w-16" />
        </div>
      </div>
    </div>
  );
}
