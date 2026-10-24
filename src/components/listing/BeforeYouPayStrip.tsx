import { Link } from "react-router-dom";
import { ShieldAlert, ArrowRight, ChevronDown } from "lucide-react";
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
  const tips = [
    t("safety.noAdvance", "Never pay an advance or “booking fee” before you see the car."),
    t("safety.noOtp", "Don't share OTPs or open payment links the seller sends."),
    t("safety.abroad", "Be wary of sellers who say they're abroad and will ship the car."),
    t("safety.crBook", "Check the CR book details with the DMT and match chassis and engine numbers."),
    t("safety.transfer", "Ownership must be transferred within 14 days — don't accept open papers."),
  ];
  const titleId = `before-you-pay-${idSuffix}`;
  const list = (
    <>
      <ul className="mt-2 space-y-1.5 text-footnote leading-relaxed text-muted-foreground">
        {tips.map((tip) => (
          <li key={tip} className="flex gap-2">
            <span aria-hidden className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-deal-caution" />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/safe-transfer"
        className="mt-3 inline-flex min-h-[36px] items-center gap-1 text-footnote font-semibold text-primary no-underline hover:underline"
      >
        {t("safety.transferLink", "Safe transfer checklist")}
        <ArrowRight aria-hidden className="h-3.5 w-3.5" />
      </Link>
    </>
  );
  const heading = (
    <>
      <ShieldAlert aria-hidden className="h-4 w-4 shrink-0 text-deal-caution-text" />
      <span>{t("listing.beforeYouPayTitle", "Before you pay")}</span>
    </>
  );
  const shell = cn("rounded-2xl border border-deal-caution/30 bg-deal-caution/[0.06] p-4", className);

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
