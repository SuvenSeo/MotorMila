import { BRAND } from "@/lib/brand";

export type PricingTierId = "free" | "pro" | "dealer" | "custom";

export type PricingTier = {
  id: PricingTierId;
  name: string;
  priceLkr: string;
  priceNote: string;
  annualNote?: string;
  audience: string;
  highlight?: boolean;
  features: string[];
  ctaLabel: string;
  /** Internal route (e.g. /dealer) or mailto: for custom */
  ctaTo: string;
  external?: boolean;
};

export type IcpPersona = {
  title: string;
  pain: string;
  fit: string;
};

export const TRIAL_OFFER = {
  days: 7,
  plan: "pro" as const,
  cta: "Start 7-day free trial",
  ctaTo: "/sign-up",
} as const;

/** Paid plans are in Coming Soon mode: display is hidden, all tier codes/routes/checkout stay intact. */
export const PRICING_COMING_SOON = true as const;

export const COMING_SOON_COPY = {
  badge: "Coming soon",
  note: "Paid plans launch soon — free browse stays open.",
} as const;

export const ANNUAL_SAVE_NUDGE = {
  pro: "Annual saves 2 months — LKR 9,990/yr vs LKR 999/mo",
  dealer: "Annual saves 2 months — LKR 19,990/yr vs LKR 1,999/mo",
} as const;

export const MANUAL_PAY_COPY = {
  title: "Pay manually — activated within 2 hours",
  body: "Bank transfer or KOKO, then WhatsApp us your receipt. We activate your Pro / Dealer seat within 2 hours.",
  cta: "See manual-pay steps",
} as const;

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    priceLkr: "LKR 0",
    priceNote: "/mo",
    audience: "Browsers and first-time buyers testing the market",
    features: [
      "Open every product page (soft limits, not hard locks)",
      "First 12 live listings · page 1 only",
      "Latest 6 Official Pulse signals",
      "Landed-cost calculator (starter)",
      "6-month trends & price-index window",
      "Teaser Best Picks shortlist",
      "1 market alert (no WhatsApp)",
    ],
    ctaLabel: "Open dashboard",
    ctaTo: "/",
  },
  {
    id: "pro",
    name: "Pro",
    priceLkr: "Coming soon",
    priceNote: "launching soon",
    // Live price (kept in code): LKR 999 /mo, LKR 9,990/yr (2 months free)
    annualNote: "Coming soon",
    audience: "Brokers, analysts, and serious buyers who need depth",
    features: [
      "Full Pro terminal (/pro)",
      "Official Pulse history",
      "Deeper alerts and match refresh",
      "Lane drill-downs and source coverage",
      "CSV / PDF export packs",
      "Free trial at launch",
    ],
    ctaLabel: "Join the waitlist",
    ctaTo: "/pricing",
  },
  {
    id: "dealer",
    name: "Dealer",
    priceLkr: "Coming soon",
    priceNote: "launching soon",
    // Live price (kept in code): LKR 1,999 /mo, LKR 19,990/yr (2 months free)
    annualNote: "Coming soon",
    audience: "Yards and multi-lot dealers running inventory every day",
    highlight: true,
    features: [
      "Everything in Pro",
      "Full Dealer workspace (/dealer)",
      "URL benchmark against live comps",
      "Aging and price-gap views",
      "Team seats for sales staff",
      "Claim-profile yard matching on /dealer",
    ],
    ctaLabel: "Open dealer workspace",
    ctaTo: "/dealer",
  },
  {
    id: "custom",
    name: "Custom",
    priceLkr: "Coming soon",
    priceNote: "message us",
    audience: "Banks, leasing desks, multi-branch importers — priced for your scope",
    features: [
      "Everything in Dealer",
      "Custom data feeds and SLAs",
      "Seat packs and branded reports",
      "Policy and portfolio brief formats",
      "Dedicated onboarding",
    ],
    ctaLabel: "Message us",
    ctaTo: BRAND.contactMailto,
    external: true,
  },
];

export const ICP_PERSONAS: IcpPersona[] = [
  {
    title: "Dealers",
    pain: "Aging stock and guesses on asks while buyers quote other yards’ ads.",
    fit: "Dealer workspace, URL benchmark, and team seats keep the lot priced against live comps.",
  },
  {
    title: "Brokers",
    pain: "Clients expect a defensible number, not a gut feel from one board.",
    fit: "Pro terminal, deal scores, and exports turn a shortlist into a brief you can send.",
  },
  {
    title: "Importers",
    pain: "Duty and surcharge shifts erase margin before the car clears.",
    fit: "Calculator plus Official Pulse keep landed-cost scenarios aligned with policy signals.",
  },
  {
    title: "Leasing / banks",
    pain: "Residual and collateral reads lag noisy classified medians.",
    fit: "Custom plans with feeds, price index context, and lane history for portfolio decisions.",
  },
  {
    title: "Insurers",
    pain: "Claims and underwriting need a consistent market read by district and segment.",
    fit: "Index, district velocity, and custom tiers for structured market references.",
  },
  {
    title: "Serious buyers",
    pain: "Hours lost scrolling boards without knowing if an ask is actually cheap.",
    fit: "Free browse to start; Pro when you want alerts, history, and sharper deal confidence.",
  },
];

export const PRICING_FAQ: { q: string; a: string }[] = [
  {
    q: "Why isn’t everything free?",
    a: "Scraping, normalizing, and scoring Sri Lanka’s vehicle boards is ongoing ops cost. Free covers browse and starter tools; Pro and Dealer fund pipeline uptime, pulse depth, and workspaces.",
  },
  {
    q: "Can I try Pro before paying?",
    a: "Pro is coming soon — join the waitlist on this page for a launch invite. We'll notify you when paid plans go live with a free trial.",
  },
  {
    q: "How does Dealer onboarding work?",
    a: "Open /dealer after sign-in. Use Claim your yard to match inventory by seller name or listing URL, then run URL benchmarks against live comps.",
  },
  {
    q: "Is annual billing cheaper?",
    // Live answer (kept in code): "Yes — annual saves 2 months. Pro is LKR 9,990/yr (vs LKR 999/mo) and Dealer is LKR 19,990/yr (vs LKR 1,999/mo)."
    a: "Coming soon — annual pricing will be announced at launch. Free browse stays open meanwhile.",
  },
  {
    q: "How do I pay without a card?",
    a: `Coming soon — bank transfer / KOKO manual pay will go live with paid plans. Contact ${BRAND.contactEmail} meanwhile.`,
  },
  {
    q: "What is Custom?",
    a: "Message us for multi-branch, leasing, bank, or insurer scope — feeds, SLAs, and seat packs. Use the Message us button on this page.",
  },
  {
    q: "Do deal scores work on Free?",
    a: "No — deal scores are a Pro signal. Free can browse listings and tools with soft limits; Pro unlocks scoring on every listing, Best Picks ranking, and deeper lane context.",
  },
];
