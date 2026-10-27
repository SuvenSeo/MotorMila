import { Link } from "react-router-dom";
import { useState } from "react";
import { ShieldAlert, ArrowRight, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppPreferences } from "@/lib/appPreferences";

/**
 * "Before you pay" safety rail, shown next to the contact CTA. Static copy —
 * the advance-fee / OTP / "seller abroad" patterns are the ones Sri Lanka
 * Police and buyers report most (see ux-review/srilanka-users.md §2.1).
 */
export function BeforeYouPayStrip({
  className,
  collapsible = false,
  idSuffix = "main",
}: {
  className?: string;
  /** Mobile flow: one-line summary that expands (the sticky CTA is right below). */
  collapsible?: boolean;
  /** Keeps heading ids unique when the strip renders in two layouts. */
  idSuffix?: string;
}) {
  const { t } = useAppPreferences();
  // Short lead (scannable) + the full sentence. Each row can be ticked off
  // while talking to the seller (local only, nothing is stored).
  const tips = [
    { lead: t("safety.lead.noAdvance", "No advance payments"), body: t("safety.noAdvance", "Never pay an advance or “booking fee” before you see the vehicle.") },
    { lead: t("safety.lead.noOtp", "No OTPs or payment links"), body: t("safety.noOtp", "Don't share OTPs or open payment links the seller sends.") },
    { lead: t("safety.lead.abroad", "Seller “abroad”? Walk away"), body: t("safety.abroad", "Be wary of sellers who say they're abroad and will ship the vehicle.") },
    { lead: t("safety.lead.crBook", "Match the CR book"), body: t("safety.crBook", "Check the CR book details with the DMT and match chassis and engine numbers.") },
    { lead: t("safety.lead.transfer", "Transfer within 14 days"), body: t("safety.transfer", "Ownership must be transferred within 14 days — don't accept open papers.") },
  ];
  const [done, setDone] = useState<ReadonlySet<number>>(() => new Set());
  const titleId = `before-you-pay-${idSuffix}`;
  const list = (
    <>
      <ul className="mt-2">
        {tips.map((tip, i) => (
          <li key={tip.lead}>
            <label className="cine-check">
              <input
                type="checkbox"
                className="sr-only"
                checked={done.has(i)}
                onChange={() =>
                  setDone((cur) => {
                    const next = new Set(cur);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
              />
              <span aria-hidden className="cine-check__box">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <span className="cine-check__text min-w-0">
                <span className="cine-check__lead block text-footnote font-semibold text-foreground">{tip.lead}</span>
                <span className="mt-0.5 block text-caption leading-relaxed text-muted-foreground">{tip.body}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2">
        <span className="num text-caption font-medium text-muted-foreground" aria-live="polite">
          {t("safety.progress", "{done} of {total} checked", { done: done.size, total: tips.length })}
        </span>
        <Link
          to="/safe-transfer"
          className="inline-flex min-h-[36px] items-center gap-1 text-footnote font-semibold text-primary no-underline hover:underline"
        >
          {t("safety.transferLink", "Safe transfer checklist")}
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </div>
    </>
  );
  const heading = (
    <>
      <ShieldAlert aria-hidden className="h-4 w-4 shrink-0 text-deal-caution-text" />
      <span>{t("listing.beforeYouPayTitle", "Before you pay")}</span>
    </>
  );
  const shell = cn("rounded-2xl border border-deal-caution/25 bg-deal-caution/[0.05] px-4 pb-3 pt-4", className);

  if (collapsible) {
    return (
      <details className={cn(shell, "group mm-disclosure")}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-footnote font-bold text-foreground [&::-webkit-details-marker]:hidden">
          {heading}
          <span className="ml-1 truncate text-caption font-medium text-muted-foreground">
            {t("safety.summary", "Never pay an advance")}
          </span>
          <ChevronDown aria-hidden className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        {list}
      </details>
    );
  }

  return (
    <section aria-labelledby={titleId} className={shell}>
      <h2 id={titleId} className="flex items-center gap-2 text-footnote font-bold text-foreground">
        {heading}
      </h2>
      {list}
    </section>
  );
}
