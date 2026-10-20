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

/**
 * Pro is free during the beta: prices are shown, but there is no Pro checkout
 * and no paywall over listing data yet (see docs/overhaul/money-legal.md).
 * While true, the Pro CTA collects a launch-waitlist email instead of payment.
 * Dealer plans are sold now (PayHere, or bank transfer / KOKO).
 */
export const PRICING_COMING_SOON = true as const;
export const PRO_FREE_DURING_BETA = PRICING_COMING_SOON;

export const COMING_SOON_COPY = {
  badge: "Free during beta",
  note: "MotorMila is free while in beta, no card needed. Pro is coming soon.",
} as const;

/** LKR list prices. Annual = 10x monthly (2 months free). Mirror of backend/app/routers/payhere.py PLAN_CATALOG. */
export const PLAN_PRICES = {
  pro: { monthly: 999, yearly: 9990 },
  dealer_starter: { monthly: 2990, yearly: 29900 },
  dealer_pro: { monthly: 6990, yearly: 69900 },
  dealer_yard: { monthly: 14990, yearly: 149900 },
} as const;

export type DealerTierCode = "dealer_starter" | "dealer_pro" | "dealer_yard";

export const DEALER_TIERS: { code: DealerTierCode; name: string; stock: string; features: string[]; highlight?: boolean }[] = [
  {
    code: "dealer_starter",
    name: "Starter",
    stock: "Up to 20 cars in stock",
    features: ["Price check on your own stock against market medians", "Aging and price-gap alerts", "Leads from MotorMila buyers on your stock", "1 seat"],
  },
  {
    code: "dealer_pro",
    name: "Pro",
    stock: "Up to 75 cars in stock",
    highlight: true,
    features: ["Everything in Starter", "Bulk URL benchmark", "Verified dealer badge", "3 seats"],
  },
  {
    code: "dealer_yard",
    name: "Yard",
    stock: "Unlimited stock",
    features: ["Everything in Pro", "Multi-branch view", "Team seats for sales staff", "Priority support"],
  },
];

export const formatLkr = (n: number) => `LKR ${n.toLocaleString("en-US")}`;

export const ANNUAL_SAVE_NUDGE = {
  pro: "Annual saves 2 months: LKR 9,990/yr vs LKR 999/mo",
  dealer: "Dealer annual saves 2 months: from LKR 29,900/yr vs LKR 2,990/mo",
} as const;

export const MANUAL_PAY_COPY = {
  title: "Pay manually, activated within 2 hours",
  body: "Bank transfer or KOKO, then WhatsApp us your receipt. We activate your Dealer seat within 2 hours.",
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
      "Search listings from every source we track",
      "Every search result, with full pagination",
      "Price range and history on every listing",
      "Import tax calculator",
      "6 months of price trends",
      "Latest 6 tax & customs updates",
      "1 price-drop alert",
    ],
    ctaLabel: "Start browsing",
    ctaTo: "/",
  },
  {
    id: "pro",
    name: "Pro",
    priceLkr: "Coming soon",
    priceNote: "",
    annualNote: "Planned price LKR 999/mo or LKR 9,990/yr. We'll email you before it starts.",
    audience: "Serious buyers, brokers and anyone who checks prices every week",
    features: [
      "Deal score on every listing",
      "Full price history with district and condition filters",
      "All tax & customs updates",
      "More alerts, including WhatsApp",
      "CSV / PDF exports",
    ],
    ctaLabel: "Notify me",
    ctaTo: "#get-started",
  },
  {
    id: "dealer",
    name: "Dealer",
    priceLkr: "LKR 2,990",
    priceNote: "/mo · from",
    annualNote: "Starter · Pro · Yard, priced by stock size",
    audience: "Yards and multi-lot dealers running inventory every day",
    highlight: true,
    features: [
      "Everything in Pro",
      "Full Dealer workspace (/dealer)",
      "Your stock priced against market medians",
      "Aging and price-gap views",
      "Leads from MotorMila buyers",
      "Pay by card, wallet, bank transfer or KOKO",
    ],
    ctaLabel: "See dealer plans",
    ctaTo: "#dealer-plans",
  },
  {
    id: "custom",
    name: "Custom",
    priceLkr: "Custom",
    priceNote: "message us",
    audience: "Banks, leasing desks, multi-branch importers — priced for your scope",
    features: [
      "Everything in Dealer",
      "Partnerships for leasing, insurance and import agents",
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
    pain: "Buyers decide on finance late, often after they've already picked a lender.",
    fit: "Consented leasing requests from buyers looking at a specific car, routed to your team.",
  },
  {
    title: "Insurers",
    pain: "Motor policies are bought in a rush at handover.",
    fit: "Quote requests passed to a licensed broker at the moment the buyer is ready.",
  },
  {
    title: "Serious buyers",
    pain: "Hours lost scrolling boards without knowing if an ask is actually cheap.",
    fit: "Free browse to start; Pro when you want alerts, history, and sharper deal confidence.",
  },
];

export const PRICING_FAQ: { q: string; a: string }[] = [
  {
    q: "Is MotorMila free?",
    a: "Yes. Searching listings, price ranges, price history and the import tax calculator are free while MotorMila is in beta. No card needed.",
  },
  {
    q: "When is Pro coming, and what will it cost?",
    a: "Soon. Pro is planned at LKR 999 a month or LKR 9,990 a year. Leave your email and we'll tell you before it launches. Nothing is ever charged without your agreement.",
  },
  {
    q: "Where do the listings come from?",
    a: "From public ads on Sri Lankan vehicle sites. Every listing links back to the original ad and names its source.",
  },
  {
    q: "I run a dealership. Is there a plan for me?",
    a: "Yes. Open \"For dealers\" below to see dealer plans, or message us.",
  },
];

/** Dealer-specific questions, shown inside the dealer section. */
export const DEALER_FAQ: { q: string; a: string }[] = [
  {
    q: "Which Dealer plan do I need?",
    a: "It depends on stock size: Starter up to 20 vehicles (LKR 2,990/mo), Pro up to 75 (LKR 6,990/mo), Yard unlimited with team seats (LKR 14,990/mo).",
  },
  {
    q: "How do I pay?",
    a: "By card, Genie, FriMi or eZcash through PayHere, or by bank transfer / KOKO with a WhatsApp receipt (activated within 2 hours).",
  },
  {
    q: "Can I cancel?",
    a: "Yes, any time. Your plan stays active until the end of the period you paid for.",
  },
];
