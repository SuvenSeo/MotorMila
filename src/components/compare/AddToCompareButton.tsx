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
        "inline-flex items-center gap-1.5 rounded-full border font-semibold transition-[background-color,border-color,color,transform] duration-short active:scale-[0.97] motion-reduce:active:scale-100",
        size === "sm" ? "min-h-9 px-3 text-caption" : "min-h-11 px-4 text-footnote",
        active
          ? "border-primary/40 bg-primary/15 text-primary-bright"
          : "border-border bg-card text-foreground hover:border-primary/40",
        className,
      )}
    >
      <CompareGlyph active={active} idle={Scale} className="h-3.5 w-3.5" />
      {active ? t("compareTray.added", "Comparing") : t("compareTray.add", "Compare")}
    </button>
  );
}
