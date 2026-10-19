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

const FUEL_OPTIONS: { value: ImportFuelType; label: string }[] = [
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "hybrid", label: "Hybrid" },
  { value: "electric", label: "Electric" },
];

function HybridTaxAdvantageCallout({ engineCapacity, fuelType }: { engineCapacity: number; fuelType: ImportFuelType }) {
  const location = useLocation();
  const insight = getHybridExciseCliffInsight();
  const onCalculator = location.pathname.startsWith("/calculator");
  const atCliff = isAtHybridExciseCliff(engineCapacity);

  return (
    <div className="flex gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
      <Leaf className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
      <div className="min-w-0 space-y-1.5">
        <p className="text-[11px] font-semibold text-emerald-300">Hybrid tax advantage</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Hybrid excise is charged per cm³ in capacity bands. At{" "}
          <span className="num font-medium text-foreground">{insight.cliffCc.toLocaleString()} cc</span> the rate is Rs.{" "}
          <span className="num font-medium text-foreground">{insight.rateAtOrBelowCliff.toLocaleString()}</span>/cc — one
          cc over moves to Rs.{" "}
          <span className="num font-medium text-foreground">{insight.rateAboveCliff.toLocaleString()}</span>/cc, stepping excise
          up by <span className="num font-medium text-foreground">{formatPrice(insight.exciseStepUp)}</span> on this model.
          At the cliff, hybrid saves{" "}
          <span className="num font-medium text-foreground">{formatPrice(insight.exciseSavingVsPetrolAtCliff)}</span> in excise
          alone vs petrol (Rs. {insight.petrolRateAtCliff.toLocaleString()}/cc).
          {atCliff && (
            <>
              {" "}
              Your {engineCapacity.toLocaleString()} cc input sits on this boundary — confirm the declared capacity before
              import.
            </>
          )}
        </p>
        {!onCalculator && (
          <Link
            to={`/calculator?tab=landed-cost&fuel=${fuelType}&cc=${engineCapacity}`}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-300 no-underline transition-colors hover:text-emerald-200"
          >
            Model import duty in calculator
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
  });

  const showHybridAdvantage = fuelType === "hybrid" || (effectiveCc != null && isAtHybridExciseCliff(effectiveCc));

  return (
    <div className="page-panel space-y-4 rounded-xl p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="field-label text-foreground">Import duty and tax</h3>
        <span className="rounded-2xl border border-primary/20 bg-primary/10 px-2 py-0.5 text-label font-mono font-bold text-primary-bright">
          Indicative
        </span>
      </div>

      {/* Fuel type + EV power input */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Fuel type">
          {FUEL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFuelType(option.value)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                fuelType === option.value
                  ? "border-primary/25 bg-primary/10 text-primary-bright"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {fuelType === "electric" && (
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            Motor power
            <input
              type="number"
              min={0}
              value={motorKw}
              onChange={(e) => setMotorKw(Number(e.target.value))}
              className="w-20 rounded-full border border-border bg-surface px-2 py-1 text-xs font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary/50 num"
              aria-label="Motor power in kilowatts"
            />
            kW
          </label>
        )}
      </div>

      {/* CC input — the listing's capacity may be unknown (or a scrape
          artifact); duty is per-cc so we ask instead of assuming 1,500 cc. */}
      {!knownCc && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3">
          <label htmlFor="tax-cc-input" className="text-xs font-medium text-muted-foreground">
            Engine capacity
          </label>
          <input
            id="tax-cc-input"
            type="number"
            min={1}
            value={ccInput}
            onChange={(e) => setCcInput(e.target.value)}
            placeholder="e.g. 1496"
            className="w-28 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary/50 num"
            aria-describedby="tax-cc-hint"
          />
          <span className="text-xs text-muted-foreground">cc</span>
          <p id="tax-cc-hint" className="w-full text-[11px] text-muted-foreground">
            This listing doesn't carry a verified engine capacity — enter it to get an indicative duty figure.
          </p>
        </div>
      )}

      {effectiveCc == null ? (
        <p className="text-xs text-muted-foreground">
          Enter the engine capacity above to see the indicative import-duty breakdown.
        </p>
      ) : (
        <>
      <div className="space-y-3">
        <div className="flex justify-between border-b border-border pb-2 text-xs text-muted-foreground">
          <span>Base Value (CIF est.)</span>
          <span className="font-medium text-foreground num">{formatPrice(price)}</span>
        </div>

        {result.lines.map((line) => (
          <div key={line.key} className="flex justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {line.label}
              {line.note && <span className="mt-0.5 block text-[10px] text-muted-foreground num">{line.note}</span>}
            </span>
            <span className="shrink-0 font-medium text-foreground num">{formatPrice(line.amount)}</span>
          </div>
        ))}
      </div>

      {showHybridAdvantage && <HybridTaxAdvantageCallout engineCapacity={effectiveCc} fuelType={fuelType} />}

      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-3">
          <span className="text-xs font-medium text-muted-foreground">Total Est. Taxes</span>
          <span className="text-sm font-bold text-primary num">+{formatPrice(result.totalTax)}</span>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/10 p-4">
          <span className="text-xs font-semibold text-primary-bright">Estimated landed cost</span>
          <span className="text-lg font-bold tracking-tight text-foreground num">{formatPrice(result.totalOnRoad)}</span>
        </div>
      </div>
        </>
      )}

      <div className="flex gap-2 rounded-2xl border border-deal-amber/30 bg-deal-amber/10 p-3">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-deal-amber" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Indicative model of the post-2025 import regime (per-cm³/per-kW excise bands, luxury tax above the CIF
          threshold, VAT on the duty-inclusive value). Band rates last reviewed {TAX_MODEL_REVIEWED} — actual duty
          changes by gazette, so verify with Sri Lanka Customs or your clearing agent before committing to an import.
        </p>
      </div>
    </div>
  );
}
