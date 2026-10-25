import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ExternalLink, Info, ShieldAlert, ShieldCheck } from "lucide-react";
import { buildTrustReport, type SignalLevel, type TrustInput } from "@/lib/trustSignals";
import { useAppPreferences } from "@/lib/appPreferences";
import { cn } from "@/lib/utils";

const DMT_VEHICLE_INFO_URL = "https://eservices.motortraffic.gov.lk/VehicleInfo/home";
const CUSTOMS_VERIFY_URL = "https://services.customs.gov.lk/vehicles";

const LEVEL_STYLE: Record<SignalLevel, { icon: typeof Info; tone: string; label: readonly [string, string] }> = {
  high: { icon: ShieldAlert, tone: "text-deal-high-text bg-deal-high/10 border-deal-high/25", label: ["trust.level.high", "Check carefully"] },
  medium: { icon: AlertTriangle, tone: "text-deal-caution-text bg-deal-caution/10 border-deal-caution/25", label: ["trust.level.medium", "Worth checking"] },
  info: { icon: Info, tone: "text-foreground bg-muted/60 border-border", label: ["trust.level.info", "Good to know"] },
  ok: { icon: CheckCircle2, tone: "text-deal-good-text bg-deal-good/10 border-deal-good/25", label: ["trust.level.ok", "Looks normal"] },
};

/**
 * Trust Check: risk signals for one listing, computed on-device from the data
 * the page already holds. Copy is deliberately non-accusatory: these are
 * prompts for what to verify, never a judgement about the seller.
 */
export function TrustCheckPanel(props: TrustInput & { className?: string }) {
  const { t } = useAppPreferences();
  const { className, listing, pricePoints, related, now } = props;
  const report = useMemo(
    () => buildTrustReport({ listing, pricePoints, related, now, t }),
    [listing, pricePoints, related, now, t],
  );
  const HeaderIcon = report.highCount > 0 ? ShieldAlert : ShieldCheck;

  return (
    <section
      aria-labelledby="trust-check-title"
      className={cn("rounded-[1.75rem] border border-border bg-card p-5 shadow-soft", className)}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border",
            report.highCount > 0 ? LEVEL_STYLE.high.tone : report.mediumCount > 0 ? LEVEL_STYLE.medium.tone : LEVEL_STYLE.ok.tone,
          )}
        >
          <HeaderIcon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="trust-check-title" className="text-body font-semibold text-foreground">
            {t("trust.title", "Trust Check")}
          </h2>
          <p className="mt-0.5 text-footnote text-muted-foreground" aria-live="polite">
            {report.summary}
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2.5">
        {report.signals.map((signal) => {
          const style = LEVEL_STYLE[signal.level];
          const Icon = style.icon;
          return (
            <li key={signal.id} className={cn("rounded-2xl border px-3.5 py-3", style.tone)}>
              <div className="flex items-start gap-2.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="min-w-0">
                  <p className="text-footnote font-semibold leading-snug">
                    <span className="sr-only">{t(style.label[0], style.label[1])}: </span>
                    {signal.title}
                  </p>
                  <p className="mt-1 text-footnote leading-relaxed text-muted-foreground">{signal.detail}</p>
                </div>
              </div>
            </li>
          );
        })}
        {!report.crossSiteAvailable && (
          <li className="rounded-2xl border border-dashed border-border px-3.5 py-3 text-footnote text-muted-foreground">
            {t(
              "trust.crossSiteUnavailable",
              "We couldn't load cross-site history right now, so duplicate-ad and odometer checks are skipped. Try again later.",
            )}
          </li>
        )}
      </ul>

      <div className="mt-4 rounded-2xl bg-muted/50 p-3.5">
        <p className="text-footnote font-semibold text-foreground">{t("trust.verifyTitle", "Before you pay, verify it yourself")}</p>
        <ul className="mt-2 space-y-1.5 text-footnote leading-relaxed text-muted-foreground">
          <li>
            <a href={DMT_VEHICLE_INFO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline">
              {t("trust.dmt", "DMT vehicle record")} <ExternalLink className="h-3 w-3" aria-hidden />
            </a>{" "}
            {t("trust.dmtBody", "shows the registered owner, the absolute owner (any lease or loan on it) and engine details, for a small fee (Rs 150 when we last checked). Match it against the seller's ID and the CR.")}
          </li>
          <li>
            <a href={CUSTOMS_VERIFY_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline">
              {t("trust.customs", "Customs vehicle check")} <ExternalLink className="h-3 w-3" aria-hidden />
            </a>{" "}
            {t("trust.customsBody", "confirms an imported vehicle was cleared legally (chassis number + OTP; personal use).")}
          </li>
          <li>{t("trust.noAdvance", "Never pay an advance or \u201cbooking fee\u201d before seeing the car and its papers in person.")}</li>
          <li>
            <Link to="/safe-transfer" className="font-medium text-primary underline-offset-2 hover:underline">
              {t("trust.kit", "Safe-Transfer Kit")}
            </Link>{" "}
            {t("trust.kitBody", "covers the ownership-transfer checklist and a sale agreement you can print.")}
          </li>
        </ul>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-muted-foreground">
        {t(
          "trust.disclaimer",
          "These are automated risk signals from asking prices and ad text. They aren't a verdict on the car or the seller. Motormila hasn't inspected this vehicle.",
        )}
      </p>
    </section>
  );
}
