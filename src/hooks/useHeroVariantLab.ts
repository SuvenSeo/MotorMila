import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DEFAULT_HERO_VARIANT_ID,
  PREVIEW_DEFAULT_HERO_VARIANT_ID,
  getHeroVariant,
  isHeroPreviewEnabled,
  isHeroVariantId,
  readStoredHeroVariantId,
  storeHeroVariantId,
  type HeroVariant,
  type HeroVariantId,
} from "@/lib/heroVariants";

/**
 * Hero preview lab hook.
 * Enabled in Vite DEV and on Cloudflare Pages preview subdomains
 * (`*.motormila.pages.dev`). Disabled on production (`motormila.pages.dev`).
 * Accepts `?hero=<id>` and persists the active preview pick in localStorage.
 */
export function useHeroVariantLab(): {
  variant: HeroVariant;
  setVariantId: (id: HeroVariantId) => void;
  showPicker: boolean;
} {
  const [params, setParams] = useSearchParams();
  const showPicker = isHeroPreviewEnabled();

  const paramId = showPicker ? params.get("hero") : null;
  const fallbackId: HeroVariantId =
    !import.meta.env.DEV && showPicker
      ? PREVIEW_DEFAULT_HERO_VARIANT_ID
      : DEFAULT_HERO_VARIANT_ID;

  const initial = showPicker
    ? (isHeroVariantId(paramId) ? paramId : null) ?? readStoredHeroVariantId() ?? fallbackId
    : DEFAULT_HERO_VARIANT_ID;

  const [variantId, setVariantIdState] = useState<HeroVariantId>(initial);

  useEffect(() => {
    if (!showPicker) return;
    if (isHeroVariantId(paramId) && paramId !== variantId) {
      setVariantIdState(paramId);
      storeHeroVariantId(paramId);
    }
  }, [paramId, showPicker, variantId]);

  const setVariantId = (id: HeroVariantId) => {
    setVariantIdState(id);
    storeHeroVariantId(id);
    const next = new URLSearchParams(params);
    next.set("hero", id);
    setParams(next, { replace: true });
  };

  return {
    variant: getHeroVariant(variantId),
    setVariantId,
    showPicker,
  };
}
