import { visuals, type VisualAsset } from "@/lib/visualAssets";

export type HeroAlign = "center" | "left" | "right";
export type HeroTone = "light" | "dark" | "auto";
export type HeroSurfaceKind = "data-evidence" | "data-map" | "photo-stage" | "split-photo" | "cine-stage";

export type HeroVariantId =
  | "evidence"
  | "telemetry-map"
  | "studio-bay"
  | "plaster-gallery"
  | "colombo-split"
  | "night-drive";

export type HeroVariant = {
  id: HeroVariantId;
  code: string;
  tag: string;
  label: string;
  blurb: string;
  rationale: string;
  surfaceKind: HeroSurfaceKind;
  image: VisualAsset | null;
  objectPosition: string;
  imageOpacity: string;
  align: HeroAlign;
  tone: HeroTone;
  hideSideSignals: boolean;
};

/**
 * Redesigned home hero candidates (01–05) + 00 baseline (`night-drive`).
 * Switchable in local dev or on Cloudflare Pages preview subdomains via
 * the floating Hero Preview bar or `?hero=<id>`.
 */
export const HERO_VARIANTS: HeroVariant[] = [
  {
    id: "evidence",
    code: "01",
    tag: "Zero AI Image",
    label: "01 · Evidence Terminal",
    blurb: "Live pricing distribution, median ask & comparable targets right in the hero.",
    rationale: "Replaces synthetic car renders with verifiable valuation proof — FCP stays instant and every number traces to real inventory.",
    surfaceKind: "data-evidence",
    image: null,
    objectPosition: "center center",
    imageOpacity: "opacity-100",
    align: "left",
    tone: "auto",
    hideSideSignals: true,
  },
  {
    id: "telemetry-map",
    code: "02",
    tag: "Real GeoJSON Map",
    label: "02 · Sri Lanka Telemetry",
    blurb: "Interactive 25-district GeoJSON price & supply choropleth replacing fake skylines.",
    rationale: "Reveals Sri Lanka's real regional market spread (Colombo vs. Kandy vs. Kurunegala) and filters inventory directly on click.",
    surfaceKind: "data-map",
    image: null,
    objectPosition: "center center",
    imageOpacity: "opacity-100",
    align: "left",
    tone: "auto",
    hideSideSignals: true,
  },
  {
    id: "studio-bay",
    code: "03",
    tag: "Exact UI · BG Swap",
    label: "03 · Studio Concrete Bay",
    blurb: "Exact live hero (headline, HUD, search & strip unchanged) — swaps only the background photo to the studio bay.",
    rationale: "Keeps production layout, copy, flip words, AI Value HUD, search bar, and strip 100% identical while swapping only the wet night road for the matte concrete studio bay.",
    surfaceKind: "cine-stage",
    image: visuals.pageHomeHeroStudio,
    objectPosition: "80% 52%",
    imageOpacity: "opacity-100",
    align: "left",
    tone: "dark",
    hideSideSignals: true,
  },
  {
    id: "plaster-gallery",
    code: "04",
    tag: "Daylight Gallery",
    label: "04 · Warm Plaster Gallery",
    blurb: "Sunlit tropical plaster gallery in natural daylight — everyday hybrid & ink type.",
    rationale: "Honors 'Light is a gallery' from index.css with warm daylight transparency instead of forced night chrome.",
    surfaceKind: "photo-stage",
    image: visuals.pageHomeHeroPlaster,
    objectPosition: "80% 58%",
    imageOpacity: "opacity-100",
    align: "left",
    tone: "light",
    hideSideSignals: true,
  },
  {
    id: "colombo-split",
    code: "05",
    tag: "35mm Documentary",
    label: "05 · Colombo Street Split",
    blurb: "Clean search left + framed 24px street-level Toyota Aqua documentary card right.",
    rationale: "Framed split keeps typography sharp on solid surface while showcasing local everyday vehicles with zero scrim mud.",
    surfaceKind: "split-photo",
    image: visuals.pageHomeHeroColombo,
    objectPosition: "center 56%",
    imageOpacity: "opacity-100",
    align: "left",
    tone: "auto",
    hideSideSignals: true,
  },
  {
    id: "night-drive",
    code: "00",
    tag: "Current Live",
    label: "00 · Night drive (current)",
    blurb: "Existing live hero — wet coastal road + Lotus Tower + floating AI Value HUD.",
    rationale: "Kept inside this preview switcher so you can compare every new option directly against production.",
    surfaceKind: "cine-stage",
    image: visuals.pageHomeHeroNight,
    objectPosition: "70% 50%",
    imageOpacity: "opacity-100",
    align: "left",
    tone: "dark",
    hideSideSignals: true,
  },
];

/** Default used by local tests, E2E, and non-preview environments. */
export const DEFAULT_HERO_VARIANT_ID: HeroVariantId = "night-drive";

/** Default highlighted when landing on an un-parameterized Cloudflare preview deployment. */
export const PREVIEW_DEFAULT_HERO_VARIANT_ID: HeroVariantId = "studio-bay";

const PRODUCTION_HOSTS = new Set(["motormila.pages.dev", "motormila.com", "www.motormila.com"]);
const STORAGE_KEY = "motormila.hero_variant.v6";

export function isHeroPreviewHost(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  const host = hostname.trim().toLowerCase();
  if (!host || PRODUCTION_HOSTS.has(host)) return false;
  if (host === "localhost" || host === "127.0.0.1") return true;
  return host.endsWith(".motormila.pages.dev");
}

/**
 * Hero switching & `/hero-lab` are active in Vite DEV and on non-production
 * Cloudflare Pages preview subdomains (e.g. `preview-hero-redesigns.motormila.pages.dev`).
 * Never active on live production hosts.
 */
export function isHeroPreviewEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  return isHeroPreviewHost(window.location.hostname);
}

export function isHeroVariantId(value: string | null | undefined): value is HeroVariantId {
  return Boolean(value && HERO_VARIANTS.some((v) => v.id === value));
}

export function getHeroVariant(id: HeroVariantId): HeroVariant {
  return HERO_VARIANTS.find((v) => v.id === id) ?? HERO_VARIANTS[HERO_VARIANTS.length - 1];
}

export function resolveHeroTone(variant: HeroVariant, resolvedTheme: "dark" | "light"): "dark" | "light" {
  if (variant.tone === "dark" || variant.tone === "light") return variant.tone;
  return resolvedTheme;
}

export function readStoredHeroVariantId(): HeroVariantId | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isHeroVariantId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function storeHeroVariantId(id: HeroVariantId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore quota */
  }
}
