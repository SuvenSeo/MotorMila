import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DEFAULT_HERO_VARIANT_ID,
  getHeroVariant,
  isHeroVariantId,
  readStoredHeroVariantId,
  storeHeroVariantId,
  type HeroVariant,
  type HeroVariantId,
} from "@/lib/heroVariants";

/**
 * Local-only hero A/B lab. Enabled in Vite DEV only (never in production).
 * Persists pick in localStorage; also accepts `?hero=<id>`.
 */
export function useHeroVariantLab(): {
  variant: HeroVariant;
  setVariantId: (id: HeroVariantId) => void;
  showPicker: boolean;
} {
  const [params, setParams] = useSearchParams();
  const showPicker = import.meta.env.DEV;

  // Production always renders the shipped hero: no `?hero=` or stored pick.
  const paramId = showPicker ? params.get("hero") : null;
  const initial = showPicker
    ? (isHeroVariantId(paramId) ? paramId : null) ?? readStoredHeroVariantId() ?? DEFAULT_HERO_VARIANT_ID
    : DEFAULT_HERO_VARIANT_ID;

  const [variantId, setVariantIdState] = useState<HeroVariantId>(initial);

  useEffect(() => {
    if (isHeroVariantId(paramId) && paramId !== variantId) {
      setVariantIdState(paramId);
      storeHeroVariantId(paramId);
    }
  }, [paramId, variantId]);

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
