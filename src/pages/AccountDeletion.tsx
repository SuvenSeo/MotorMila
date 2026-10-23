import { useId, useState } from "react";
import { Check, Loader2, UserX } from "lucide-react";
import { LegalPageShell, LegalSection, PRIVACY_EMAIL } from "@/components/money/LegalPageShell";
import { HONEYPOT_STYLE, INPUT_CLASS, LABEL_CLASS, PRIMARY_BUTTON_CLASS, TEXTAREA_CLASS } from "@/components/money/formStyles";
import { submitAccountDeletion, type LegalReceipt } from "@/lib/moneyApi";
import { BACKEND_AUTH_ENABLED, useAuth } from "@/lib/authContext";
import { SelfServeDeletion } from "@/components/account/SelfServeDeletion";
import { useAppPreferences } from "@/lib/appPreferences";

export default function AccountDeletion() {
  const uid = useId();
  const { user } = useAuth();
  const { t } = useAppPreferences();
  // Stays true after a successful self-serve delete (logout clears `user`).
  const [selfDeleted, setSelfDeleted] = useState(false);
  const selfServe = Boolean(user && BACKEND_AUTH_ENABLED) || selfDeleted;
  const [email, setEmail] = useState(user?.email ?? "");
  const [details, setDetails] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<LegalReceipt | null>(null);

  return (
    <LegalPageShell
      icon={UserX}
      eyebrow="Account"
      title="Delete my account"
      description="Close your MotorMila account and delete the personal data linked to it."
      showEffectiveDate={false}
    >
      <LegalSection title="What gets deleted">
        <ul>
          <li>Your account (email, name, password hash), saved searches, alerts, watchlist and notification settings.</li>
          <li>Ads you posted on MotorMila, and your leasing, inspection or insurance requests.</li>
          <li>Push, Telegram and WhatsApp alert subscriptions.</li>
        </ul>
        <p>
          We keep payment records for 6 years because tax law requires it, and a short note that we deleted your
          account. Anything already sent to a partner at your request is covered by that partner's privacy policy.
          We'll ask them to delete it too.
        </p>
        <p>
          {selfServe
            ? t("deleteAcct.instantNote", "Because you're signed in, you can delete your account right now below.")
            : t("deleteAcct.emailNote", "We confirm by email that the request is yours, then finish within 14 days. Signed-in users can delete instantly.")}
        </p>
      </LegalSection>

      {/* Signed in against the live API: delete instantly via DELETE /auth/me.
          Signed out (or preview builds): the emailed request form below. */}
      {selfServe ? (
        <SelfServeDeletion onDeleted={() => setSelfDeleted(true)} />
      ) : receipt ? (
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
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter the email you use to sign in.");
            if (!confirm) return setError("Please confirm you want your account deleted.");
            setSending(true);
            try {
              setReceipt(await submitAccountDeletion({ email: email.trim(), details: details.trim() || undefined, confirm: true, website: honeypot || undefined }));
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
            <label className={LABEL_CLASS} htmlFor={`${uid}-email`}>Account email</label>
            <input id={`${uid}-email`} className={INPUT_CLASS} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor={`${uid}-details`}>Anything we should know? <span className="font-normal text-muted-foreground">(optional)</span></label>
            <textarea id={`${uid}-details`} className={TEXTAREA_CLASS} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 text-caption leading-relaxed text-foreground/85" htmlFor={`${uid}-confirm`}>
            <input id={`${uid}-confirm`} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            <span>I want to delete my MotorMila account. I understand this can't be undone and any paid plan ends without a refund for unused time.</span>
          </label>
          {error && <p role="alert" className="text-caption font-semibold text-destructive">{error}</p>}
          <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={sending}>
            {sending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
            Request account deletion
          </button>
          <p className="text-caption text-muted-foreground">
            You can also email <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> from your account email.
          </p>
        </form>
      )}
    </LegalPageShell>
  );
}
