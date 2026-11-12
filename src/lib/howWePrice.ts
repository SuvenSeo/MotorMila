/**
 * Public explainer for FMV / deal badges. Import the path constant from deal
 * badge popovers, FMV explainers and the footer so every "how is this
 * scored?" link lands on the same page.
 */
export const HOW_WE_PRICE_PATH = "/how-we-price";

/** Anchor ids on the page, for deep links from specific badges. */
export const HOW_WE_PRICE_ANCHORS = {
  fmv: "fmv",
  confidence: "confidence",
  askingVsSale: "asking-vs-sale",
  verifyFirst: "verify-first",
  sources: "sources",
  freshness: "freshness",
  limits: "limits",
} as const;

export type HowWePriceAnchor = keyof typeof HOW_WE_PRICE_ANCHORS;

export function howWePriceHref(anchor?: HowWePriceAnchor): string {
  return anchor ? `${HOW_WE_PRICE_PATH}#${HOW_WE_PRICE_ANCHORS[anchor]}` : HOW_WE_PRICE_PATH;
}
