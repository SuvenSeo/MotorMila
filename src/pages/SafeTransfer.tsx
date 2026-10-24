import { useEffect, useMemo, useState } from "react";
import { m } from "motion/react";
import { CalendarClock, ClipboardCheck, FileDown, FileText, Receipt, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { AnimatedNumber } from "@/components/ui/animated-number";
import {
  AnimatedLkr,
  CheckRow,
  Field,
  FormCard,
  Notice,
  NumberField,
  ResultCard,
  ResultRow,
  ResultRows,
  ToolGrid,
  ToolPage,
} from "@/components/tools/ToolKit";
import { useAppPreferences } from "@/lib/appPreferences";
import { spring, useReducedMotionOrLowData } from "@/lib/motion";
import {
  buildAgreementParagraphs,
  EMPTY_AGREEMENT,
  estimateTransferCost,
  TRANSFER_CLASS_LABELS,
  TRANSFER_DEADLINE_DAYS,
  transferDeadline,
  type SaleAgreementFields,
  type TransferVehicleClass,
} from "@/lib/transferKit";

const CHECK_KEY = "motormila.transfer_checklist.v1";

type Translate = ReturnType<typeof useAppPreferences>["t"];

function checklist(t: Translate): Array<{ phase: string; items: Array<{ id: string; text: string }> }> {
  return [
    {
      phase: t("tools.transfer.phase.before", "Before any money changes hands"),
      items: [
        { id: "cr-name", text: t("tools.transfer.item.cr-name", "The name on the Certificate of Registration (CR) matches the seller's NIC.") },
        { id: "dmt-record", text: t("tools.transfer.item.dmt-record", "DMT online record checked: registered owner, absolute owner (lease or loan) and engine number match the CR.") },
        { id: "numbers", text: t("tools.transfer.item.numbers", "Chassis and engine numbers on the car match the CR (check the stamped plates yourself).") },
        { id: "finance-release", text: t("tools.transfer.item.finance-release", "If a leasing company or bank is the absolute owner: you have their written release or settlement letter.") },
        { id: "customs", text: t("tools.transfer.item.customs", "Imported car: Customs vehicle check shows it was cleared legally.") },
        { id: "licence", text: t("tools.transfer.item.licence", "Revenue licence and emission test certificate are current.") },
        { id: "inspection", text: t("tools.transfer.item.inspection", "Independent mechanic inspection or test drive done. Mileage looks consistent with service records.") },
      ],
    },
    {
      phase: t("tools.transfer.phase.day", "On the day of sale"),
      items: [
        { id: "mta6", text: t("tools.transfer.item.mta6", "Transfer application (MTA-6) filled in and signed by both seller and buyer, and dated.") },
        { id: "nic-copies", text: t("tools.transfer.item.nic-copies", "Copies of both NICs, plus the original CR, handed over.") },
        { id: "agreement", text: t("tools.transfer.item.agreement", "Sale agreement signed by both parties and two witnesses. Each keeps a copy.") },
        { id: "payment", text: t("tools.transfer.item.payment", "Payment by bank transfer or bank draft, with a receipt. Avoid large cash payments.") },
        { id: "handover", text: t("tools.transfer.item.handover", "All keys, the service book and the handover time are written down.") },
        { id: "no-open", text: t("tools.transfer.item.no-open", "No \u201copen papers\u201d: never sign undated or blank transfer forms.") },
      ],
    },
    {
      phase: t("tools.transfer.phase.after", "Within {days} days", { days: TRANSFER_DEADLINE_DAYS }),
      items: [
        { id: "submit", text: t("tools.transfer.item.submit", "Transfer submitted to the Department of Motor Traffic (head office or a district office). The submission receipt is kept.") },
        { id: "insurance", text: t("tools.transfer.item.insurance", "Insurance moved to the new owner's name.") },
        { id: "seller-copy", text: t("tools.transfer.item.seller-copy", "Seller keeps copies of the MTA-6, agreement and DMT receipt. These protect you from fines or accidents after the sale.") },
      ],
    },
  ];
}

const CLASS_KEYS: Record<TransferVehicleClass, string> = {
  motor_car: "tools.transfer.class.car",
  dual_purpose: "tools.transfer.class.dual",
  motorcycle: "tools.transfer.class.bike",
  three_wheeler: "tools.transfer.class.tuk",
};

async function downloadAgreementPdf(fields: SaleAgreementFields) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 18;
  const width = 210 - margin * 2;
  let y = 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("VEHICLE SALE AGREEMENT", 105, y, { align: "center" });
  y += 9;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);

  for (const para of buildAgreementParagraphs(fields)) {
    const lines = doc.splitTextToSize(para, width) as string[];
    if (y + lines.length * 5.2 > 255) {
      doc.addPage();
      y = 22;
    }
    doc.text(lines, margin, y);
    y += lines.length * 5.2 + 3;
  }

  y += 6;
  if (y > 230) {
    doc.addPage();
    y = 30;
  }
  const col = width / 2;
  const sig = (label: string, x: number, yy: number) => {
    doc.line(x, yy, x + col - 10, yy);
    doc.setFontSize(9);
    doc.text(label, x, yy + 4.5);
    doc.setFontSize(10.5);
  };
  sig("Seller signature & date", margin, y + 12);
  sig("Buyer signature & date", margin + col, y + 12);
  sig("Witness 1: name, NIC, signature", margin, y + 32);
  sig("Witness 2: name, NIC, signature", margin + col, y + 32);

  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(
    doc.splitTextToSize(
      "Template generated by Motormila (motormila.vercel.app). It is not legal advice. Check current requirements with the Department of Motor Traffic and, for high-value or financed vehicles, a lawyer.",
      width,
    ) as string[],
    margin,
    285,
  );

  const name = fields.regNo ? `sale-agreement-${fields.regNo.replace(/[^A-Za-z0-9-]/g, "")}.pdf` : "vehicle-sale-agreement.pdf";
  doc.save(name);
}

