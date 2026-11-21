import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { VehicleThumbnail } from "@/components/VehicleThumbnail";
import { Button } from "@/components/ui/button";
import { useAppPreferences } from "@/lib/appPreferences";

interface PhotoRailProps {
  images: string[];
  index: number;
  listingId?: number;
  source?: string | null;
  /** Accessible name for one photo ("Photo 3 of 12"), same label the filmstrip uses. */
  label: (i: number) => string;
  onSelect: (i: number) => void;
  onOpenAll: (from: HTMLElement | null) => void;
  className?: string;
}

/**
 * Detail gallery rail (md+): the vertical thumbnail strip that fills the empty
 * dark to the right of the hero frame. It is only a view over the carousel's
 * own state — selection, mounting and the full-screen viewer stay owned by
 * ListingImageCarousel, so the rail can never disagree with the hero.
 */
export function PhotoRail({ images, index, listingId, source, label, onSelect, onOpenAll, className }: PhotoRailProps) {
  const { t } = useAppPreferences();
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Many photos scroll internally: keep the active one visible when the hero
  // is driven from the arrows, the keyboard or the viewer.
  useEffect(() => {
    const list = listRef.current;
    const active = activeRef.current;
    if (!list || !active) return;
    const top = active.offsetTop - (list.clientHeight - active.offsetHeight) / 2;
    list.scrollTop = Math.max(0, top);
  }, [index]);

  return (
    <div className={cn("lp-rail hidden flex-col md:flex", className)}>
      <p className="lp-label shrink-0">{t("listingImage.photoCount", "{n} photos", { n: images.length })}</p>
      <div
        ref={listRef}
        role="group"
        aria-label={t("listingImage.thumbs", "Photo thumbnails")}
        className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5"
      >
        {images.map((src, i) => (
          <button
            key={`rail-${src}-${i}`}
            ref={i === index ? activeRef : undefined}
            type="button"
            aria-pressed={i === index}
            aria-label={label(i)}
            onClick={() => onSelect(i)}
            className={cn(
              "relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-control border border-border transition-opacity duration-short ease-standard",
              i === index ? "" : "opacity-55 hover:opacity-100 focus-visible:opacity-100",
            )}
          >
            <VehicleThumbnail src={src} listingId={listingId} alt="" source={source} sizes="200px" className="h-full w-full object-cover" />
            {i === index && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-control border-2 border-primary" />}
          </button>
        ))}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="xs"
        className="mt-2 w-full shrink-0"
        onClick={(e) => onOpenAll(e.currentTarget)}
      >
        {t("listingImage.viewAll", "View all photos")}
      </Button>
    </div>
  );
}
