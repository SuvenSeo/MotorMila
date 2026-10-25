/**
 * Consent wording for lead forms. Versioned: the backend stores the exact
 * text a person agreed to (backend/app/routers/leads.py CONSENT_TEXTS).
 * Change the text => bump the version in BOTH places.
 */
export type LeadKind = "finance" | "inspection" | "insurance";

export const LEAD_CONSENT: Record<LeadKind, { version: string; text: string }> = {
  finance: {
    version: "finance-v1",
    text:
      "I agree that MotorMila may store my name, phone number and the details above and share them with " +
      "the leasing or finance partner(s) listed on this form so they can contact me about a quote. " +
      "Partners are independent companies; MotorMila does not lend money or approve credit. " +
      "I can withdraw consent or ask for my data to be deleted at any time by emailing the privacy contact " +
      "in the Privacy Policy.",
  },
  inspection: {
    version: "inspection-v1",
    text:
      "I agree that MotorMila may store my name, phone number and the details above and share them with " +
      "the inspection partner listed on this form so they can arrange the inspection with me. " +
      "The inspection is carried out by the partner, not by MotorMila. I can withdraw consent or ask for " +
      "my data to be deleted at any time.",
  },
  insurance: {
    version: "insurance-v1",
    text:
      "I agree that MotorMila may store my name, phone number and the details above and pass them to the " +
      "licensed insurance broker listed on this form so they can contact me with a quote. MotorMila is not " +
      "an insurer or insurance broker and does not give insurance advice. I can withdraw consent or ask for " +
      "my data to be deleted at any time.",
  },
};

export const LEAD_COPY: Record<LeadKind, { title: string; blurb: string; partnerLabel: string; cta: string }> = {
  finance: {
    title: "Get a leasing quote",
    blurb: "Tell us what you want to finance. A leasing partner calls you back with a quote, usually within one working day.",
    partnerLabel: "Leasing / finance partner",
    cta: "Request leasing quote",
  },
  inspection: {
    title: "Book a pre-purchase inspection",
    blurb: "An independent inspector checks the vehicle before you pay. Typical cost is about LKR 7,000–9,500, paid to the inspector.",
    partnerLabel: "Inspection partner",
    cta: "Request inspection",
  },
  insurance: {
    title: "Get an insurance quote",
    blurb: "Your request goes to a licensed insurance broker (registered with the IRCSL), who will contact you with quotes.",
    partnerLabel: "Licensed insurance broker",
    cta: "Request insurance quote",
  },
};

type Translate = (key: string, fallback?: string) => string;

/** LEAD_COPY in the reader's language. The consent text above stays English: the backend stores it verbatim. */
export function leadCopy(kind: LeadKind, t: Translate): { title: string; blurb: string; partnerLabel: string; cta: string } {
  const c = LEAD_COPY[kind];
  switch (kind) {
    case "finance":
      return {
        title: t("tools.lead.copy.finance.title", c.title),
        blurb: t("tools.lead.copy.finance.blurb", c.blurb),
        partnerLabel: t("tools.lead.copy.finance.partner", c.partnerLabel),
        cta: t("tools.lead.copy.finance.cta", c.cta),
      };
    case "inspection":
      return {
        title: t("tools.lead.copy.inspection.title", c.title),
        blurb: t("tools.lead.copy.inspection.blurb", c.blurb),
        partnerLabel: t("tools.lead.copy.inspection.partner", c.partnerLabel),
        cta: t("tools.lead.copy.inspection.cta", c.cta),
      };
    case "insurance":
      return {
        title: t("tools.lead.copy.insurance.title", c.title),
        blurb: t("tools.lead.copy.insurance.blurb", c.blurb),
        partnerLabel: t("tools.lead.copy.insurance.partner", c.partnerLabel),
        cta: t("tools.lead.copy.insurance.cta", c.cta),
      };
  }
}
