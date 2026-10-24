import { Skeleton } from "@/components/ui/skeleton";
import { cardVariants } from "@/components/ui/card";

/** Same geometry as ListingCard (16:10 photo, title row, badges, meter, footer) so the swap never shifts. */
export function ListingCardSkeleton() {
  return (
    <div className={cardVariants({ variant: "media", padding: "none", className: "block h-full" })} aria-hidden>
      <Skeleton className="aspect-[16/10] w-full rounded-none" />
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <Skeleton shape="text" className="h-5 w-3/5" />
          <Skeleton shape="text" className="w-10" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Skeleton shape="text" className="h-6 w-20" />
          <Skeleton shape="text" className="h-6 w-16" />
          <Skeleton shape="text" className="h-6 w-14" />
        </div>
        <Skeleton shape="text" className="h-1.5" />
        <div className="flex items-center justify-between border-t border-separator pt-3">
          <div className="space-y-1.5">
            <Skeleton shape="text" className="h-3.5 w-24" />
            <Skeleton shape="text" className="h-3 w-20" />
          </div>
          <Skeleton shape="circle" className="h-9 w-9" />
        </div>
      </div>
    </div>
  );
}
