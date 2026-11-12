import { BRAND } from "@/lib/brand";
import type { I18nText } from "@/lib/translate";

export type PricingTierId = "free" | "pro" | "dealer" | "custom";

/**
 * Translatable copy is an I18nText pair, [locale key, English fallback]:
 * render it with tx(t, pair) (src/lib/translate.ts). The si/ta strings live in
 * src/locales/strings.ts.
 */
export type PricingTier = {
  id: PricingTierId;
  name: I18nText;
  priceLkr: I18nText;
  priceNote?: I18nText;
  annualNote?: I18nText;
  audience: I18nText;
  highlight?: boolean;
  features: I18nText[];
  ctaLabel: I18nText;
  /** Internal route (e.g. /dealer) or mailto: for custom */
  ctaTo: string;
  external?: boolean;
};

export type IcpPersona = {
  title: string;
  pain: string;
  fit: string;
};

export type FaqItem = { q: I18nText; a: I18nText };

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

export const DEALER_TIERS: { code: DealerTierCode; name: I18nText; stock: I18nText; features: I18nText[]; highlight?: boolean }[] = [
  {
    code: "dealer_starter",
    name: ["pricing.dealerTier.starter.name", "Starter"],
    stock: ["pricing.dealerTier.starter.stock", "Up to 20 cars in stock"],
    features: [
      ["pricing.dealerTier.starter.f.priceCheckOnYour", "Price check on your own stock against market medians"],
      ["pricing.dealerTier.starter.f.agingAndPricegapAlerts", "Aging and price-gap alerts"],
      ["pricing.dealerTier.starter.f.leadsFromMotormilaBuyers", "Leads from MotorMila buyers on your stock"],
      ["pricing.dealerTier.starter.f.1Seat", "1 seat"],
    ],
  },
  {
    code: "dealer_pro",
    name: ["pricing.dealerTier.pro.name", "Pro"],
    stock: ["pricing.dealerTier.pro.stock", "Up to 75 cars in stock"],
    highlight: true,
    features: [
      ["pricing.dealerTier.pro.f.everythingInStarter", "Everything in Starter"],
      ["pricing.dealerTier.pro.f.bulkUrlBenchmark", "Bulk URL benchmark"],
      ["pricing.dealerTier.pro.f.verifiedDealerBadge", "Verified dealer badge"],
      ["pricing.dealerTier.pro.f.3Seats", "3 seats"],
    ],
  },
  {
    code: "dealer_yard",
    name: ["pricing.dealerTier.yard.name", "Yard"],
    stock: ["pricing.dealerTier.yard.stock", "Unlimited stock"],
    features: [
      ["pricing.dealerTier.yard.f.everythingInPro", "Everything in Pro"],
      ["pricing.dealerTier.yard.f.multibranchView", "Multi-branch view"],
      ["pricing.dealerTier.yard.f.teamSeatsForSales", "Team seats for sales staff"],
      ["pricing.dealerTier.yard.f.prioritySupport", "Priority support"],
    ],
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
    name: ["pricing.tier.free.name", "Free"],
    priceLkr: ["pricing.tier.free.priceLkr", "LKR 0"],
    priceNote: ["pricing.tier.free.priceNote", "/mo"],
    audience: ["pricing.tier.free.audience", "Browsers and first-time buyers testing the market"],
    features: [
      ["pricing.tier.free.f.searchListingsFromEvery", "Search listings from every source we track"],
      ["pricing.tier.free.f.everySearchResultWith", "Every search result, with full pagination"],
      ["pricing.tier.free.f.priceRangeAndHistory", "Price range and history on every listing"],
      ["pricing.tier.free.f.importTaxCalculator", "Import tax calculator"],
      ["pricing.tier.free.f.6MonthsOfPrice", "6 months of price trends"],
      ["pricing.tier.free.f.latest6TaxCustoms", "Latest 6 tax & customs updates"],
      ["pricing.tier.free.f.1PricedropAlert", "1 price-drop alert"],
    ],
    ctaLabel: ["pricing.tier.free.ctaLabel", "Start browsing"],
    ctaTo: "/",
  },
  {
    id: "pro",
    name: ["pricing.tier.pro.name", "Pro"],
    priceLkr: ["pricing.tier.pro.priceLkr", "Coming soon"],
    annualNote: ["pricing.tier.pro.annualNote", "Planned price LKR 999/mo or LKR 9,990/yr. We'll email you before it starts."],
    audience: ["pricing.tier.pro.audience", "Serious buyers, brokers and anyone who checks prices every week"],
    features: [
      ["pricing.tier.pro.f.dealScoreOnEvery", "Deal score on every listing"],
      ["pricing.tier.pro.f.fullPriceHistoryWith", "Full price history with district and condition filters"],
      ["pricing.tier.pro.f.allTaxCustomsUpdates", "All tax & customs updates"],
      ["pricing.tier.pro.f.moreAlertsIncludingWhatsapp", "More alerts, including WhatsApp"],
      ["pricing.tier.pro.f.csvPdfExports", "CSV / PDF exports"],
    ],
    ctaLabel: ["pricing.tier.pro.ctaLabel", "Notify me"],
    ctaTo: "#get-started",
  },
  {
    id: "dealer",
    name: ["pricing.tier.dealer.name", "Dealer"],
    priceLkr: ["pricing.tier.dealer.priceLkr", "LKR 2,990"],
    priceNote: ["pricing.tier.dealer.priceNote", "/mo · from"],
    annualNote: ["pricing.tier.dealer.annualNote", "Starter · Pro · Yard, priced by stock size"],
    audience: ["pricing.tier.dealer.audience", "Yards and multi-lot dealers running inventory every day"],
    highlight: true,
    features: [
      ["pricing.tier.dealer.f.everythingInPro", "Everything in Pro"],
      ["pricing.tier.dealer.f.fullDealerWorkspaceDealer", "Full Dealer workspace (/dealer)"],
      ["pricing.tier.dealer.f.yourStockPricedAgainst", "Your stock priced against market medians"],
      ["pricing.tier.dealer.f.agingAndPricegapViews", "Aging and price-gap views"],
      ["pricing.tier.dealer.f.leadsFromMotormilaBuyers", "Leads from MotorMila buyers"],
      ["pricing.tier.dealer.f.payByCardWallet", "Pay by card, wallet, bank transfer or KOKO"],
    ],
    ctaLabel: ["pricing.tier.dealer.ctaLabel", "See dealer plans"],
    ctaTo: "#dealer-plans",
  },
  {
    id: "custom",
    name: ["pricing.tier.custom.name", "Custom"],
    priceLkr: ["pricing.tier.custom.priceLkr", "Custom"],
    priceNote: ["pricing.tier.custom.priceNote", "message us"],
    audience: ["pricing.tier.custom.audience", "Banks, leasing desks, multi-branch importers — priced for your scope"],
    features: [
      ["pricing.tier.custom.f.everythingInDealer", "Everything in Dealer"],
      ["pricing.tier.custom.f.partnershipsForLeasingInsurance", "Partnerships for leasing, insurance and import agents"],
      ["pricing.tier.custom.f.seatPacksAndBranded", "Seat packs and branded reports"],
      ["pricing.tier.custom.f.policyAndPortfolioBrief", "Policy and portfolio brief formats"],
      ["pricing.tier.custom.f.dedicatedOnboarding", "Dedicated onboarding"],
    ],
    ctaLabel: ["pricing.tier.custom.ctaLabel", "Message us"],
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

export const PRICING_FAQ: FaqItem[] = [
  {
    q: ["pricing.faq.isMotormilaFree.q", "Is MotorMila free?"],
    a: ["pricing.faq.isMotormilaFree.a", "Yes. Searching listings, price ranges, price history and the import tax calculator are free while MotorMila is in beta. No card needed."],
  },
  {
    q: ["pricing.faq.whenIsProComing.q", "When is Pro coming, and what will it cost?"],
    a: ["pricing.faq.whenIsProComing.a", "Soon. Pro is planned at LKR 999 a month or LKR 9,990 a year. Leave your email and we'll tell you before it launches. Nothing is ever charged without your agreement."],
  },
  {
    q: ["pricing.faq.whereDoTheListings.q", "Where do the listings come from?"],
    a: ["pricing.faq.whereDoTheListings.a", "From public ads on Sri Lankan vehicle sites. Every listing links back to the original ad and names its source."],
  },
  {
    q: ["pricing.faq.iRunADealership.q", "I run a dealership. Is there a plan for me?"],
    a: ["pricing.faq.iRunADealership.a", "Yes. Open \"For dealers\" below to see dealer plans, or message us."],
  },
];

/** Dealer-specific questions, shown inside the dealer section. */
export const DEALER_FAQ: FaqItem[] = [
  {
    q: ["pricing.dealerFaq.whichDealerPlanDo.q", "Which Dealer plan do I need?"],
    a: ["pricing.dealerFaq.whichDealerPlanDo.a", "It depends on stock size: Starter up to 20 vehicles (LKR 2,990/mo), Pro up to 75 (LKR 6,990/mo), Yard unlimited with team seats (LKR 14,990/mo)."],
  },
  {
    q: ["pricing.dealerFaq.howDoIPay.q", "How do I pay?"],
    a: ["pricing.dealerFaq.howDoIPay.a", "By card, Genie, FriMi or eZcash through PayHere, or by bank transfer / KOKO with a WhatsApp receipt (activated within 2 hours)."],
  },
  {
    q: ["pricing.dealerFaq.canICancel.q", "Can I cancel?"],
    a: ["pricing.dealerFaq.canICancel.a", "Yes, any time. Your plan stays active until the end of the period you paid for."],
  },
];