/** Safe-Transfer Kit: ownership-transfer checklist, deadline, costs and a printable sale agreement. */
export default function SafeTransfer() {
  const { t } = useAppPreferences();
  const still = useReducedMotionOrLowData();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [vehicleClass, setVehicleClass] = useState<TransferVehicleClass>("motor_car");
  const [salePrice, setSalePrice] = useState(6_000_000);
  const [stampPct, setStampPct] = useState(0);
  const [extras, setExtras] = useState(0);
  const [fields, setFields] = useState<SaleAgreementFields>(EMPTY_AGREEMENT);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Title/description come from RouteMeta (translated, matches the prerendered shell).
    try {
      setChecked(JSON.parse(localStorage.getItem(CHECK_KEY) || "{}") || {});
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(CHECK_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  const CHECKLIST = checklist(t);
  const { deadline, strict } = transferDeadline(saleDate);
  const cost = useMemo(
    () => estimateTransferCost({ vehicleClass, salePriceLkr: salePrice, stampDutyPct: stampPct, extrasLkr: extras }),
    [vehicleClass, salePrice, stampPct, extras],
  );
  const total = CHECKLIST.reduce((n, p) => n + p.items.length, 0);
  const done = CHECKLIST.reduce((n, p) => n + p.items.filter((i) => checked[i.id]).length, 0);
  const setField = (k: keyof SaleAgreementFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((prev) => ({ ...prev, [k]: e.target.value }));

  const onDownload = async () => {
    setBusy(true);
    try {
      await downloadAgreementPdf({ ...fields, saleDate: fields.saleDate || saleDate });
      toast.success(t("transfer.pdfReady", "Sale agreement downloaded"));
    } catch {
      toast.error(t("transfer.pdfError", "Couldn't create the PDF. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const agreementFields: Array<{ key: keyof SaleAgreementFields; label: string; wide?: boolean; type?: string }> = [
    { key: "sellerName", label: t("tools.transfer.f.sellerName", "Seller full name") },
    { key: "sellerNic", label: t("tools.transfer.f.sellerNic", "Seller NIC") },
    { key: "sellerAddress", label: t("tools.transfer.f.sellerAddress", "Seller address"), wide: true },
    { key: "buyerName", label: t("tools.transfer.f.buyerName", "Buyer full name") },
    { key: "buyerNic", label: t("tools.transfer.f.buyerNic", "Buyer NIC") },
    { key: "buyerAddress", label: t("tools.transfer.f.buyerAddress", "Buyer address"), wide: true },
    { key: "regNo", label: t("tools.transfer.f.regNo", "Registration number") },
    { key: "makeModel", label: t("tools.transfer.f.makeModel", "Make and model") },
    { key: "yearOfManufacture", label: t("tools.transfer.f.year", "Year of manufacture") },
    { key: "mileageKm", label: t("tools.transfer.f.mileage", "Odometer (km)") },
    { key: "chassisNo", label: t("tools.transfer.f.chassis", "Chassis number") },
    { key: "engineNo", label: t("tools.transfer.f.engine", "Engine number") },
    { key: "priceLkr", label: t("tools.transfer.f.price", "Total price (LKR)") },
    { key: "amountPaidLkr", label: t("tools.transfer.f.paid", "Amount paid today (LKR)") },
    { key: "saleDate", label: t("transfer.saleDate", "Date of sale"), type: "date" },
    { key: "place", label: t("tools.transfer.f.place", "Place") },
  ];

  const deadlineText = deadline
    ? new Date(`${deadline}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : null;

  const form = (
    <>
      <Notice tone="caution" role="note">
        {t(
          "transfer.strictNotice",
          "From 1 December 2026 the Department of Motor Traffic says it will strictly enforce the rule that ownership transfers are submitted within 14 days of sale. Until the transfer is registered, the seller can be held liable for the vehicle. Rules and fees can change, so check with the DMT before you rely on any figure here.",
        )}
      </Notice>

      <FormCard icon={ClipboardCheck} title={t("transfer.checklist", "Transfer checklist")}>
        <div className="space-y-6">
          {CHECKLIST.map((phase) => (
            <fieldset key={phase.phase}>
              <legend className="mb-1.5 text-caption font-semibold uppercase tracking-caps text-label-2">{phase.phase}</legend>
              <div className="-mx-2 space-y-0.5">
                {phase.items.map((item) => (
                  <CheckRow key={item.id} id={`transfer-${item.id}`} checked={!!checked[item.id]} onCheckedChange={() => toggle(item.id)} muted>
                    {item.text}
                  </CheckRow>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </FormCard>
    </>
  );

  const after = (
    <>
      <FormCard icon={Receipt} title={t("transfer.cost", "Transfer cost estimate")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("transfer.class", "Vehicle type")} htmlFor="transfer-class">
            <SimpleSelect
              id="transfer-class"
              value={vehicleClass}
              onValueChange={(v) => setVehicleClass(v as TransferVehicleClass)}
              options={(Object.keys(TRANSFER_CLASS_LABELS) as TransferVehicleClass[]).map((k) => ({
                value: k,
                label: t(CLASS_KEYS[k], TRANSFER_CLASS_LABELS[k]),
              }))}
            />
          </Field>
          <NumberField id="transfer-price" label={t("transfer.price", "Sale price (LKR)")} value={salePrice} onChange={setSalePrice} prefix="Rs" step={100_000} />
          <NumberField id="transfer-stamp" label={t("transfer.stamp", "Stamp duty on sale value, if charged (%)")} value={stampPct} onChange={setStampPct} suffix="%" step={0.5} />
          <NumberField id="transfer-extras" label={t("transfer.extras", "Other costs: DMT record, lawyer, inspection (LKR)")} value={extras} onChange={setExtras} prefix="Rs" step={1_000} />
        </div>
      </FormCard>

      <FormCard
        icon={FileText}
        title={t("transfer.agreement", "Sale agreement (PDF)")}
        description={t("transfer.agreementBody", "Fill in what you know. Blank fields print as lines to complete by hand. Nothing you type leaves your device.")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {agreementFields.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`agreement-${f.key}`} className={f.wide ? "sm:col-span-2" : undefined}>
              <Input
                id={`agreement-${f.key}`}
                type={f.type ?? "text"}
                value={f.key === "saleDate" ? fields.saleDate || saleDate : fields[f.key]}
                onChange={setField(f.key)}
              />
            </Field>
          ))}
        </div>
        <div className="flex flex-col gap-3 border-t border-separator pt-4 sm:flex-row sm:items-center">
          <Button type="button" size="lg" onClick={onDownload} loading={busy}>
            <FileDown aria-hidden />
            {busy ? t("transfer.generating", "Preparing PDF…") : t("transfer.download", "Download sale agreement")}
          </Button>
          <p className="text-caption text-label-2">
            {t("transfer.legal", "This is a general template, not legal advice. For financed or high-value vehicles, ask a lawyer to review it.")}
          </p>
        </div>
      </FormCard>
    </>
  );

  const result = (
    <>
      <Card aria-live="polite">
        <p className="text-footnote font-semibold text-primary">{t("tools.transfer.progressTitle", "Checklist progress")}</p>
        <span className="sr-only">{t("transfer.progress", "{done} of {total} done", { done, total })}</span>
        <p className="mt-2 font-display text-large font-semibold text-foreground" aria-hidden>
          <AnimatedNumber value={done} />
          <span className="text-title2 text-label-2"> / {total}</span>
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <m.div
            className="h-full w-full origin-left rounded-full bg-primary"
            initial={false}
            animate={{ scaleX: total ? done / total : 0 }}
            transition={still ? { duration: 0 } : spring.smooth}
          />
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
          <h2 className="text-callout font-semibold text-foreground">{t("transfer.deadline", "Your transfer deadline")}</h2>
        </div>
        <Field label={t("transfer.saleDate", "Date of sale")} htmlFor="transfer-sale-date" className="mt-4">
          <Input id="transfer-sale-date" type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
        </Field>
        {deadlineText ? (
          <p className="mt-4 text-body text-foreground" aria-live="polite">
            {t("transfer.submitBy", "Submit the transfer to the DMT by")} <strong className="font-semibold tabular-nums">{deadlineText}</strong>.
          </p>
        ) : null}
        <p className="mt-1.5 text-footnote text-label-2">
          {strict
            ? t("transfer.strictYes", "This falls within strict enforcement (from {date}).", { date: "1 Dec 2026" })
            : t("transfer.strictNo", "The 14-day rule already applies. Strict enforcement starts {date}.", { date: "1 Dec 2026" })}
        </p>
      </Card>

      <ResultCard
        emphasis={false}
        label={t("transfer.cost", "Transfer cost estimate")}
        value={<AnimatedLkr value={cost.totalLkr} />}
        caption={t("transfer.costNote", "Indicative only. Check current fees with the DMT. Late-transfer penalties aren't included.")}
      >
        <ResultRows>
          <ResultRow label={t("transfer.fee", "DMT transfer fee (indicative)")} value={<AnimatedLkr value={cost.transferFeeLkr} />} />
          <ResultRow label={t("transfer.stampLine", "Stamp duty")} value={<AnimatedLkr value={cost.stampDutyLkr} />} />
          <ResultRow label={t("transfer.extrasLine", "Other")} value={<AnimatedLkr value={cost.extrasLkr} />} />
        </ResultRows>
      </ResultCard>
    </>
  );

  return (
    <ToolPage
      header={
        <PageHeader
          eyebrow={t("transfer.eyebrow", "Safe-Transfer Kit")}
          eyebrowIcon={ShieldCheck}
          title={t("transfer.title", "Transfer ownership safely")}
          description={t(
            "transfer.description",
            "A step-by-step checklist, your 14-day deadline, a cost estimate and a sale agreement you can print. For buyers and sellers of used vehicles in Sri Lanka.",
          )}
        />
      }
    >
      <ToolGrid form={form} after={after} result={result} />
    </ToolPage>
  );
}
