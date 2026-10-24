import { useId, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EyeOff, ListChecks, Send } from "lucide-react";
import { LEGAL_LINKS, PRIVACY_EMAIL } from "@/components/money/LegalPageShell";
import { HONEYPOT_STYLE } from "@/components/money/formStyles";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/ui/select";
import { CheckRow, Field, FormCard, Notice, ToolGrid, ToolPage } from "@/components/tools/ToolKit";
import { useAppPreferences } from "@/lib/appPreferences";
import { friendlyApiError } from "@/lib/apiErrorText";
import { submitRemovalRequest, type LegalReceipt, type RemovalPayload } from "@/lib/moneyApi";

type Reason = RemovalPayload["reason"];
type Role = NonNullable<RemovalPayload["requester_role"]>;

export default function RemovalRequest() {
  const uid = useId();
  const { t } = useAppPreferences();
  const [params] = useSearchParams();
  const [url, setUrl] = useState(params.get("url") ?? "");
  const [reason, setReason] = useState<Reason>("my_listing");
  const [role, setRole] = useState<Role>("seller");
  const [details, setDetails] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<LegalReceipt | null>(null);

  const reasons: { value: Reason; label: string }[] = [
    { value: "my_listing", label: t("tools.removal.reason.mine", "It's my ad and I want it removed") },
    { value: "personal_data", label: t("tools.removal.reason.personal", "It shows my name, phone number or a photo of me") },
    { value: "copyright", label: t("tools.removal.reason.copyright", "It uses my photo or text without permission") },
    { value: "sold_or_outdated", label: t("tools.removal.reason.sold", "The vehicle is sold or the ad is out of date") },
    { value: "inaccurate", label: t("tools.removal.reason.wrong", "The information is wrong") },
    { value: "other", label: t("tools.removal.reason.other", "Something else") },
  ];
  const roles: { value: Role; label: string }[] = [
    { value: "seller", label: t("tools.removal.role.seller", "Seller / dealer") },
    { value: "rights_holder", label: t("tools.removal.role.rights", "Owner of the photo or text") },
    { value: "pictured_person", label: t("tools.removal.role.pictured", "Person shown in the ad") },
    { value: "other", label: t("tools.removal.role.other", "Other") },
  ];
  const optional = t("tools.optional", "optional");
  const id = (n: string) => `${uid}-${n}`;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^https?:\/\/\S+$/i.test(url.trim())) return setError(t("tools.removal.errUrl", "Paste the full link, starting with https://"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError(t("tools.removal.errEmail", "Enter your email so we can reply."));
    if (!confirm) return setError(t("tools.removal.errConfirm", "Please confirm the information is accurate."));
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
      setError(friendlyApiError(err, t("tools.removal.errSend", "Couldn't send your request."), t));
    } finally {
      setSending(false);
    }
  };

  const form = receipt ? (
    <Notice tone="success" role="status" title={t("tools.removal.received", "Request received · ref {ref}", { ref: receipt.reference })}>
      <p className="text-label-2">{receipt.message}</p>
    </Notice>
  ) : (
    <FormCard icon={EyeOff} title={t("tools.removal.formTitle", "Your request")}>
      <form className="relative space-y-5" noValidate onSubmit={onSubmit}>
        <Field label={t("tools.removal.url", "Listing link")} htmlFor={id("url")}>
          <Input
            id={id("url")}
            type="url"
            placeholder="https://motormila.vercel.app/listing/12345"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("tools.removal.reason", "Reason")} htmlFor={id("reason")}>
            <SimpleSelect id={id("reason")} value={reason} onValueChange={(v) => setReason(v as Reason)} options={reasons} />
          </Field>
          <Field label={t("tools.removal.role", "You are the")} htmlFor={id("role")}>
            <SimpleSelect id={id("role")} value={role} onValueChange={(v) => setRole(v as Role)} options={roles} />
          </Field>
        </div>
        <Field label={t("tools.removal.details", "Details")} htmlFor={id("details")} optional optionalLabel={optional}>
          <Textarea
            id={id("details")}
            maxLength={2000}
            placeholder={t("tools.removal.detailsPh", "What should we remove? e.g. the phone number, photo 3, the whole ad")}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("tools.removal.name", "Name")} htmlFor={id("name")} optional optionalLabel={optional}>
            <Input id={id("name")} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t("tools.removal.email", "Email")} htmlFor={id("email")}>
            <Input id={id("email")} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label={t("tools.removal.phone", "Phone")} htmlFor={id("phone")} optional optionalLabel={optional}>
            <Input id={id("phone")} type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        <div className="-mx-2">
          <CheckRow id={id("confirm")} checked={confirm} onCheckedChange={setConfirm}>
            <span className="text-footnote">
              {t("tools.removal.confirm", "The information I've given is accurate, and I'm the person concerned or allowed to act for them.")}
            </span>
          </CheckRow>
        </div>
        {error && (
          <p role="alert" className="text-footnote font-medium text-deal-high-text">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-3 border-t border-separator pt-4 sm:flex-row sm:items-center">
          <Button type="submit" size="lg" loading={sending}>
            <Send aria-hidden />
            {t("tools.removal.submit", "Send removal request")}
          </Button>
          <p className="text-caption text-label-2">
            {t("tools.removal.preferEmail", "Prefer email? Write to us with the link and the reason:")}{" "}
            <a href={`mailto:${PRIVACY_EMAIL}`} className="font-semibold text-primary underline-offset-2 hover:underline">
              {PRIVACY_EMAIL}
            </a>
          </p>
        </div>
        <div style={HONEYPOT_STYLE} aria-hidden="true">
          <label htmlFor={id("website")}>Website</label>
          <input id={id("website")} tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>
      </form>
    </FormCard>
  );

  const howItWorks = (
    <>
      <Card>
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
          <h2 className="text-callout font-semibold text-foreground">{t("tools.removal.howTitle", "How it works")}</h2>
        </div>
        <ol className="mt-4 space-y-4">
          {[
            t("tools.removal.how1", "Paste the MotorMila link (or the original ad link) and tell us why."),
            t(
              "tools.removal.how2",
              "We review it and act within 72 hours: we hide the listing, remove the details or photo, and stop collecting that ad again.",
            ),
            t("tools.removal.how3", "We email you when it's done. If we need to check that the ad is yours, we'll ask by email."),
          ].map((text, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-caption font-semibold tabular-nums text-primary">
                {i + 1}
              </span>
              <span className="text-footnote text-label-1">{text}</span>
            </li>
          ))}
        </ol>
      </Card>
      <nav aria-label={t("tools.removal.legalNav", "Legal pages")} className="flex flex-wrap gap-2">
        {LEGAL_LINKS.filter((l) => l.to !== "/removal").map((l) => (
          <Button key={l.to} asChild variant="secondary" size="sm">
            <Link to={l.to}>{t(l.key, l.label)}</Link>
          </Button>
        ))}
      </nav>
    </>
  );

  return (
    <ToolPage
      header={
        <PageHeader
          eyebrow={t("tools.removal.eyebrow", "Removal")}
          eyebrowIcon={EyeOff}
          title={t("tools.removal.title", "Remove a listing or my data")}
          description={t(
            "tools.removal.description",
            "Ask us to take down a listing, your personal details, or your photos. We act within 72 hours.",
          )}
        />
      }
    >
      <ToolGrid form={form} result={howItWorks} />
    </ToolPage>
  );
}
