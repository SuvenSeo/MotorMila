import { useEffect, useId, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { LEAD_CONSENT, leadCopy, type LeadKind } from "@/lib/leadConsent";
import { getLeadPartners, submitLead, type LeadPartner, type LeadReceipt } from "@/lib/moneyApi";
import { trackEvent } from "@/lib/analytics";
import { HONEYPOT_STYLE } from "./formStyles";
import { useAppPreferences } from "@/lib/appPreferences";
import { friendlyApiError } from "@/lib/apiErrorText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdornedInput, CheckRow, Field, Notice } from "@/components/tools/ToolKit";

type ListingContext = { id?: number; vehicle?: string; priceLkr?: number; district?: string };

function toInt(value: string): number | undefined {
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return undefined;
  const n = Number(digits);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Consented lead form for leasing, inspection or insurance requests.
 * Works standalone (/finance, /inspection, /insurance) or on a listing.
 */
export function LeadRequestForm({
  kind,
  listing,
  sourcePage,
  compact = false,
}: {
  kind: LeadKind;
  listing?: ListingContext;
  sourcePage?: string;
  compact?: boolean;
}) {
  const uid = useId();
  const { t } = useAppPreferences();
  const copy = leadCopy(kind, t);
  const consent = LEAD_CONSENT[kind];
  const [partners, setPartners] = useState<LeadPartner[] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [district, setDistrict] = useState(listing?.district ?? "");
  const [vehicle, setVehicle] = useState(listing?.vehicle ?? "");
  const [budget, setBudget] = useState(listing?.priceLkr ? String(listing.priceLkr) : "");
  const [downPayment, setDownPayment] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [notes, setNotes] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<LeadReceipt | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLeadPartners(kind)
      .then((data) => !cancelled && setPartners(data.partners))
      .catch(() => !cancelled && setPartners([]));
    return () => {
      cancelled = true;
    };
  }, [kind]);

  if (receipt) {
    return (
      <Notice tone="success" role="status" title={t("tools.lead.sent", "Request sent · ref {ref}", { ref: receipt.reference })}>
        <p className="text-label-2">{receipt.message}</p>
      </Notice>
    );
  }

  const partnerNames = (partners ?? []).map((p) => (p.licence ? `${p.name} (${p.licence})` : p.name));
  const optional = t("tools.optional", "optional");
  const id = (name: string) => `${uid}-${name}`;

  return (
    <form
      className="relative space-y-5"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (name.trim().length < 2) return setError(t("tools.lead.errName", "Please enter your name."));
        if (!/^(\+?94|0)?\d{9}$/.test(phone.replace(/[\s\-()]/g, "")))
          return setError(t("tools.lead.errPhone", "Please enter a valid Sri Lankan phone number, e.g. 077 123 4567."));
        if (!agreed) return setError(t("tools.lead.errConsent", "Please tick the consent box so we can pass your request on."));
        setSending(true);
        try {
          const result = await submitLead({
            kind,
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim() || undefined,
            district: district.trim() || undefined,
            vehicle: vehicle.trim() || undefined,
            listing_id: listing?.id,
            budget_lkr: toInt(budget),
            down_payment_lkr: kind === "finance" ? toInt(downPayment) : undefined,
            preferred_date: kind === "inspection" ? preferredDate || undefined : undefined,
            notes: notes.trim() || undefined,
            source_page: sourcePage ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
            consent: true,
            consent_version: consent.version,
            website: honeypot || undefined,
          });
          trackEvent("lead_submitted", { kind, listing: listing?.id ?? null });
          setReceipt(result);
        } catch (err) {
          setError(friendlyApiError(err, t("tools.lead.errSend", "Couldn't send your request. Please try again."), t));
        } finally {
          setSending(false);
        }
      }}
    >

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("tools.lead.name", "Your name")} htmlFor={id("name")}>
          <Input id={id("name")} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label={t("tools.lead.phone", "Phone")} htmlFor={id("phone")}>
          <Input id={id("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="077 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </Field>
        <Field label={t("tools.lead.email", "Email")} htmlFor={id("email")} optional optionalLabel={optional}>
          <Input id={id("email")} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t("tools.lead.district", "District")} htmlFor={id("district")} optional optionalLabel={optional}>
          <Input id={id("district")} placeholder="Colombo" value={district} onChange={(e) => setDistrict(e.target.value)} />
        </Field>
        <Field label={t("tools.lead.vehicle", "Vehicle")} htmlFor={id("vehicle")} className="sm:col-span-2">
          <Input id={id("vehicle")} placeholder={t("tools.lead.vehiclePh", "e.g. Toyota Aqua 2015")} value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
        </Field>
        <Field
          label={kind === "finance" ? t("tools.lead.budget", "Vehicle price / budget (LKR)") : t("tools.lead.value", "Vehicle value (LKR)")}
          htmlFor={id("budget")}
        >
          <AdornedInput id={id("budget")} prefix="Rs" inputMode="numeric" placeholder="6,500,000" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </Field>
        {kind === "finance" && (
          <Field label={t("tools.lead.down", "Down payment (LKR)")} htmlFor={id("down")} optional optionalLabel={optional}>
            <AdornedInput id={id("down")} prefix="Rs" inputMode="numeric" placeholder="2,000,000" value={downPayment} onChange={(e) => setDownPayment(e.target.value)} />
          </Field>
        )}
        {kind === "inspection" && (
          <Field label={t("tools.lead.date", "Preferred date")} htmlFor={id("date")}>
            <Input id={id("date")} type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />
          </Field>
        )}
        {!compact && (
          <Field label={t("tools.lead.notes", "Anything else?")} htmlFor={id("notes")} optional optionalLabel={optional} className="sm:col-span-2">
            <Textarea id={id("notes")} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        )}
      </div>

      <div className="rounded-card border border-border bg-surface-2 p-4">
        <p className="flex items-start gap-2 text-footnote font-semibold text-foreground">
          <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            {copy.partnerLabel}:{" "}
            <span className="font-normal text-label-2">
              {partners === null
                ? t("tools.lead.partnersLoading", "loading…")
                : partnerNames.length
                  ? partnerNames.join(", ")
                  : t("tools.lead.partnersNone", "we'll match you with a partner and tell you who before they call")}
            </span>
          </span>
        </p>
        <div className="-mx-2 mt-2">
          <CheckRow id={id("consent")} checked={agreed} onCheckedChange={setAgreed}>
            <span className="text-footnote text-label-1">
              {consent.text}{" "}
              <Link to="/privacy" className="font-semibold text-primary underline-offset-2 hover:underline">
                {t("tools.lead.privacy", "Privacy Policy")}
              </Link>
            </span>
          </CheckRow>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-footnote font-medium text-deal-high-text">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" loading={sending} className="w-full sm:w-auto">
        {copy.cta}
      </Button>
      <div style={HONEYPOT_STYLE} aria-hidden="true">
        <label htmlFor={id("website")}>Website</label>
        <input id={id("website")} tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
      </div>
    </form>
  );
}

export default LeadRequestForm;
