import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { LETTER_SPACING, TYPE_TOKENS } from "@/styles/type-scale";

/**
 * tailwind-merge must know the custom scale names, otherwise `text-caption`
 * reads as a text colour and `cn("text-caption", "text-muted-foreground")`
 * silently drops one of them.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      // body-lg is a component type class (index.css), not a colour.
      "font-size": [{ text: [...TYPE_TOKENS, "body-lg"] }],
      tracking: [{ tracking: Object.keys(LETTER_SPACING) }],
      shadow: [{ shadow: ["e1", "e2", "e3"] }],
      rounded: [{ rounded: ["control", "card", "sheet", "pill"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
