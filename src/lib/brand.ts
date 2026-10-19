// Public contact details come from build env so no personal address/number is
// hard-coded in the bundle. OPS: set VITE_CONTACT_EMAIL (role inbox, e.g.
// hello@<domain>) and optionally VITE_CONTACT_PHONE in Vercel/Cloudflare.
const CONTACT_EMAIL = String(import.meta.env.VITE_CONTACT_EMAIL || "hello@motormila.lk").trim();
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
    markLight: "/logo-mark-light.png",
    icon: "/logo.png",
    wordmark: "/logo-wordmark.png",
    lockup: "/brand-lockup.png",
    sheet: "/brand-sheet.png",
  },
  copilot: "Motormila Copilot",
  contactEmail: CONTACT_EMAIL,
  contactMailto: `mailto:${CONTACT_EMAIL}?subject=Motormila%20custom%20pricing`,
  /** Empty unless VITE_CONTACT_PHONE is set; callers hide the link when empty. */
  contactPhone: CONTACT_PHONE,
  contactPhoneHref: CONTACT_PHONE ? `tel:${CONTACT_PHONE.replace(/\s+/g, "")}` : "",
  origin: "https://motormila.vercel.app",
  vision:
    "Make Sri Lanka’s vehicle market transparent — so every dealer, broker, importer, and serious buyer can see the real price by district, duty, and deal quality.",
  mission:
    "Turn live listings, official DMT/Customs signals, and import-cost math into one trustworthy cockpit for pricing stock, negotiating asks, and moving inventory faster.",
} as const;
