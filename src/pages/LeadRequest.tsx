import { Banknote, ClipboardCheck, ShieldCheck } from "lucide-react";
import { PRIVACY_EMAIL } from "@/components/money/LegalPageShell";
import { LeadRequestForm } from "@/components/money/LeadRequestForm";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ToolGrid, ToolPage } from "@/components/tools/ToolKit";
import { leadCopy, type LeadKind } from "@/lib/leadConsent";
import { useAppPreferences } from "@/lib/appPreferences";

const ICONS = { finance: Banknote, inspection: ClipboardCheck, insurance: ShieldCheck } as const;

type Translate = ReturnType<typeof useAppPreferences>["t"];

function faq(kind: LeadKind, t: Translate): { q: string; a: string }[] {
  switch (kind) {
    case "finance":
      return [
        {
          q: t("tools.lead.faq.finance.q1", "Does MotorMila lend money?"),
          a: t("tools.lead.faq.finance.a1", "No. We pass your request to a leasing or finance company, which makes its own credit decision and sets its own rate."),
        },
        {
          q: t("tools.lead.faq.finance.q2", "Who sees my details?"),
          a: t("tools.lead.faq.finance.a2", "Only the partner named on the form. We never sell your details or use them for unrelated marketing."),
        },
        {
          q: t("tools.lead.faq.finance.q3", "What does it cost me?"),
          a: t("tools.lead.faq.finance.a3", "Nothing. Partners may pay MotorMila a referral fee. That doesn't change your rate."),
        },
      ];
    case "inspection":
      return [
        {
          q: t("tools.lead.faq.inspection.q1", "Who does the inspection?"),
          a: t("tools.lead.faq.inspection.a1", "An independent inspection company. They agree the time, price and location with you directly."),
        },
        {
          q: t("tools.lead.faq.inspection.q2", "What's checked?"),
          a: t(
            "tools.lead.faq.inspection.a2",
            "It depends on the package, but usually body and paint, engine diagnostics, hybrid battery health (for hybrids), underbody and a test drive.",
          ),
        },
        {
          q: t("tools.lead.faq.inspection.q3", "Does MotorMila get paid?"),
          a: t("tools.lead.faq.inspection.a3", "The inspector may pay us a small booking commission. You pay the inspector's normal price."),
        },
      ];
    case "insurance":
      return [
        {
          q: t("tools.lead.faq.insurance.q1", "Is MotorMila an insurer or broker?"),
          a: t(
            "tools.lead.faq.insurance.a1",
            "No. We pass your request to a broker registered with the Insurance Regulatory Commission of Sri Lanka (IRCSL), who gives you quotes and advice.",
          ),
        },
        {
          q: t("tools.lead.faq.insurance.q2", "Who sees my details?"),
          a: t("tools.lead.faq.insurance.a2", "Only the broker named on the form."),
        },
        {
          q: t("tools.lead.faq.insurance.q3", "Does it cost me anything?"),
          a: t("tools.lead.faq.insurance.a3", "No. The broker may pay MotorMila a marketing fee for the introduction."),
        },
      ];
  }
}

export default function LeadRequest({ kind }: { kind: LeadKind }) {
  const { t } = useAppPreferences();
  const copy = leadCopy(kind, t);
  const Icon = ICONS[kind];
  return (
    <ToolPage
      header={<PageHeader eyebrow={t("tools.lead.eyebrow", "Request")} eyebrowIcon={Icon} title={copy.title} description={copy.blurb} />}
    >
      <ToolGrid
        form={
          <Card>
            <LeadRequestForm kind={kind} />
          </Card>
        }
        result={
          <>
            <Card padding="sm" className="sm:p-5">
              <h2 className="text-callout font-semibold text-foreground">{t("tools.lead.faqTitle", "Good to know")}</h2>
              <dl className="mt-3 divide-y divide-separator">
                {faq(kind, t).map((item) => (
                  <div key={item.q} className="py-3 first:pt-0 last:pb-0">
                    <dt className="text-footnote font-semibold text-foreground">{item.q}</dt>
                    <dd className="mt-1 text-footnote text-label-2">{item.a}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <p className="px-1 text-caption text-label-2">
              {t("tools.lead.changedMind", "Changed your mind? Email your phone number to us and we will delete your request:")}{" "}
              <a href={`mailto:${PRIVACY_EMAIL}`} className="font-semibold text-primary underline-offset-2 hover:underline">
                {PRIVACY_EMAIL}
              </a>
            </p>
          </>
        }
      />
    </ToolPage>
  );
}
