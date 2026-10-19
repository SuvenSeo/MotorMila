/**
 * Canonical Motormila visual assets (repo-root `assets/*.webp`).
 * Each entry ships a full + `-sm` companion for responsive srcSet.
 */
import darkGarageSilhouette from "../../assets/dark_garage_silhouette.webp";
import darkGarageSilhouetteSm from "../../assets/dark_garage_silhouette-sm.webp";
import lostCarFork404 from "../../assets/lost_car_fork_404.webp";
import lostCarFork404Sm from "../../assets/lost_car_fork_404-sm.webp";
import emptyState from "../../assets/empty_state.webp";
import emptyStateSm from "../../assets/empty_state-sm.webp";
import priceIntelligenceBg from "../../assets/price_intelligence_bg.webp";
import priceIntelligenceBgSm from "../../assets/price_intelligence_bg-sm.webp";
import pageAdminBg from "../../assets/page_admin_bg.webp";
import pageAdminBgSm from "../../assets/page_admin_bg-sm.webp";
import trustVerification from "../../assets/trust_verification.webp";
import trustVerificationSm from "../../assets/trust_verification-sm.webp";
import alt2HeroOrangeSunset from "../../assets/alt2_hero_orange_sunset.webp";
import alt2HeroOrangeSunsetSm from "../../assets/alt2_hero_orange_sunset-sm.webp";
import altCategorySuvWhite from "../../assets/alt_category_suv_white.webp";
import altCategorySuvWhiteSm from "../../assets/alt_category_suv_white-sm.webp";
import pageProPremium from "../../assets/page_pro_premium.webp";
import pageProPremiumSm from "../../assets/page_pro_premium-sm.webp";
import alt2PagePricingBg from "../../assets/alt2_page_pricing_bg.webp";
import alt2PagePricingBgSm from "../../assets/alt2_page_pricing_bg-sm.webp";
import alt2BlogTeaPlantation from "../../assets/alt2_blog_tea_plantation.webp";
import alt2BlogTeaPlantationSm from "../../assets/alt2_blog_tea_plantation-sm.webp";
import pageBlogHeader from "../../assets/page_blog_header.webp";
import pageBlogHeaderSm from "../../assets/page_blog_header-sm.webp";
import categoriesLineup from "../../assets/categories_lineup.webp";
import categoriesLineupSm from "../../assets/categories_lineup-sm.webp";
import alt2HeroUltrawidePanorama from "../../assets/alt2_hero_ultrawide_panorama.webp";
import alt2HeroUltrawidePanoramaSm from "../../assets/alt2_hero_ultrawide_panorama-sm.webp";
import pageSearchHero from "../../assets/page_search_hero.webp";
import pageSearchHeroSm from "../../assets/page_search_hero-sm.webp";
import alt2PageInsuranceFinance from "../../assets/alt2_page_insurance_finance.webp";
import alt2PageInsuranceFinanceSm from "../../assets/alt2_page_insurance_finance-sm.webp";
import pageCompareHero from "../../assets/page_compare_hero.webp";
import pageCompareHeroSm from "../../assets/page_compare_hero-sm.webp";
import pageFooterTexture from "../../assets/page_footer_texture.webp";
import pageFooterTextureSm from "../../assets/page_footer_texture-sm.webp";
import pageFaqIllustration from "../../assets/page_faq_illustration.webp";
import pageFaqIllustrationSm from "../../assets/page_faq_illustration-sm.webp";
import pageListingDetail from "../../assets/page_listing_detail.webp";
import pageListingDetailSm from "../../assets/page_listing_detail-sm.webp";
import pageHomeHero from "../../assets/page_home_hero.webp";
import pageHomeHeroSm from "../../assets/page_home_hero-sm.webp";
import pageHomeHeroDusk from "../../assets/page_home_hero_dusk.webp";
import pageHomeHeroDuskSm from "../../assets/page_home_hero_dusk-sm.webp";
import pageHomeHeroCoastal from "../../assets/page_home_hero_coastal.webp";
import pageHomeHeroCoastalSm from "../../assets/page_home_hero_coastal-sm.webp";
import alt2PageFeaturesBg from "../../assets/alt2_page_features_bg.webp";
import alt2PageFeaturesBgSm from "../../assets/alt2_page_features_bg-sm.webp";

export type VisualAsset = {
  src: string;
  srcSm: string;
};

function pair(src: string, srcSm: string): VisualAsset {
  return { src, srcSm };
}

export const visuals = {
  darkGarageSilhouette: pair(darkGarageSilhouette, darkGarageSilhouetteSm),
  lostCarFork404: pair(lostCarFork404, lostCarFork404Sm),
  emptyState: pair(emptyState, emptyStateSm),
  priceIntelligenceBg: pair(priceIntelligenceBg, priceIntelligenceBgSm),
  pageAdminBg: pair(pageAdminBg, pageAdminBgSm),
  trustVerification: pair(trustVerification, trustVerificationSm),
  alt2HeroOrangeSunset: pair(alt2HeroOrangeSunset, alt2HeroOrangeSunsetSm),
  altCategorySuvWhite: pair(altCategorySuvWhite, altCategorySuvWhiteSm),
  pageProPremium: pair(pageProPremium, pageProPremiumSm),
  alt2PagePricingBg: pair(alt2PagePricingBg, alt2PagePricingBgSm),
  alt2BlogTeaPlantation: pair(alt2BlogTeaPlantation, alt2BlogTeaPlantationSm),
  pageBlogHeader: pair(pageBlogHeader, pageBlogHeaderSm),
  categoriesLineup: pair(categoriesLineup, categoriesLineupSm),
  alt2HeroUltrawidePanorama: pair(alt2HeroUltrawidePanorama, alt2HeroUltrawidePanoramaSm),
  pageSearchHero: pair(pageSearchHero, pageSearchHeroSm),
  alt2PageInsuranceFinance: pair(alt2PageInsuranceFinance, alt2PageInsuranceFinanceSm),
  pageCompareHero: pair(pageCompareHero, pageCompareHeroSm),
  pageFooterTexture: pair(pageFooterTexture, pageFooterTextureSm),
  pageFaqIllustration: pair(pageFaqIllustration, pageFaqIllustrationSm),
  pageListingDetail: pair(pageListingDetail, pageListingDetailSm),
  pageHomeHero: pair(pageHomeHero, pageHomeHeroSm),
  pageHomeHeroDusk: pair(pageHomeHeroDusk, pageHomeHeroDuskSm),
  pageHomeHeroCoastal: pair(pageHomeHeroCoastal, pageHomeHeroCoastalSm),
  alt2PageFeaturesBg: pair(alt2PageFeaturesBg, alt2PageFeaturesBgSm),
} as const;

export type VisualKey = keyof typeof visuals;
