import { useEffect, useId, useState } from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { LEAD_CONSENT, LEAD_COPY, type LeadKind } from "@/lib/leadConsent";
import { getLeadPartners, submitLead, type LeadPartner, type LeadReceipt } from "@/lib/moneyApi";
import { trackEvent } from "@/lib/analytics";
import { HONEYPOT_STYLE, INPUT_CLASS, LABEL_CLASS, PRIMARY_BUTTON_CLASS, TEXTAREA_CLASS } from "./formStyles";

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
  const copy = LEAD_COPY[kind];
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
      <div role="status" className="rounded-2xl border border-deal-good/25 bg-deal-good/10 p-5">
        <p className="flex items-center gap-2 text-body font-semibold text-deal-good-text">
          <Check aria-hidden className="h-4 w-4" /> Request sent · ref {receipt.reference}
        </p>
        <p className="mt-2 text-footnote leading-relaxed text-foreground/80">{receipt.message}</p>
      </div>
    );
  }

  const partnerNames = (partners ?? []).map((p) => (p.licence ? `${p.name} (${p.licence})` : p.name));

  return (
    <form
      className="relative space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (name.trim().length < 2) return setError("Please enter your name.");
        if (!/^(\+?94|0)?\d{9}$/.test(phone.replace(/[\s\-()]/g, ""))) return setError("Please enter a valid Sri Lankan phone number, e.g. 077 123 4567.");
        if (!agreed) return setError("Please tick the consent box so we can pass your request on.");
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
          setError(err instanceof Error ? err.message : "Couldn't send your request. Please try again.");
        } finally {
          setSending(false);
        }
      }}
    >
      {!compact && <p className="text-footnote leading-relaxed text-muted-foreground">{copy.blurb}</p>}

      <div style={HONEYPOT_STYLE} aria-hidden="true">
        <label htmlFor={`${uid}-website`}>Website</label>
        <input id={`${uid}-website`} tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS} htmlFor={`${uid}-name`}>Your name</label>
          <input id={`${uid}-name`} className={INPUT_CLASS} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor={`${uid}-phone`}>Phone</label>
          <input id={`${uid}-phone`} className={INPUT_CLASS} type="tel" inputMode="tel" autoComplete="tel" placeholder="077 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor={`${uid}-email`}>Email <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input id={`${uid}-email`} className={INPUT_CLASS} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor={`${uid}-district`}>District <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input id={`${uid}-district`} className={INPUT_CLASS} placeholder="Colombo" value={district} onChange={(e) => setDistrict(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL_CLASS} htmlFor={`${uid}-vehicle`}>Vehicle</label>
          <input id={`${uid}-vehicle`} className={INPUT_CLASS} placeholder="e.g. Toyota Aqua 2015" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor={`${uid}-budget`}>{kind === "finance" ? "Vehicle price / budget (LKR)" : "Vehicle value (LKR)"}</label>
          <input id={`${uid}-budget`} className={INPUT_CLASS} inputMode="numeric" placeholder="6,500,000" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </div>
        {kind === "finance" && (
          <div>
            <label className={LABEL_CLASS} htmlFor={`${uid}-down`}>Down payment (LKR) <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input id={`${uid}-down`} className={INPUT_CLASS} inputMode="numeric" placeholder="2,000,000" value={downPayment} onChange={(e) => setDownPayment(e.target.value)} />
          </div>
        )}
        {kind === "inspection" && (
          <div>
            <label className={LABEL_CLASS} htmlFor={`${uid}-date`}>Preferred date</label>
            <input id={`${uid}-date`} className={INPUT_CLASS} type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />
          </div>
        )}
        {!compact && (
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS} htmlFor={`${uid}-notes`}>Anything else? <span className="font-normal text-muted-foreground">(optional)</span></label>
            <textarea id={`${uid}-notes`} className={TEXTAREA_CLASS} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-3.5">
        <p className="mb-2 flex items-center gap-1.5 text-caption font-semibold text-foreground">
          <ShieldCheck aria-hidden className="h-3.5 w-3.5 text-primary" />
          {copy.partnerLabel}:{" "}
          <span className="font-normal text-foreground/80">
            {partners === null ? "loading…" : partnerNames.length ? partnerNames.join(", ") : "we'll match you with a partner and tell you who before they call"}
          </span>
        </p>
        <label className="flex cursor-pointer items-start gap-2.5 text-caption leading-relaxed text-foreground/85" htmlFor={`${uid}-consent`}>
          <input
            id={`${uid}-consent`}
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>
            {consent.text} See our <Link to="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
          </span>
        </label>
      </div>

      {error && (
        <p role="alert" className="text-caption font-semibold text-destructive">
          {error}
        </p>
      )}

      <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={sending}>
        {sending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
        {copy.cta}
      </button>
    </form>
  );
}

export default LeadRequestForm;
