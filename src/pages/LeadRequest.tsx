import { Banknote, ClipboardCheck, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { PRIVACY_EMAIL } from "@/components/money/LegalPageShell";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { LeadRequestForm } from "@/components/money/LeadRequestForm";
import { LEAD_COPY, type LeadKind } from "@/lib/leadConsent";
import { revealItem } from "@/lib/motion";

const ICONS = { finance: Banknote, inspection: ClipboardCheck, insurance: ShieldCheck } as const;

const FAQ: Record<LeadKind, { q: string; a: string }[]> = {
  finance: [
    { q: "Does MotorMila lend money?", a: "No. We pass your request to a leasing or finance company, which makes its own credit decision and sets its own rate." },
    { q: "Who sees my details?", a: "Only the partner named on the form. We never sell your details or use them for unrelated marketing." },
    { q: "What does it cost me?", a: "Nothing. Partners may pay MotorMila a referral fee. That doesn't change your rate." },
  ],
  inspection: [
    { q: "Who does the inspection?", a: "An independent inspection company. They agree the time, price and location with you directly." },
    { q: "What's checked?", a: "It depends on the package, but usually body and paint, engine diagnostics, hybrid battery health (for hybrids), underbody and a test drive." },
    { q: "Does MotorMila get paid?", a: "The inspector may pay us a small booking commission. You pay the inspector's normal price." },
  ],
  insurance: [
    { q: "Is MotorMila an insurer or broker?", a: "No. We pass your request to a broker registered with the Insurance Regulatory Commission of Sri Lanka (IRCSL), who gives you quotes and advice." },
    { q: "Who sees my details?", a: "Only the broker named on the form." },
    { q: "Does it cost me anything?", a: "No. The broker may pay MotorMila a marketing fee for the introduction." },
  ],
};

export default function LeadRequest({ kind }: { kind: LeadKind }) {
  const copy = LEAD_COPY[kind];
  const Icon = ICONS[kind];
  return (
    <PageCanvas>
      <PageHero theme="default" eyebrow="Request" eyebrowIcon={Icon} watermarkIcon={Icon} title={<>{copy.title}<span className="text-sheen">.</span></>} description={copy.blurb} />
      <PageBody className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <motion.div variants={revealItem} className="rounded-[1.75rem] border border-border bg-card p-6 shadow-soft">
          <LeadRequestForm kind={kind} />
        </motion.div>
        <motion.aside variants={revealItem} className="space-y-4">
          {FAQ[kind].map((item) => (
            <div key={item.q} className="rounded-2xl border border-border bg-card/40 p-4">
              <h2 className="text-footnote font-bold text-foreground">{item.q}</h2>
              <p className="mt-1.5 text-caption leading-relaxed text-muted-foreground">{item.a}</p>
            </div>
          ))}
          <p className="text-caption text-muted-foreground">
            Changed your mind? Email <a href={`mailto:${PRIVACY_EMAIL}`} className="underline underline-offset-2">{PRIVACY_EMAIL}</a> with your phone number and we will delete your request.
          </p>
        </motion.aside>
      </PageBody>
    </PageCanvas>
  );
}
