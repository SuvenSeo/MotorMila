import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { revealItem } from "@/lib/motion";

/**
 * Effective date shown on every legal page. Set VITE_LEGAL_EFFECTIVE_DATE
 * (e.g. "1 November 2026") at build time; until then the line is hidden
 * rather than showing a bracketed placeholder.
 */
export const LEGAL_EFFECTIVE_DATE = String(import.meta.env.VITE_LEGAL_EFFECTIVE_DATE ?? "").trim();
/** Privacy / data-protection contact. Replace with a real mailbox (e.g. privacy@motormila.lk). */
export const PRIVACY_EMAIL = "privacy@motormila.lk";
export const CONTROLLER_NAME = "MotorMila (operated by [COMPANY NAME] (Pvt) Ltd, PV [REG. NO.])";

export const LEGAL_LINKS = [
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/terms", label: "Terms of Use" },
  { to: "/cookies", label: "Cookie notice" },
  { to: "/removal", label: "Remove a listing or my data" },
  { to: "/delete-account", label: "Delete my account" },
];

export function LegalSection({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="font-display text-title3 font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function LegalPageShell({
  eyebrow = "Legal",
  icon,
  title,
  description,
  showEffectiveDate = true,
  children,
}: {
  eyebrow?: string;
  icon: LucideIcon;
  title: string;
  description: string;
  showEffectiveDate?: boolean;
  children: React.ReactNode;
}) {
  return (
    <PageCanvas>
      <PageHero
        theme="default"
        eyebrow={eyebrow}
        eyebrowIcon={icon}
        watermarkIcon={icon}
        title={<>{title}<span className="text-sheen">.</span></>}
        description={description}
      />
      <PageBody>
        <motion.article
          variants={revealItem}
          className="max-w-3xl space-y-8 text-body leading-7 text-foreground/85 [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5"
        >
          {showEffectiveDate && LEGAL_EFFECTIVE_DATE ? (
            <p className="text-caption text-muted-foreground">Effective date: {LEGAL_EFFECTIVE_DATE}</p>
          ) : null}
          {children}
          <nav aria-label="Legal pages" className="flex flex-wrap gap-2 border-t border-border pt-6 !no-underline">
            {LEGAL_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-caption font-semibold text-foreground !no-underline transition-colors hover:border-primary/40"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </motion.article>
      </PageBody>
    </PageCanvas>
  );
}
