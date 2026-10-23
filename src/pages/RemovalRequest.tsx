import { useId, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, EyeOff, Loader2 } from "lucide-react";
import { LegalPageShell, LegalSection, PRIVACY_EMAIL } from "@/components/money/LegalPageShell";
import { HONEYPOT_STYLE, INPUT_CLASS, LABEL_CLASS, PRIMARY_BUTTON_CLASS, TEXTAREA_CLASS } from "@/components/money/formStyles";
import { submitRemovalRequest, type LegalReceipt, type RemovalPayload } from "@/lib/moneyApi";

const REASONS: { value: RemovalPayload["reason"]; label: string }[] = [
  { value: "my_listing", label: "It's my ad and I want it removed" },
  { value: "personal_data", label: "It shows my name, phone number or a photo of me" },
  { value: "copyright", label: "It uses my photo or text without permission" },
  { value: "sold_or_outdated", label: "The vehicle is sold or the ad is out of date" },
  { value: "inaccurate", label: "The information is wrong" },
  { value: "other", label: "Something else" },
];

const ROLES: { value: NonNullable<RemovalPayload["requester_role"]>; label: string }[] = [
  { value: "seller", label: "Seller / dealer" },
  { value: "rights_holder", label: "Owner of the photo or text" },
  { value: "pictured_person", label: "Person shown in the ad" },
  { value: "other", label: "Other" },
];

export default function RemovalRequest() {
  const uid = useId();
  const [params] = useSearchParams();
  const [url, setUrl] = useState(params.get("url") ?? "");
  const [reason, setReason] = useState<RemovalPayload["reason"]>("my_listing");
  const [role, setRole] = useState<NonNullable<RemovalPayload["requester_role"]>>("seller");
  const [details, setDetails] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<LegalReceipt | null>(null);

  return (
    <LegalPageShell
      icon={EyeOff}
      eyebrow="Removal"
      title="Remove a listing or my data"
      description="Ask us to take down a listing, your personal details, or your photos. We act within 72 hours."
      showEffectiveDate={false}
    >
      <LegalSection title="How it works">
        <ul>
          <li>Paste the MotorMila link (or the original ad link) and tell us why.</li>
          <li>We review it and act within <strong>72 hours</strong>: we hide the listing, remove the details or photo, and stop collecting that ad again.</li>
          <li>We email you when it's done. If we need to check that the ad is yours, we'll ask by email.</li>
        </ul>
      </LegalSection>

      {receipt ? (
        <div role="status" className="rounded-2xl border border-deal-good/25 bg-deal-good/10 p-5">
          <p className="flex items-center gap-2 text-body font-semibold text-deal-good-text">
            <Check aria-hidden className="h-4 w-4" /> Request received · ref {receipt.reference}
          </p>
          <p className="mt-2 text-footnote text-foreground/80">{receipt.message}</p>
        </div>
      ) : (
        <form
          className="relative space-y-4 rounded-[1.75rem] border border-border bg-card p-6 shadow-soft"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (!/^https?:\/\/\S+$/i.test(url.trim())) return setError("Paste the full link, starting with https://");
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter your email so we can reply.");
            if (!confirm) return setError("Please confirm the information is accurate.");
            setSending(true);
            try {
              setReceipt(
                await submitRemovalRequest({
                  listing_url: url.trim(),
                  reason,
                  requester_role: role,
                  details: details.trim() || undefined,
                  name: name.trim() || undefined,
                  email: email.trim(),
                  phone: phone.trim() || undefined,
                  confirm_accurate: true,
                  website: honeypot || undefined,
                }),
              );
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't send your request.");
            } finally {
              setSending(false);
            }
          }}
        >
          <div style={HONEYPOT_STYLE} aria-hidden="true">
            <label htmlFor={`${uid}-website`}>Website</label>
            <input id={`${uid}-website`} tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor={`${uid}-url`}>Listing link</label>
            <input id={`${uid}-url`} className={INPUT_CLASS} type="url" placeholder="https://motormila.vercel.app/listing/12345" value={url} onChange={(e) => setUrl(e.target.value)} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS} htmlFor={`${uid}-reason`}>Reason</label>
              <select id={`${uid}-reason`} className={INPUT_CLASS} value={reason} onChange={(e) => setReason(e.target.value as RemovalPayload["reason"])}>
                {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor={`${uid}-role`}>You are the</label>
              <select id={`${uid}-role`} className={INPUT_CLASS} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor={`${uid}-details`}>Details <span className="font-normal text-muted-foreground">(optional)</span></label>
            <textarea id={`${uid}-details`} className={TEXTAREA_CLASS} maxLength={2000} placeholder="What should we remove? e.g. the phone number, photo 3, the whole ad" value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={LABEL_CLASS} htmlFor={`${uid}-name`}>Name <span className="font-normal text-muted-foreground">(optional)</span></label>
              <input id={`${uid}-name`} className={INPUT_CLASS} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor={`${uid}-email`}>Email</label>
              <input id={`${uid}-email`} className={INPUT_CLASS} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor={`${uid}-phone`}>Phone <span className="font-normal text-muted-foreground">(optional)</span></label>
              <input id={`${uid}-phone`} className={INPUT_CLASS} type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 text-caption leading-relaxed text-foreground/85" htmlFor={`${uid}-confirm`}>
            <input id={`${uid}-confirm`} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            <span>The information I've given is accurate, and I'm the person concerned or allowed to act for them.</span>
          </label>
          {error && <p role="alert" className="text-caption font-semibold text-destructive">{error}</p>}
          <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={sending}>
            {sending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
            Send removal request
          </button>
          <p className="text-caption text-muted-foreground">
            Prefer email? Write to <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> with the link and the reason.
          </p>
        </form>
      )}
    </LegalPageShell>
  );
}
