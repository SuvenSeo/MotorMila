import type { CSSProperties } from "react";
import { AtmosphericImage } from "@/components/AtmosphericImage";
import type { HeroVariant } from "@/lib/heroVariants";
import { cn } from "@/lib/utils";

type HeroPlateProps = {
  variant: HeroVariant;
  className?: string;
  style?: CSSProperties;
  priority?: boolean;
  sizes?: string;
};

/**
 * The hero photo plate.
 *
 * Variants with a light-mode plate (`imageLight`) render both photos stacked in
 * the same box; `.hero-plate__img--light` crossfades in under `html.theme-light`,
 * so the theme toggle swaps the photo with a CSS transition — no reload, no
 * React state, and it works for the system theme too.
 */
export function HeroPlate({ variant, className, style, priority = true, sizes = "100vw" }: HeroPlateProps) {
  const light = variant.imageLight;

  return (
    <>
      <AtmosphericImage
        src={variant.image.src}
        srcSm={variant.image.srcSm}
        alt=""
        className={cn("hero-plate__img", light ? "hero-plate__img--dark" : null, className)}
        style={style}
        priority={priority}
        sizes={sizes}
      />
      {light ? (
        <AtmosphericImage
          src={light.src}
          srcSm={light.srcSm}
          alt=""
          className={cn("hero-plate__img hero-plate__img--light", className)}
          style={style}
          priority={priority}
          sizes={sizes}
        />
      ) : null}
    </>
  );
}
