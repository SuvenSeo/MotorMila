import { useEffect, useState } from "react";
import {
  formatPrice,
  type ImportEligibilityResult,
  type OwnershipBundleResult,
  type OwnershipVehicleClass,
} from "@/services/api";
import {
  calculateOwnershipBundleResilient as calculateOwnershipBundle,
  checkImportEligibilityResilient as checkImportEligibility,
  type OfflineFlag,
} from "@/lib/offlineCalculators";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CheckCircle, Shield, FileBadge } from "lucide-react";
import { toast } from "sonner";

type FuelType = "petrol" | "diesel" | "hybrid" | "electric";

const VEHICLE_CLASSES: { id: OwnershipVehicleClass; label: string }[] = [
  { id: "motor_car", label: "Motor car" },
  { id: "dual_purpose", label: "Dual purpose" },
  { id: "motorcycle", label: "Motorcycle" },
  { id: "three_wheeler", label: "Three-wheeler" },
];

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      void Promise.all([
        calculateOwnershipBundle({
          vehicle_class: vehicleClass,
          fuel_type: fuelType,
          engine_cc: engineCc,
          unladen_kg: unladenKg > 0 ? unladenKg : undefined,
          consideration_lkr: consideration,
          include_transfer: includeTransfer,
        }),
        checkImportEligibility({
          fuel_type: fuelType,
          model_year: modelYear,
        }),
      ])
        .then(([own, elig]) => {
          setBundle(own);
          setEligibility(elig);
        })
        .catch((e: unknown) => {
          const message = e instanceof Error ? e.message : "Calculation failed";
          toast.error("Ownership calc failed", { description: message });
        })
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [vehicleClass, fuelType, engineCc, unladenKg, consideration, includeTransfer, modelYear]);

  const statusTone =
    eligibility?.status === "likely_allowed"
      ? "border-deal-good/25 bg-deal-good/10 text-deal-good-text"
      : eligibility?.status === "restricted"
        ? "border-deal-high/25 bg-deal-high/10 text-deal-high-text"
        : "border-deal-caution/25 bg-deal-caution/10 text-deal-caution-text";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="h-fit space-y-5 rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-2xl border border-border bg-surface">
            <FileBadge className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-body font-bold text-foreground">On-road ownership costs</h2>
            <p className="text-caption font-semibold text-muted-foreground">
              Revenue licence · emission · third-party · transfer
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-caption font-medium text-muted-foreground/80">
            Vehicle class
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {VEHICLE_CLASSES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setVehicleClass(item.id)}
                aria-pressed={vehicleClass === item.id}
                className={`min-h-[36px] rounded-full border py-2 text-caption font-bold transition-ui active:scale-[0.97] ${
                  vehicleClass === item.id
                    ? "border-primary/40 bg-primary/10 text-primary-bright"
                    : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-caption font-medium text-muted-foreground/80">
            Fuel
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {FUELS.map((fuel) => (
              <button
                key={fuel}
                type="button"
                onClick={() => setFuelType(fuel)}
                aria-pressed={fuelType === fuel}
                className={`min-h-[36px] rounded-full border py-2 text-caption font-bold capitalize transition-ui active:scale-[0.97] ${
                  fuelType === fuel
                    ? "border-primary/40 bg-primary/10 text-primary-bright"
                    : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {fuel}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="own-cc" className="text-caption font-medium text-muted-foreground/80">
              Engine CC
            </label>
            <Input
              id="own-cc"
              type="number"
              value={engineCc}
              onChange={(e) => setEngineCc(Number(e.target.value))}
              className="num border-border bg-surface focus-visible:ring-primary/40"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="own-kg" className="text-caption font-medium text-muted-foreground/80">
              Unladen kg (optional)
            </label>
            <Input
              id="own-kg"
              type="number"
              value={unladenKg || ""}
              placeholder="auto from CC"
              onChange={(e) => setUnladenKg(Number(e.target.value) || 0)}
              className="num border-border bg-surface focus-visible:ring-primary/40"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="own-year" className="text-caption font-medium text-muted-foreground/80">
              Model year (import check)
            </label>
            <Input
              id="own-year"
              type="number"
              value={modelYear}
              onChange={(e) => setModelYear(Number(e.target.value))}
              className="num border-border bg-surface focus-visible:ring-primary/40"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="own-price" className="text-caption font-medium text-muted-foreground/80">
              Transfer consideration (LKR)
            </label>
            <Input
              id="own-price"
              type="number"
              value={consideration}
              onChange={(e) => setConsideration(Number(e.target.value))}
              className="num border-border bg-surface focus-visible:ring-primary/40"
            />
          </div>
        </div>

        <label className="flex min-h-[40px] cursor-pointer items-center gap-2 text-caption font-semibold text-foreground">
          <input
            type="checkbox"
            checked={includeTransfer}
            onChange={(e) => setIncludeTransfer(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Include ownership-transfer fees
        </label>
      </div>

      <div className="space-y-6 rounded-2xl border border-border bg-card p-5 shadow-soft-lg sm:p-6">
        <div>
          <h3 className="text-footnote font-bold text-foreground">First-year statutory outlay</h3>
          <p className="mt-0.5 text-caption font-semibold text-muted-foreground">
            Gazette-aligned planning figures — confirm eRL / insurer / RMV before paying
            {bundle?.offline ? " · computed on-device" : ""}
          </p>
        </div>

        {loading && !bundle ? (
          <div className="flex h-48 items-center justify-center">
            <div
              role="status"
              aria-label="Calculating"
              className="h-6 w-6 animate-spin rounded-full border border-primary border-t-transparent"
            />
          </div>
        ) : bundle ? (
          <div className={`space-y-5 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
            <div className="space-y-3 border-b border-border pb-4 text-caption">
              <div className="flex justify-between text-muted-foreground">
                <span>Revenue licence (base)</span>
                <span className="num font-semibold text-foreground">
                  {formatPrice(bundle.revenue_licence.base_fee_lkr)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Emission test (VET)</span>
                <span className="num font-semibold text-foreground">
                  {formatPrice(bundle.revenue_licence.emission_test_lkr)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Third-party insurance (CMT + stamp)</span>
                <span className="num font-semibold text-foreground">
                  {formatPrice(bundle.third_party_insurance.total_lkr)}
                </span>
              </div>
              {bundle.transfer ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Transfer processing + stamp estimate</span>
                  <span className="num font-semibold text-foreground">
                    {formatPrice(bundle.transfer.total_lkr)}
                  </span>
                </div>
              ) : null}
            </div>

            <div
              aria-live="polite"
              className="rounded-2xl border border-primary/25 bg-primary/5 p-6 text-center shadow-soft"
            >
              <span className="text-caption font-semibold text-primary-bright">
                Statutory cash this year
              </span>
              <p className="display-1 num mt-2 text-foreground">
                {formatPrice(bundle.first_year_statutory_total_lkr)}
              </p>
            </div>

            {eligibility ? (
              <div className={`rounded-2xl border p-4 ${statusTone}`}>
                <div className="flex items-start gap-2">
                  {eligibility.status === "likely_allowed" ? (
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <div>
                    <p className="text-caption font-bold capitalize">
                      Import screen · {eligibility.status.replace(/_/g, " ")}
                    </p>
                    <ul className="mt-2 space-y-1 text-caption font-semibold leading-relaxed opacity-90">
                      {eligibility.reasons.map((reason) => (
                        <li key={reason}>• {reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex gap-2 rounded-2xl border border-border bg-surface p-3">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-caption font-semibold leading-relaxed text-muted-foreground">
                {bundle.notes} {bundle.revenue_licence.schedule_note}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
