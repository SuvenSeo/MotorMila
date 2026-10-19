import { Link } from "react-router-dom";
import { ShieldAlert, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppPreferences } from "@/lib/appPreferences";

/**
 * "Before you pay" safety rail, shown next to the contact CTA. Static copy —
 * the advance-fee / OTP / "seller abroad" patterns are the ones Sri Lanka
 * Police and buyers report most (see ux-review/srilanka-users.md §2.1).
 */
export function BeforeYouPayStrip({ className }: { className?: string }) {
  const { t } = useAppPreferences();
  const tips = [
    t("safety.noAdvance", "Never pay an advance or “booking fee” before you see the car."),
    t("safety.noOtp", "Don't share OTPs or open payment links the seller sends."),
    t("safety.abroad", "Be wary of sellers who say they're abroad and will ship the car."),
    t("safety.crBook", "Check the CR book details with the DMT and match chassis and engine numbers."),
    t("safety.transfer", "Ownership must be transferred within 14 days — don't accept open papers."),
  ];
  return (
    <section
      aria-labelledby="before-you-pay-title"
      className={cn("rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4", className)}
    >
      <h2 id="before-you-pay-title" className="flex items-center gap-2 text-[13px] font-bold text-foreground">
        <ShieldAlert aria-hidden className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        {t("safety.title", "Before you pay")}
      </h2>
      <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
        {tips.map((tip) => (
          <li key={tip} className="flex gap-2">
            <span aria-hidden className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-amber-500" />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/safe-transfer"
        className="mt-3 inline-flex min-h-[36px] items-center gap-1 text-[12.5px] font-semibold text-primary no-underline hover:underline"
      >
        {t("safety.transferLink", "Safe transfer checklist")}
        <ArrowRight aria-hidden className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
