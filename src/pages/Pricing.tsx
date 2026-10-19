import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, BookOpen, Check, CreditCard, HelpCircle, Loader2, MessageCircle, Sparkles, Timer, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ParticleButton, type ParticleButtonHandle } from "@/components/ui/ParticleButton";
import { BRAND } from "@/lib/brand";
import { ANNUAL_SAVE_NUDGE, COMING_SOON_COPY, DEALER_TIERS, ICP_PERSONAS, PLAN_PRICES, PRICING_COMING_SOON, PRICING_FAQ, PRICING_TIERS, TRIAL_OFFER, formatLkr } from "@/lib/pricingContent";
import type { DealerTierCode } from "@/lib/pricingContent";
import { createPayhereCheckout, getPayhereConfig, submitPayhereForm, type PayhereConfig } from "@/lib/moneyApi";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { AtmosphericImage } from "@/components/AtmosphericImage";
import { revealItem } from "@/lib/motion";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import { visuals } from "@/lib/visualAssets";
import { API_BASE, sendFeedback } from "@/services/api";
import { toast } from "sonner";
import { authHeaders } from "@/lib/authToken";

type ManualPayInstructions = {
  plan: string;
  methods: string[];
  bankDetails: string;
  kokoNote: string;
  whatsappNumber?: string | null;
  contactEmail: string;
  activationWindow: string;
  steps: string[];
};

type CheckoutIntentResponse = {
  provider: "manual" | "payhere";
  checkout_url?: string | null;
  payhere_checkout_endpoint?: string | null;
  message: string;
  manual_pay?: ManualPayInstructions | null;
};

