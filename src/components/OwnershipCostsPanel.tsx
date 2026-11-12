import { useEffect, useRef, useState } from "react";
import {
  type ImportEligibilityResult,
  type OwnershipBundleResult,
  type OwnershipVehicleClass,
} from "@/services/api";
import {
  calculateOwnershipBundleResilient as calculateOwnershipBundle,
  checkImportEligibilityResilient as checkImportEligibility,
  calculateOwnershipBundleOffline,
  checkImportEligibilityOffline,
  type OfflineFlag,
} from "@/lib/offlineCalculators";
import { FileBadge, Shield } from "lucide-react";
import { toast } from "sonner";
import { useAppPreferences } from "@/lib/appPreferences";
import { localizeCalcNote } from "@/lib/calcNotesI18n";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import {
  AnimatedLkr,
  CheckRow,
  ChoiceChips,
  FormCard,
  Notice,
  NumberField,
  ResultCard,
  ResultRow,
  ResultRows,
  ResultSkeleton,
  ToolGrid,
} from "@/components/tools/ToolKit";

type FuelType = "petrol" | "diesel" | "hybrid" | "electric";

const FUELS: FuelType[] = ["petrol", "diesel", "hybrid", "electric"];

export function OwnershipCostsPanel({
  initialFuel = "petrol",
  initialCc = 1500,
  initialPrice = 12_000_000,
}: {
  initialFuel?: FuelType;
  initialCc?: number;
  initialPrice?: number;
}) {
  const { t } = useAppPreferences();
  const [vehicleClass, setVehicleClass] = useState<OwnershipVehicleClass>("motor_car");
  const [fuelType, setFuelType] = useState<FuelType>(initialFuel);
  const [engineCc, setEngineCc] = useState(initialCc);
  const [unladenKg, setUnladenKg] = useState(0);
  const [consideration, setConsideration] = useState(initialPrice);
  const [includeTransfer, setIncludeTransfer] = useState(true);
  const [modelYear, setModelYear] = useState(2022);
  const [bundle, setBundle] = useState<(OwnershipBundleResult & OfflineFlag) | null>(null);
  const [eligibility, setEligibility] = useState<(ImportEligibilityResult & OfflineFlag) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const request = useRef(0);
  useEffect(() => {
    const bundleInput = {
      vehicle_class: vehicleClass,
      fuel_type: fuelType,
      engine_cc: engineCc,
      unladen_kg: unladenKg > 0 ? unladenKg : undefined,
      consideration_lkr: consideration,
      include_transfer: includeTransfer,
    };
    const eligibilityInput = { fuel_type: fuelType, model_year: modelYear };
    // Instant on-device figures while the live API answers; never replaces a live result.
    try {
      const offlineBundle = calculateOwnershipBundleOffline(bundleInput);
      const offlineElig = checkImportEligibilityOffline(eligibilityInput);
      setBundle((prev) => (prev && !prev.offline ? prev : { ...offlineBundle, offline: true }));
      setEligibility((prev) => (prev && !prev.offline ? prev : { ...offlineElig, offline: true }));
    } catch {
      /* the live call below still runs */
    }
    const timer = setTimeout(() => {
      const id = ++request.current;
      setLoading(true);
      void Promise.all([calculateOwnershipBundle(bundleInput), checkImportEligibility(eligibilityInput)])
        .then(([own, elig]) => {
          if (id !== request.current) return;
          setBundle(own);
          setEligibility(elig);
          setError(null);
        })
        .catch((e: unknown) => {
          if (id !== request.current) return;
          const message = e instanceof Error ? e.message : t("calc.calcFailed", "Calculation failed");
          setError(message);
          toast.error(t("tools.own.failed", "Ownership calculation failed"), { description: message });
        })
        .finally(() => {
          if (id === request.current) setLoading(false);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [vehicleClass, fuelType, engineCc, unladenKg, consideration, includeTransfer, modelYear, attempt, t]);

  const vehicleClasses: { value: OwnershipVehicleClass; label: string }[] = [
    { value: "motor_car", label: t("tools.own.class.car", "Motor car") },
    { value: "dual_purpose", label: t("tools.own.class.dual", "Dual purpose") },
    { value: "motorcycle", label: t("tools.own.class.bike", "Motorcycle") },
    { value: "three_wheeler", label: t("tools.own.class.tuk", "Three-wheeler") },
  ];
  const statusTone =
    eligibility?.status === "likely_allowed" ? "success" : eligibility?.status === "restricted" ? "danger" : "caution";
  const statusLabel =
    eligibility?.status === "likely_allowed"
      ? t("tools.own.status.allowed", "Likely allowed")
      : eligibility?.status === "restricted"
        ? t("tools.own.status.restricted", "Restricted")
        : (eligibility?.status ?? "").replace(/_/g, " ");

  const form = (
    <FormCard icon={FileBadge} title={t("tools.own.title", "On-road ownership costs")} description={t("tools.own.subtitle", "Revenue licence · emission · third-party · transfer")}>
      <ChoiceChips label={t("tools.own.class", "Vehicle class")} value={vehicleClass} options={vehicleClasses} onChange={setVehicleClass} />
      <ChoiceChips
        label={t("tools.own.fuel", "Fuel")}
        value={fuelType}
        options={FUELS.map((f) => ({ value: f, label: t(`fuel.${f}`, f) }))}
        onChange={setFuelType}
        fill
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField id="own-cc" label={t("tools.own.cc", "Engine CC")} value={engineCc} onChange={setEngineCc} suffix="cc" step={50} />
        <NumberField
          id="own-kg"
          label={t("tools.own.kg", "Unladen weight")}
          optional
          optionalLabel={t("tools.optional", "optional")}
          value={unladenKg}
          emptyWhenZero
          onChange={setUnladenKg}
          suffix="kg"
          placeholder={t("tools.own.kgPh", "Worked out from CC")}
        />
        <NumberField id="own-year" label={t("tools.own.year", "Model year (import check)")} value={modelYear} onChange={setModelYear} step={1} inputMode="numeric" />
        <NumberField id="own-price" label={t("tools.own.consideration", "Transfer value")} value={consideration} onChange={setConsideration} prefix="Rs" step={100_000} />
      </div>
      <CheckRow id="own-transfer" checked={includeTransfer} onCheckedChange={setIncludeTransfer} className="-mx-2">
        <span className="text-footnote">{t("tools.own.includeTransfer", "Include ownership-transfer fees")}</span>
      </CheckRow>
    </FormCard>
  );

  const result =
    loading && !bundle ? (
      <ResultSkeleton rows={4} label={t("tools.calculating", "Calculating")} />
    ) : bundle ? (
      <>
        <ResultCard
          busy={loading && !bundle.offline}
          label={t("tools.own.total", "Statutory cash this year")}
          badge={bundle.offline ? <Badge variant="neutral">{t("tools.calc.onDevice", "On device")}</Badge> : null}
          value={<AnimatedLkr value={bundle.first_year_statutory_total_lkr} mode="full" />}
          caption={t("tools.own.caption", "Gazette-aligned planning figures. Confirm with eRL, your insurer and the DMT before paying.")}
          footer={
            <Notice tone="neutral" icon={Shield}>
              <span className="text-label-2">
                {localizeCalcNote(bundle.notes, t)} {localizeCalcNote(bundle.revenue_licence.schedule_note, t)}
              </span>
            </Notice>
          }
        >
          <ResultRows>
            <ResultRow label={t("tools.own.licence", "Revenue licence (base)")} value={<AnimatedLkr value={bundle.revenue_licence.base_fee_lkr} mode="full" />} />
            <ResultRow label={t("tools.own.emission", "Emission test (VET)")} value={<AnimatedLkr value={bundle.revenue_licence.emission_test_lkr} mode="full" />} />
            <ResultRow label={t("tools.own.thirdParty", "Third-party insurance (CMT + stamp)")} value={<AnimatedLkr value={bundle.third_party_insurance.total_lkr} mode="full" />} />
            {bundle.transfer ? (
              <ResultRow label={t("tools.own.transfer", "Transfer processing + stamp estimate")} value={<AnimatedLkr value={bundle.transfer.total_lkr} mode="full" />} />
            ) : null}
          </ResultRows>
        </ResultCard>
        {eligibility ? (
          <Notice tone={statusTone} title={t("tools.own.importScreen", "Import screen · {status}", { status: statusLabel })}>
            <ul className="list-disc space-y-1 pl-4 text-label-2">
              {eligibility.reasons.map((reason) => (
                <li key={reason}>{localizeCalcNote(reason, t)}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
      </>
    ) : error ? (
      <ErrorState className="rounded-card border border-border bg-surface-1 py-10 shadow-e1" body={error} onRetry={() => setAttempt((n) => n + 1)} />
    ) : (
      <ResultSkeleton rows={4} label={t("tools.calculating", "Calculating")} />
    );

  return <ToolGrid form={form} result={result} />;
}
