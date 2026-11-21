import { Scale } from "lucide-react";
import { CompareGlyph } from "@/components/listing/SaveHeart";
import { toast } from "sonner";
import type { CarListing } from "@/types/car";
import { useAppPreferences } from "@/lib/appPreferences";
import { cn } from "@/lib/utils";
import { toPinnedListing, useCompare } from "./CompareContext";

/**
 * Drop-in "Compare" toggle for any listing surface (cards, detail, hubs).
 * Toasts when the tray is full instead of silently failing.
 */
export function AddToCompareButton({
  listing,
  className,
  size = "sm",
}: {
  listing: Omit<Partial<CarListing>, "id"> & { id: number | string };
  className?: string;
  size?: "sm" | "md";
}) {
  const { has, toggle, max } = useCompare();
  const { t } = useAppPreferences();
  const id = Number(listing.id);
  const active = has(id);

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const result = toggle(toPinnedListing(listing));
        if (!result.ok && result.reason === "full") {
          toast.error(t("compareTray.full", "You can compare up to {max} cars. Remove one first.", { max }));
        }
      }}
      className={cn(
        "inline-flex select-none items-center gap-1.5 rounded-full border font-semibold transition-[background-color,border-color,color,transform] duration-short ease-standard active:scale-[0.97] active:duration-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100",
        size === "sm" ? "h-9 px-3.5 text-footnote" : "h-11 px-4 text-body",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-surface-1 text-foreground hover:bg-surface-2",
        className,
      )}
    >
      <CompareGlyph active={active} idle={Scale} className="h-4 w-4" />
      {active ? t("compareTray.added", "Comparing") : t("compareTray.add", "Compare")}
    </button>
  );
}