async function fetchCheckoutIntent(plan: string): Promise<CheckoutIntentResponse> {
  const res = await fetch(`${API_BASE}/billing/checkout-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeaders() },
    body: JSON.stringify({ plan }),
    credentials: "include",
  });
  if (!res.ok) throw new Error("checkout-intent request failed");
  return res.json() as Promise<CheckoutIntentResponse>;
}

/** Days left until an ISO trial expiry (null when unknown). */
function trialDaysLeftFromIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ends = new Date(iso).getTime();
  if (Number.isNaN(ends)) return null;
  const diff = ends - Date.now();
  if (diff <= 0) return 0;
  const days = Math.floor(diff / 86400000);
  return diff > 0 && days < 1 ? 1 : days;
}

/**
 * Trial countdown banner. Shows live days-left when the signed-in user is
 * trialing (reads /auth/me for trialEndsAt); otherwise shows the trial offer.
 * Exported so App shell can mount it globally later without touching routes.
 */
/**
 * Trial CTA that stays honest while paid plans are coming soon: instead of
 * linking to an invite-gated signup that errors ("Start 7-day free trial" ->
 * "missing invite token"), it collects an email for the launch waitlist.
 */
export function TrialCta({ className, label }: { className?: string; label?: string }) {
  const { t } = useAppPreferences();
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const burstRef = useRef<ParticleButtonHandle>(null);

  if (!PRICING_COMING_SOON) {
    return (
      <Link
        to={TRIAL_OFFER.ctaTo}
        className={className ?? "inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-[13px] font-semibold text-primary-foreground no-underline shadow-soft transition-all hover:bg-primary/90 active:scale-[0.98]"}
      >
        {label ?? t("pricing.startTrial", TRIAL_OFFER.cta)}
        <ArrowRight aria-hidden className="h-4 w-4" />
      </Link>
    );
  }

  if (done) {
    return (
      <p className="inline-flex h-11 items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-6 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
        <Check aria-hidden className="h-4 w-4" />
        {t("pricing.waitlistDone", "You're on the list — we'll email you at launch.")}
      </p>
    );
  }

  return (
    <form
      className="flex w-full max-w-sm items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const address = email.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
          toast.error(t("pricing.waitlistInvalid", "Enter a valid email address."));
          return;
        }
        setSending(true);
        try {
          await sendFeedback({ category: "general", route: "/pricing", message: "Pro trial waitlist signup", email: address });
          // Celebrate the join — KokonutUI-style particle burst (#5 UI review).
          // Fire before setDone unmounts the button; the canvas is body-fixed.
          burstRef.current?.burst();
          setDone(true);
        } catch {
          toast.error(t("pricing.waitlistFailed", "Couldn't join the waitlist — try again."));
        } finally {
          setSending(false);
        }
      }}
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("pricing.waitlistPlaceholder", "Email for launch invite")}
        aria-label={t("pricing.waitlistPlaceholder", "Email for launch invite")}
        className="h-11 min-w-0 flex-1 rounded-full border border-border bg-card px-4 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
      />
      <ParticleButton
        ref={burstRef}
        type="submit"
        disabled={sending}
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary px-5 text-[13px] font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60"
      >
        {sending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
        {t("pricing.waitlistCta", "Notify me")}
      </ParticleButton>
    </form>
  );
}

export function TrialCountdownBanner() {
  const { user } = useAuth();
  const { t } = useAppPreferences();
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(
    ((user as unknown as { trialEndsAt?: string })?.trialEndsAt ?? null),
  );
  const [trialDays, setTrialDays] = useState<number | null>(
    ((user as unknown as { trialDaysLeft?: number })?.trialDaysLeft ?? null),
  );

  useEffect(() => {
    const embeddedEnds = (user as unknown as { trialEndsAt?: string })?.trialEndsAt;
    const embeddedDays = (user as unknown as { trialDaysLeft?: number })?.trialDaysLeft;
    if (embeddedEnds) setTrialEndsAt(embeddedEnds);
    if (typeof embeddedDays === "number") setTrialDays(embeddedDays);
    if (user?.subscriptionStatus !== "trialing" || embeddedEnds) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(new URL(`${API_BASE}/auth/me`, window.location.origin).toString(), {
          headers: { Accept: "application/json", ...authHeaders() },
          credentials: "include",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { trialEndsAt?: string; trialDaysLeft?: number };
        if (data.trialEndsAt) setTrialEndsAt(data.trialEndsAt);
        if (typeof data.trialDaysLeft === "number") setTrialDays(data.trialDaysLeft);
      } catch {
        // Soft-fail: banner falls back to generic trial-active copy.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (user?.subscriptionStatus === "trialing") {    const days = trialDays ?? trialDaysLeftFromIso(trialEndsAt);
    return (
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/[0.07] px-5 py-4"
      >
        <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <Timer aria-hidden className="h-4 w-4 text-primary" />
          {days === null
            ? "Your 7-day free trial is active — annual saves 2 months."
            : days <= 0
              ? "Your free trial ended — pay manually to keep Pro (2-hour activation)."
              : `${days} day${days === 1 ? "" : "s"} left in your free trial — annual saves 2 months.`}
        </p>
        <Link
          to="/pricing"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground no-underline"
        >
          Keep Pro
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  if (!user) return null;

  if (user.plan !== "free") return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/[0.07] px-5 py-4">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        <Sparkles aria-hidden className="h-4 w-4 text-primary" />
        {PRICING_COMING_SOON
          ? t("pricing.waitlistBanner", "Pro is coming soon — join the waitlist for a launch invite.")
          : `${TRIAL_OFFER.cta} — no invite needed. Annual saves 2 months.`}
      </p>
      <TrialCta className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground no-underline transition-all hover:bg-primary/90" />
    </div>
  );
}

function ManualPayPanel({ plan, instructions, onClose }: { plan: string; instructions: ManualPayInstructions; onClose: () => void }) {
  const whatsappLink = instructions.whatsappNumber
    ? `https://wa.me/${instructions.whatsappNumber.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Motormila ${plan} upgrade — my account email is `)}`
    : null;
  return (
    <div role="status" className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-6 sm:p-7">
      <p className="section-eyebrow mb-2 inline-flex items-center gap-2">
        <MessageCircle aria-hidden className="h-3.5 w-3.5" />
        Manual pay — {plan}
      </p>
      <h3 className="text-[15px] font-bold text-foreground">
        Bank transfer or KOKO · activated within {instructions.activationWindow}
      </h3>
      <ol className="mt-4 space-y-2.5">
        {instructions.steps.map((step) => (
          <li key={step} className="flex gap-2.5 rounded-xl border border-border bg-card/60 p-3 text-[12px] leading-relaxed text-foreground/85">
            <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 grid gap-2 text-[12px] text-muted-foreground sm:grid-cols-2">
        <p className="rounded-xl border border-border bg-surface p-3"><span className="font-bold text-foreground">Bank: </span>{instructions.bankDetails}</p>
        <p className="rounded-xl border border-border bg-surface p-3"><span className="font-bold text-foreground">KOKO: </span>{instructions.kokoNote}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {whatsappLink && (
          <a
            href={whatsappLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[12px] font-semibold text-primary-foreground no-underline"
          >
            <MessageCircle aria-hidden className="h-4 w-4" />
            WhatsApp us ({instructions.activationWindow} activation)
          </a>
        )}
        <a
          href={`mailto:${instructions.contactEmail}?subject=Motormila%20${encodeURIComponent(plan)}%20plan%20upgrade`}
          className="inline-flex h-10 items-center rounded-full border border-border bg-card px-5 text-[12px] font-semibold text-foreground no-underline"
        >
          Email {instructions.contactEmail}
        </a>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 items-center rounded-full border border-border bg-card px-5 text-[12px] font-semibold text-muted-foreground"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

const COMPARE_ROW_DEFS = [
  { labelKey: "pricing.compare.dashboard", labelFb: "Dashboard browse", freeKey: "pricing.val.yes", freeFb: "Yes", proKey: "pricing.val.yes", proFb: "Yes", dealerKey: "pricing.val.yes", dealerFb: "Yes", enterpriseKey: "pricing.val.yes", enterpriseFb: "Yes" },
  { labelKey: "pricing.compare.pulse", labelFb: "Official Pulse", freeKey: "pricing.val.limited", freeFb: "Limited", proKey: "pricing.val.history", proFb: "History", dealerKey: "pricing.val.history", dealerFb: "History", enterpriseKey: "pricing.val.custom", enterpriseFb: "Custom" },
  { labelKey: "pricing.compare.terminal", labelFb: "Pro terminal", freeKey: "", freeFb: "—", proKey: "pricing.val.full", proFb: "Full", dealerKey: "pricing.val.full", dealerFb: "Full", enterpriseKey: "pricing.val.full", enterpriseFb: "Full" },
  { labelKey: "pricing.compare.alerts", labelFb: "Alerts depth", freeKey: "pricing.val.basic", freeFb: "Basic", proKey: "pricing.val.deep", proFb: "Deep", dealerKey: "pricing.val.deep", dealerFb: "Deep", enterpriseKey: "pricing.val.custom", enterpriseFb: "Custom" },
  { labelKey: "pricing.compare.exports", labelFb: "Exports", freeKey: "", freeFb: "—", proKey: "pricing.val.yes", proFb: "Yes", dealerKey: "pricing.val.yes", dealerFb: "Yes", enterpriseKey: "pricing.val.yes", enterpriseFb: "Yes" },
  { labelKey: "pricing.compare.dealer", labelFb: "Dealer workspace", freeKey: "", freeFb: "—", proKey: "", proFb: "—", dealerKey: "pricing.val.full", dealerFb: "Full", enterpriseKey: "pricing.val.full", enterpriseFb: "Full" },
  { labelKey: "pricing.compare.seats", labelFb: "Team seats", freeKey: "", freeFb: "—", proKey: "", proFb: "—", dealerKey: "pricing.val.yes", dealerFb: "Yes", enterpriseKey: "pricing.val.packs", enterpriseFb: "Packs" },
  { labelKey: "pricing.compare.sla", labelFb: "SLA / feeds", freeKey: "", freeFb: "—", proKey: "", proFb: "—", dealerKey: "", dealerFb: "—", enterpriseKey: "pricing.val.yes", enterpriseFb: "Yes" },
] as const;

const CTA_CLASS = (highlight?: boolean) =>
  `mt-6 inline-flex h-10 items-center justify-center rounded-full px-4 text-[12px] font-semibold no-underline transition-all active:scale-[0.98] ${
    highlight
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : "border border-border bg-surface text-foreground hover:border-primary/35"
  }`;


type Period = "monthly" | "yearly";

/** Phone + billing-period step before redirecting to PayHere. */
function PayherePanel({
  code,
  period,
  recurringAvailable,
  sandbox,
  onManual,
  onClose,
}: {
  code: DealerTierCode;
  period: Period;
  recurringAvailable: boolean;
  sandbox: boolean;
  onManual: () => void;
  onClose: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tier = DEALER_TIERS.find((t) => t.code === code);
  const amount = PLAN_PRICES[code][period];
  return (
    <div role="dialog" aria-label="Pay with PayHere" className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-6 sm:p-7">
      <p className="section-eyebrow mb-2 inline-flex items-center gap-2">
        <CreditCard aria-hidden className="h-3.5 w-3.5" />
        Dealer {tier?.name} · {formatLkr(amount)} / {period === "yearly" ? "year" : "month"}
        {sandbox ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">Test mode</span> : null}
      </p>
      <p className="text-[13px] text-foreground/85">
        You'll be sent to PayHere to pay by card, Genie, FriMi or eZcash. MotorMila never sees your card details.
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setBusy(true);
          try {
            const checkout = await createPayhereCheckout({ plan_code: code, period, recurring, phone });
            submitPayhereForm(checkout);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't start the payment.");
            setBusy(false);
          }
        }}
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-[12px] font-semibold text-foreground">
          Mobile number (PayHere needs it for the receipt)
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            placeholder="077 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-11 rounded-xl border border-border bg-card px-3.5 text-[13px] font-normal text-foreground focus:border-primary/50 focus:outline-none"
          />
        </label>
        {recurringAvailable && (
          <label className="flex items-center gap-2 text-[12px] text-foreground/85">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
            Renew automatically (cancel any time)
          </label>
        )}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-[13px] font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
          Continue to PayHere
        </button>
      </form>
      {error && <p role="alert" className="mt-3 text-[12px] font-semibold text-destructive">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onManual} className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-[12px] font-semibold text-foreground">
          Pay by bank transfer / KOKO instead
        </button>
        <button type="button" onClick={onClose} className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-[12px] font-semibold text-muted-foreground">
          Cancel
        </button>
      </div>
    </div>
  );
}

function DealerPlans() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("monthly");
  const [config, setConfig] = useState<PayhereConfig | null>(null);
  const [loading, setLoading] = useState<DealerTierCode | null>(null);
  const [payhere, setPayhere] = useState<DealerTierCode | null>(null);
  const [manualPay, setManualPay] = useState<{ plan: string; instructions: ManualPayInstructions } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPayhereConfig()
      .then((c) => !cancelled && setConfig(c))
      .catch(() => !cancelled && setConfig(null));
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = async (code: DealerTierCode) => {
    setLoading(code);
    setManualPay(null);
    setPayhere(null);
    try {
      const intent = await fetchCheckoutIntent(code);
      if (intent.provider === "payhere" && intent.payhere_checkout_endpoint) {
        if (!user) {
          toast.message("Sign in first so we know which account to upgrade.");
          navigate("/sign-in", { state: { from: { pathname: "/pricing" } } });
          return;
        }
        setPayhere(code);
        return;
      }
      if (intent.checkout_url) {
        window.location.href = intent.checkout_url;
        return;
      }
      if (intent.manual_pay) setManualPay({ plan: code, instructions: intent.manual_pay });
    } catch {
      toast.error("Couldn't load payment options. Email us and we'll set you up.");
    } finally {
      setLoading(null);
    }
  };

  const showManual = async (code: DealerTierCode) => {
    try {
      const res = await fetch(`${API_BASE}/billing/manual-pay?plan=${encodeURIComponent(code)}`, { headers: { Accept: "application/json" } });
      if (res.ok) setManualPay({ plan: code, instructions: (await res.json()) as ManualPayInstructions });
    } catch {
      toast.error("Couldn't load bank transfer details.");
    }
    setPayhere(null);
  };

  return (
    <motion.section id="dealer-plans" variants={revealItem} aria-labelledby="dealer-plans-heading" className="scroll-mt-24">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-eyebrow mb-3">Dealer plans</p>
          <h2 id="dealer-plans-heading" className="display-2 text-foreground">Priced by the size of your stock.</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">{ANNUAL_SAVE_NUDGE.dealer}. Market comparisons are shown as medians and ranges, never copies of other sellers' ads.</p>
        </div>
        <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border border-border bg-card p-1">
          {(["monthly", "yearly"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={period === p}
              onClick={() => setPeriod(p)}
              className={`h-9 rounded-full px-4 text-[12px] font-semibold ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {p === "monthly" ? "Monthly" : "Yearly (2 months free)"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {DEALER_TIERS.map((tier) => (
          <div key={tier.code} className={`flex flex-col rounded-2xl border p-6 ${tier.highlight ? "border-primary/40 bg-primary/[0.07] shadow-soft" : "border-border bg-card/50"}`}>
            <p className="text-[12px] font-semibold text-muted-foreground">Dealer {tier.name}</p>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="num text-2xl font-bold text-foreground">{formatLkr(PLAN_PRICES[tier.code][period])}</span>
              <span className="text-[12px] text-muted-foreground">/{period === "yearly" ? "yr" : "mo"}</span>
            </div>
            <p className="mt-1 text-[11px] font-medium text-muted-foreground">{tier.stock}</p>
            <ul className="mt-5 flex-1 space-y-2.5 border-t border-border pt-5">
              {tier.features.map((f) => (
                <li key={f} className="flex gap-2 text-[12px] leading-snug text-foreground/85">
                  <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button type="button" disabled={loading === tier.code} onClick={() => void choose(tier.code)} className={CTA_CLASS(tier.highlight)}>
              {loading === tier.code ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden /> : null}
              Choose {tier.name}
            </button>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">
        {config?.enabled ? "Card and wallet payments by PayHere." : "Pay by bank transfer or KOKO; card payments by PayHere are coming soon."} Prices in LKR. Cancel any time; your plan runs to the end of the paid period.
      </p>
      {payhere && config && (
        <div className="mt-6">
          <PayherePanel
            code={payhere}
            period={period}
            recurringAvailable={Boolean(config.recurringAvailable)}
            sandbox={config.sandbox}
            onManual={() => void showManual(payhere)}
            onClose={() => setPayhere(null)}
          />
        </div>
      )}
      {manualPay && (
        <div className="mt-6">
          <ManualPayPanel plan={manualPay.plan} instructions={manualPay.instructions} onClose={() => setManualPay(null)} />
        </div>
      )}
    </motion.section>
  );
}

export default function Pricing() {
  const { t } = useAppPreferences();
  const cell = (key: string, fb: string) => (key ? t(key, fb) : fb);
  const COMPARE_ROWS = COMPARE_ROW_DEFS.map((row) => ({
    label: t(row.labelKey, row.labelFb),
    free: cell(row.freeKey, row.freeFb),
    pro: cell(row.proKey, row.proFb),
    dealer: cell(row.dealerKey, row.dealerFb),
    enterprise: cell(row.enterpriseKey, row.enterpriseFb),
  }));
  return (
    <PageCanvas>
      <PageHero
        theme="default"
        eyebrow={t("pricing.eyebrow", "Plans")}
        eyebrowIcon={Sparkles}
        watermarkIcon={Users}
        title={<>{t("pricing.title", "Pricing that funds the pipeline")}<span className="text-sheen">.</span></>}
        description={t("pricing.body", PRICING_COMING_SOON ? "Browsing is free. Pro is free during the beta. Dealer plans start at LKR 2,990 a month, paid by card, wallet, bank transfer or KOKO." : "Free browse stays free. Start a 7-day free Pro trial — then keep Pro with bank, KOKO, or WhatsApp manual pay.")}
        media={visuals.alt2PagePricingBg}
        mediaPosition="center 40%"
        mediaTone="brand"
        highlights={[
          { label: "Pro", value: "Free", hint: "During the beta" },
          { label: "Dealer", value: "2,990", hint: "LKR / month, from" },
          { label: "Annual", value: "-2 mo", hint: "Annual saves 2 months" },
        ]}
        actions={
          <>
            <TrialCta />
            <Link
              to="/pro-preview"
              className="inline-flex h-11 items-center rounded-full border border-border bg-card px-6 text-[13px] font-semibold text-foreground no-underline transition-all hover:border-primary/40 hover:bg-surface active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t("pricing.liveSample", "See live sample")}
            </Link>
            <Link
              to="/docs"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-6 text-[13px] font-semibold text-foreground no-underline transition-all hover:border-primary/40 hover:bg-surface active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <BookOpen aria-hidden className="h-4 w-4" />
              {t("common.docs", "Docs")}
            </Link>
          </>
        }
      />

      <PageBody className="space-y-16 lg:space-y-20">
        <TrialCountdownBanner />

        {PRICING_COMING_SOON && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/[0.07] px-5 py-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <Sparkles aria-hidden className="h-4 w-4 text-primary" />
              {COMING_SOON_COPY.badge} — {COMING_SOON_COPY.note} Contact{" "}
              <a href={`mailto:${BRAND.contactEmail}`} className="underline decoration-primary/40 underline-offset-2">{BRAND.contactEmail}</a>
              {BRAND.contactPhone ? (
                <>
                  {" "}·{" "}
                  <a href={BRAND.contactPhoneHref} className="underline decoration-primary/40 underline-offset-2">{BRAND.contactPhone}</a>
                </>
              ) : null}
            </p>
          </div>
        )}

        <motion.section variants={revealItem} aria-labelledby="icp-heading">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="section-eyebrow mb-3 inline-flex items-center gap-2">
                <Users aria-hidden className="h-3.5 w-3.5" />
                {t("pricing.whoFor", "Who it's for")}
              </p>
              <h2 id="icp-heading" className="display-2 text-foreground">
                {t("pricing.icpTitle", "Built around real Sri Lanka operators.")}
              </h2>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ICP_PERSONAS.map((persona) => (
              <div
                key={persona.title}
                className="rounded-2xl border border-border bg-card/50 p-5 transition-colors hover:border-primary/25"
              >
                <h3 className="text-[15px] font-bold text-foreground">{persona.title}</h3>
                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{persona.pain}</p>
                <p className="mt-3 border-t border-border pt-3 text-[12px] font-medium leading-relaxed text-foreground/80">
                  {persona.fit}
                </p>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section variants={revealItem} aria-labelledby="tiers-heading">
          <p className="section-eyebrow mb-3">{t("pricing.plansEyebrow", "Plans")}</p>
          <h2 id="tiers-heading" className="display-2 mb-3 text-foreground">
            {t("pricing.tiersTitle", "Choose the depth you need.")}
          </h2>
          <p className="mb-8 inline-flex flex-wrap items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-4 py-2 text-[12px] font-semibold text-foreground">
            <Sparkles aria-hidden className="h-3.5 w-3.5 text-primary" />
            {t("pricing.annualNudge", PRICING_COMING_SOON ? `${COMING_SOON_COPY.badge} — ${COMING_SOON_COPY.note}` : `Annual saves 2 months — ${ANNUAL_SAVE_NUDGE.pro} · ${ANNUAL_SAVE_NUDGE.dealer}`)}
          </p>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.id}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  tier.highlight
                    ? "border-primary/40 bg-primary/[0.07] shadow-soft"
                    : "border-border bg-card/50"
                }`}
              >
                {tier.highlight && (
                  <span className="absolute -top-2.5 right-4 rounded-full border border-primary/30 bg-primary/15 px-2.5 py-0.5 text-[11px] font-medium text-primary-bright">
                    {t("pricing.recommended", "Recommended")}
                  </span>
                )}
                <p className="text-[12px] font-semibold text-muted-foreground">{tier.name}</p>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="num text-2xl font-bold text-foreground">{tier.priceLkr}</span>
                  <span className="text-[12px] text-muted-foreground">{tier.priceNote}</span>
                </div>
                {tier.annualNote && (
                  <p className="mt-1 text-[11px] font-medium text-muted-foreground">{tier.annualNote}</p>
                )}
                <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">{tier.audience}</p>
                <ul className="mt-5 flex-1 space-y-2.5 border-t border-border pt-5">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex gap-2 text-[12px] leading-snug text-foreground/85">
                      <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                {tier.ctaTo.startsWith("#") ? (
                  <a href={tier.ctaTo} className={CTA_CLASS(tier.highlight)}>
                    {tier.ctaLabel}
                  </a>
                ) : tier.external ? (
                  <a href={tier.ctaTo} className={CTA_CLASS(tier.highlight)}>
                    {tier.ctaLabel}
                  </a>
                ) : (
                  <Link to={tier.ctaTo} className={CTA_CLASS(tier.highlight)}>
                    {tier.ctaLabel}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </motion.section>

        <DealerPlans />

        <motion.section variants={revealItem} aria-labelledby="compare-heading">
          <p className="section-eyebrow mb-3">{t("pricing.compare", "Compare")}</p>
          <h2 id="compare-heading" className="display-2 mb-6 text-foreground">
            {t("pricing.featureSnapshot", "Feature snapshot.")}
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[640px] text-left text-[12px]">
              <thead>
                <tr className="bg-surface">
                  <th className="px-4 py-3 font-semibold tracking-tight text-muted-foreground">{t("pricing.capability", "Capability")}</th>
                  <th className="px-4 py-3 font-semibold tracking-tight text-muted-foreground">{t("common.free", "Free")}</th>
                  <th className="px-4 py-3 font-semibold tracking-tight text-muted-foreground">{t("common.pro", "Pro")}</th>
                  <th className="px-4 py-3 font-semibold tracking-tight text-primary-bright">{t("nav.dealer", "Dealer")}</th>
                  <th className="px-4 py-3 font-semibold tracking-tight text-muted-foreground">{t("pricing.val.custom", "Custom")}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.label} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold text-foreground">{row.label}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.free}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.pro}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{row.dealer}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.enterprise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.section>

        <motion.section variants={revealItem} aria-labelledby="faq-heading">
          <div className="mb-8 grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <p className="section-eyebrow mb-3 inline-flex items-center gap-2">
                <HelpCircle aria-hidden className="h-3.5 w-3.5" />
                {t("pricing.faq", "FAQ")}
              </p>
              <h2 id="faq-heading" className="display-2 text-foreground">
                {t("pricing.faqTitle", "Common questions.")}
              </h2>
            </div>
            <AtmosphericImage
              src={visuals.pageFaqIllustration.src}
              srcSm={visuals.pageFaqIllustration.srcSm}
              className="hidden h-28 w-full rounded-2xl object-cover object-center opacity-90 lg:block"
              sizes="220px"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {PRICING_FAQ.map((item) => (
              <div key={item.q} className="rounded-2xl border border-border bg-card/40 p-5">
                <h3 className="text-[14px] font-bold text-foreground">{item.q}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.div
          id="get-started"
          variants={revealItem}
          className="flex scroll-mt-24 flex-col gap-4 rounded-2xl border border-primary/25 bg-primary/[0.06] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
        >
          <div>
            <p className="section-eyebrow mb-2">{t("pricing.getStarted", "Get started")}</p>
            <h3 className="text-lg font-bold text-foreground">{t("pricing.ctaBanner", "Join the waitlist, open Dealer, or read the docs.")}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <TrialCta className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-[12px] font-semibold text-primary-foreground no-underline transition-all hover:bg-primary/90" />
            <Link
              to="/dealer"
              className="inline-flex h-10 items-center rounded-full border border-border bg-card px-5 text-[12px] font-semibold text-foreground no-underline"
            >
              {t("pricing.dealerWorkspace", "Dealer workspace")}
            </Link>
            <Link
              to="/docs"
              className="inline-flex h-10 items-center rounded-full border border-border bg-card px-5 text-[12px] font-semibold text-foreground no-underline"
            >
              {t("common.docs", "Docs")}
            </Link>
            <a
              href={BRAND.contactMailto}
              className="inline-flex h-10 items-center rounded-full border border-border bg-card px-5 text-[12px] font-semibold text-foreground no-underline"
            >
              {t("common.messageUs", "Message us")}
            </a>
          </div>
        </motion.div>
      </PageBody>
    </PageCanvas>
  );
}
