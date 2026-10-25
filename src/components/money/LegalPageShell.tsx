import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { m } from "motion/react";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHeader } from "@/components/ui/page-header";
import { fadeUp } from "@/lib/motion";
import { Toc, useScrollSpy, type TocItem } from "@/components/ui/toc";
import { useAppPreferences } from "@/lib/appPreferences";
import { cn } from "@/lib/utils";

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
  { to: "/privacy", label: "Privacy Policy", key: "acct.legal.link.privacy" },
  { to: "/terms", label: "Terms of Use", key: "acct.legal.link.terms" },
  { to: "/cookies", label: "Cookie notice", key: "acct.legal.link.cookies" },
  { to: "/removal", label: "Remove a listing or my data", key: "acct.legal.link.removal" },
  { to: "/delete-account", label: "Delete my account", key: "acct.legal.link.delete" },
];

function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/^\d+\.\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function LegalSection({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id ?? slugify(title)} data-legal-section={title} className="scroll-mt-28 space-y-3">
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
  const { t } = useAppPreferences();
  const articleRef = useRef<HTMLElement>(null);
  const [toc, setToc] = useState<TocItem[]>([]);

  // Build the TOC from the rendered sections; useScrollSpy follows the reader.
  useEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>("section[data-legal-section]"));
    const next = sections.map((s) => ({ id: s.id, title: s.dataset.legalSection ?? "" }));
    const sig = (list: { id: string; title: unknown }[]) => list.map((i) => `${i.id}:${String(i.title)}`).join("|");
    setToc((prev) => (sig(prev) === sig(next) ? prev : next));
  }, [children]);
  const active = useScrollSpy(toc.map((i) => i.id));

  const hasToc = toc.length >= 3;

  return (
    <PageCanvas ambient="none">
      <PageHeader size="compact" eyebrow={eyebrow} eyebrowIcon={icon} title={title} description={description} />
      <div className="layout-shell pb-20">
        <div className={cn(hasToc && "lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-16")}>
          <m.article
            ref={articleRef}
            variants={fadeUp}
            className="max-w-prose space-y-10 text-body text-label-1 [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-5 [&_li]:pl-1 [&_p]:[text-wrap:pretty] [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:marker:text-label-3"
          >
            {showEffectiveDate && LEGAL_EFFECTIVE_DATE ? (
              <p className="text-footnote text-label-2">
                {t("acct.legal.effective", "Effective date: {date}", { date: LEGAL_EFFECTIVE_DATE })}
              </p>
            ) : null}
            {children}
            <nav aria-label={t("acct.legal.pages", "Legal pages")} className="flex flex-wrap gap-2 border-t border-separator pt-8 [&_a]:no-underline">
              {LEGAL_LINKS.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="inline-flex h-8 items-center rounded-full border border-border bg-surface-1 px-3.5 text-footnote font-medium !text-foreground transition-ui duration-short ease-standard hover:bg-surface-2 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t(l.key, l.label)}
                </Link>
              ))}
            </nav>
          </m.article>
          {hasToc ? (
            <aside className="hidden lg:block">
              <Toc
                items={toc}
                active={active}
                label={t("acct.legal.toc", "On this page")}
                className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto"
              />
            </aside>
          ) : null}
        </div>
      </div>
    </PageCanvas>
  );
}
