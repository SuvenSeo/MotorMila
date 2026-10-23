import { useLocation } from "react-router-dom";
import { ListingCardSkeleton } from "@/components/ListingCardSkeleton";

/** Route-aware skeleton so lazy chunks never flash a generic spinner. */
export function RouteFallback() {
  const { pathname } = useLocation();
  const isGrid =
    pathname === "/" ||
    pathname === "/best-picks" ||
    pathname.startsWith("/cars/") ||
    pathname.startsWith("/locations/");

  if (isGrid) {
    return (
      <div className="mx-auto min-h-[calc(100svh-var(--nav-offset))] w-full max-w-[1560px] px-5 py-8 sm:px-6" aria-label="Loading" role="status">
        <div className="skeleton-shimmer mb-6 h-8 w-48 rounded-full" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-[calc(100svh-var(--nav-offset))] w-full max-w-[960px] px-5 py-16 sm:px-6" aria-label="Loading" role="status">
      <div className="skeleton-shimmer mb-4 h-3 w-28 rounded-full" />
      <div className="skeleton-shimmer mb-3 h-10 w-2/3 max-w-md rounded-xl" />
      <div className="skeleton-shimmer mb-8 h-4 w-full max-w-xl rounded" />
      <div className="skeleton-shimmer h-64 rounded-2xl" />
    </div>
  );
}
