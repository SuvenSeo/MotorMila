import { useState } from "react";
import { AlertTriangle, ArrowRight, Leaf } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { formatPrice } from "@/services/api";
import {
  computeImportTaxes,
  getHybridExciseCliffInsight,
  isAtHybridExciseCliff,
  TAX_MODEL_REVIEWED,
  type ImportFuelType,
} from "@/lib/importTaxModel";
import { useAppPreferences } from "@/lib/appPreferences";
import { Badge } from "@/components/ui/badge";
import { Chip } from "@/components/ui/chip";

const FUEL_OPTIONS: { value: ImportFuelType; label: string }[] = [
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "hybrid", label: "Hybrid" },
  { value: "electric", label: "Electric" },
];
// Labels render through t(`fuel.${value}`, label).

const INPUT_CLASS =
  "h-9 rounded-control border border-border bg-surface-2 px-3 text-caption font-semibold tabular-nums text-foreground outline-none transition-colors duration-short ease-standard placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

function HybridTaxAdvantageCallout({ engineCapacity, fuelType }: { engineCapacity: number; fuelType: ImportFuelType }) {
  const { t } = useAppPreferences();
  const location = useLocation();
  const insight = getHybridExciseCliffInsight();
  const onCalculator = location.pathname.startsWith("/calculator");
  const atCliff = isAtHybridExciseCliff(engineCapacity);

  return (
    <div className="flex gap-2 rounded-control border border-deal-good/20 bg-deal-good/[0.06] p-3">
      <Leaf className="mt-0.5 h-3.5 w-3.5 shrink-0 text-deal-good-text" aria-hidden="true" />
      <div className="min-w-0 space-y-1.5">
        <p className="text-caption font-semibold text-deal-good-text">{t("taxBreakdown.hybridTitle", "Hybrid tax advantage")}</p>
        <p className="text-caption leading-relaxed text-label-2">
          {t(
            "taxBreakdown.hybridBody",
            "Hybrid excise is charged per cm³ in capacity bands. At {cliff} cc the rate is Rs. {rate}/cc — one cc over moves to Rs. {rateAbove}/cc, stepping excise up by {stepUp} on this model. At the cliff, hybrid saves {saving} in excise alone vs petrol (Rs. {petrolRate}/cc).",
            {
              cliff: insight.cliffCc.toLocaleString(),
              rate: insight.rateAtOrBelowCliff.toLocaleString(),
              rateAbove: insight.rateAboveCliff.toLocaleString(),
              stepUp: formatPrice(insight.exciseStepUp),
              saving: formatPrice(insight.exciseSavingVsPetrolAtCliff),
              petrolRate: insight.petrolRateAtCliff.toLocaleString(),
            },
          )}
          {atCliff && (
            <>
              {" "}
              {t("taxBreakdown.atCliff", "Your {cc} cc input sits on this boundary — confirm the declared capacity before import.", { cc: engineCapacity.toLocaleString() })}
            </>
          )}
        </p>
        {!onCalculator && (
          <Link
            to={`/calculator?tab=landed-cost&fuel=${fuelType}&cc=${engineCapacity}`}
            className="inline-flex items-center gap-1 text-caption font-medium text-deal-good-text no-underline transition-colors hover:text-deal-good-text"
          >
            {t("taxBreakdown.openCalculator", "Model import duty in calculator")}
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}

export function TaxBreakdown({
  price,
  engineCapacity,
  initialFuelType,
}: {
  price: number;
  /** Listing's known engine capacity in cc; when absent the user enters it — never silently assumed. */
  engineCapacity?: number | null;
  /** Seed from the listing's known fuel type so a hybrid doesn't open on petrol excise. */
  initialFuelType?: ImportFuelType;
}) {
  const { t } = useAppPreferences();
  const [fuelType, setFuelType] = useState<ImportFuelType>(initialFuelType ?? "petrol");
  const [motorKw, setMotorKw] = useState(110);
  const [ccInput, setCcInput] = useState<string>(engineCapacity != null ? String(engineCapacity) : "");
  // A capacity equal to the listing year (or otherwise implausible) is a
  // scrape artifact — treat it as unknown rather than computing on it.
  const knownCc = engineCapacity != null && engineCapacity > 0 ? engineCapacity : null;
  const parsedCc = Number(ccInput);
  const effectiveCc = knownCc ?? (Number.isFinite(parsedCc) && parsedCc > 0 ? parsedCc : null);

  const result = computeImportTaxes({
    cifLkr: price,
    fuelType,
    engineCc: effectiveCc ?? 0,
    motorKw,
    t,
  });

  const showHybridAdvantage = fuelType === "hybrid" || (effectiveCc != null && isAtHybridExciseCliff(effectiveCc));

  return (
    <div className="rounded-card border border-border bg-surface-1 p-5 shadow-e1 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-caption font-semibold uppercase tracking-caps text-label-2">{t("taxBreakdown.title", "Import duty and tax")}</h3>
        <Badge variant="info">{t("taxBreakdown.indicative", "Indicative")}</Badge>
      </div>

      {/* Fuel type + EV power input */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5" role="group" aria-label={t("common.fuel", "Fuel")}>
          {FUEL_OPTIONS.map((option) => (
            <Chip key={option.value} selected={fuelType === option.value} onClick={() => setFuelType(option.value)}>
              {t(`fuel.${option.value}`, option.label)}
            </Chip>
          ))}
        </div>
        {fuelType === "electric" && (
          <label className="flex items-center gap-2 text-caption text-label-2">
            {t("taxBreakdown.motorPower", "Motor power")}
            <span className="relative inline-flex items-center">
              <input
                type="number"
                min={0}
                value={motorKw}
                onChange={(e) => setMotorKw(Number(e.target.value))}
                className={`${INPUT_CLASS} w-24 pr-9`}
                aria-label={t("taxBreakdown.motorPowerAria", "Motor power in kilowatts")}
              />
              <span aria-hidden className="pointer-events-none absolute right-3 text-caption text-label-2">kW</span>
            </span>
          </label>
        )}
      </div>

      {/* CC input — the listing's capacity may be unknown (or a scrape
          artifact); duty is per-cc so we ask instead of assuming 1,500 cc. */}
      {!knownCc && (
        <div className="mt-3 rounded-control border border-border bg-surface-2/60 p-3">
          <label htmlFor="tax-cc-input" className="text-caption font-medium text-label-2">
            {t("taxBreakdown.engineCapacity", "Engine capacity")}
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              id="tax-cc-input"
              type="number"
              min={1}
              value={ccInput}
              onChange={(e) => setCcInput(e.target.value)}
              placeholder={t("taxBreakdown.ccPlaceholder", "e.g. 1496")}
              className={`${INPUT_CLASS} w-28`}
              aria-describedby="tax-cc-hint"
            />
            <span className="text-caption text-label-2">cc</span>
          </div>
          <p id="tax-cc-hint" className="mt-1.5 text-caption leading-relaxed text-label-2">
            {t("taxBreakdown.ccHint", "This listing doesn't carry a verified engine capacity — enter it to get an indicative duty figure.")}
          </p>
        </div>
      )}

      {effectiveCc == null ? (
        <p className="mt-3 text-caption text-label-2">
          {t("taxBreakdown.ccPrompt", "Enter the engine capacity above to see the indicative import-duty breakdown.")}
        </p>
      ) : (
        <>
          <dl className="mt-4 border-t border-separator">
            <div className="flex items-baseline justify-between gap-3 border-b border-separator py-2.5 text-caption">
              <dt className="text-label-2">{t("taxBreakdown.base", "Base Value (CIF est.)")}</dt>
              <dd className="num font-semibold text-foreground">{formatPrice(price)}</dd>
            </div>

            {result.lines.map((line) => (
              <div key={line.key} className="flex items-baseline justify-between gap-3 border-b border-separator py-2.5 text-caption">
                <dt className="min-w-0 text-label-2">
                  {line.label}
                  {line.note && <span className="num mt-0.5 block text-caption text-label-3">{line.note}</span>}
                </dt>
                <dd className="num shrink-0 font-semibold text-foreground">{formatPrice(line.amount)}</dd>
              </div>
            ))}
          </dl>

          {showHybridAdvantage && <div className="mt-3"><HybridTaxAdvantageCallout engineCapacity={effectiveCc} fuelType={fuelType} /></div>}

          <dl className="mt-3 space-y-2 border-t border-separator pt-3">
            <div className="flex items-baseline justify-between gap-3 text-caption">
              <dt className="text-label-2">{t("taxBreakdown.totalTax", "Total Est. Taxes")}</dt>
              <dd className="num text-callout font-semibold text-primary">+{formatPrice(result.totalTax)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-caption font-semibold text-label-2">{t("taxBreakdown.landed", "Estimated landed cost")}</dt>
              <dd className="num font-display text-title3 font-semibold tracking-tight text-foreground">{formatPrice(result.totalOnRoad)}</dd>
            </div>
          </dl>
        </>
      )}

      <div className="mt-4 flex gap-2 rounded-control border border-deal-caution/30 bg-deal-caution/10 p-3">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-deal-caution-text" aria-hidden="true" />
        <p className="text-caption leading-relaxed text-label-2">
          {t(
            "taxBreakdown.disclaimer",
            "Indicative model of the post-2025 import regime (per-cm³/per-kW excise bands, luxury tax above the CIF threshold, VAT on the duty-inclusive value). Band rates last reviewed {date} — actual duty changes by gazette, so verify with Sri Lanka Customs or your clearing agent before committing to an import.",
            { date: TAX_MODEL_REVIEWED },
          )}
        </p>
      </div>
    </div>
  );
}
