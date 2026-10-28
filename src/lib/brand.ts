// Public contact details come from build env so no personal address/number is
// hard-coded in the bundle. OPS: set VITE_CONTACT_EMAIL to override; the
// default is Ardeno Studio's hello@ardenostudio.com. Do not use motormila.lk
// as a contact domain — it is not owned by Motormila or Ardeno Studio.
// Optionally set VITE_CONTACT_PHONE in Vercel/Cloudflare.
const CONTACT_EMAIL = String(import.meta.env.VITE_CONTACT_EMAIL || "hello@ardenostudio.com").trim();
const CONTACT_PHONE = String(import.meta.env.VITE_CONTACT_PHONE || "").trim();

export const BRAND = {
  name: "Motormila",
  siteName: "Motormila",
  tagline: "The fair mila for every motor.",
  subtitle: "Sri Lanka Vehicle Market Intelligence",
  colors: {
    black: "#09090B",
    blue: "#0A7AFF",
  },
  logo: {
    mark: "/logo-mark.png",
    markSvg: "/logo-mark.svg",
    markLight: "/logo-mark-light.png",
    icon: "/logo.png",
    wordmark: "/logo-wordmark.png",
    /** Fixed lockup, outlined SVG: dark lettering (light theme) / light lettering (dark theme). */
    wordmarkLightTheme: "/logo-wordmark-light.svg",
    wordmarkDarkTheme: "/logo-wordmark-dark.svg",
    lockup: "/brand-lockup.png",
    sheet: "/brand-sheet.png",
  },
  contactEmail: CONTACT_EMAIL,
  contactMailto: `mailto:${CONTACT_EMAIL}?subject=Motormila%20custom%20pricing`,
  /** Empty unless VITE_CONTACT_PHONE is set; callers hide the link when empty. */
  contactPhone: CONTACT_PHONE,
  contactPhoneHref: CONTACT_PHONE ? `tel:${CONTACT_PHONE.replace(/\s+/g, "")}` : "",
  origin: "https://motormila.pages.dev",
  vision:
    "Make Sri Lanka’s vehicle market transparent — so every dealer, broker, importer, and serious buyer can see the real price by district, duty, and deal quality.",
  mission:
    "Put every vehicle ad, DMT/Customs update and import-cost sum in one trustworthy place, so buyers and sellers can agree on a fair price faster.",
} as const;
