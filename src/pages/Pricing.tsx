import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, BookOpen, ChevronDown, Check, CreditCard, HelpCircle, Loader2, MessageCircle, Sparkles, Timer, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ParticleButton, type ParticleButtonHandle } from "@/components/ui/ParticleButton";
import { BRAND } from "@/lib/brand";
import { ANNUAL_SAVE_NUDGE, DEALER_FAQ, DEALER_TIERS, PLAN_PRICES, PRICING_COMING_SOON, PRICING_FAQ, PRICING_TIERS, PRO_FREE_DURING_BETA, TRIAL_OFFER, formatLkr } from "@/lib/pricingContent";
import type { DealerTierCode } from "@/lib/pricingContent";
import { createPayhereCheckout, getPayhereConfig, submitPayhereForm, type PayhereConfig } from "@/lib/moneyApi";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { AtmosphericImage } from "@/components/AtmosphericImage";
import { duration, ease, revealItem, spring, useReducedMotionOrLowData } from "@/lib/motion";
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
        className={className ?? "inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-footnote font-semibold text-primary-foreground no-underline shadow-soft transition-ui hover:bg-primary/90 active:scale-[0.98]"}
      >
        {label ?? t("pricing.startTrial", TRIAL_OFFER.cta)}
        <ArrowRight aria-hidden className="h-4 w-4" />
      </Link>
    );
  }

  if (done) {
    return (
      <p className="inline-flex h-11 items-center gap-2 rounded-full border border-deal-good/25 bg-deal-good/10 px-6 text-footnote font-semibold text-deal-good-text">
        <Check aria-hidden className="h-4 w-4" />
        {t("shell.pricing.done", "Done — we'll email you when Pro launches.")}
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
          toast.error(t("shell.pricing.failed", "Couldn't save your email — try again."));
        } finally {
          setSending(false);
        }
      }}
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("shell.pricing.emailPlaceholder", "Your email")}
        aria-label={t("shell.pricing.emailAria", "Email for the Pro launch")}
        className="h-11 min-w-0 flex-1 rounded-full border border-border bg-card px-4 text-footnote text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
      />
      <ParticleButton
        ref={burstRef}
        type="submit"
        disabled={sending}
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary px-5 text-footnote font-semibold text-primary-foreground transition-ui hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60"
      >
        {sending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
        {t("shell.pro.notify", "Notify me")}
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

  if (user?.subscriptionStatus === "trialing") {
    const days = trialDays ?? trialDaysLeftFromIso(trialEndsAt);
    return (
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/[0.07] px-5 py-4"
      >
        <p className="flex items-center gap-2 text-footnote font-semibold text-foreground">
          <Timer aria-hidden className="h-4 w-4 text-primary" />
          {PRO_FREE_DURING_BETA
            ? t("shell.trial.beta", "You have Pro access during the beta. Nothing is charged; we'll email you before anything changes.")
            : days === null
              ? t("shell.trial.active", "Your Pro trial is active.")
              : days <= 0
                ? t("shell.trial.ended", "Your Pro trial has ended. Your free account still works.")
                : t("shell.trial.daysLeft", "{n} days left in your Pro trial.", { n: days })}
        </p>
      </div>
    );
  }

  if (!user) return null;

  if (user.plan !== "free") return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/[0.07] px-5 py-4">
      <p className="flex items-center gap-2 text-footnote font-semibold text-foreground">
        <Sparkles aria-hidden className="h-4 w-4 text-primary" />
        {t("shell.pricing.notifyBanner", "MotorMila is free during beta. Pro is coming soon — get an email when it launches.")}
      </p>
      <TrialCta className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-caption font-semibold text-primary-foreground no-underline transition-ui hover:bg-primary/90" />
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
      <h3 className="text-body font-bold text-foreground">
        Bank transfer or KOKO · activated within {instructions.activationWindow}
      </h3>
      <ol className="mt-4 space-y-2.5">
        {instructions.steps.map((step) => (
          <li key={step} className="flex gap-2.5 rounded-xl border border-border bg-card/60 p-3 text-caption leading-relaxed text-foreground/85">
            <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 grid gap-2 text-caption text-muted-foreground sm:grid-cols-2">
        <p className="rounded-xl border border-border bg-surface p-3"><span className="font-bold text-foreground">Bank: </span>{instructions.bankDetails}</p>
        <p className="rounded-xl border border-border bg-surface p-3"><span className="font-bold text-foreground">KOKO: </span>{instructions.kokoNote}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {whatsappLink && (
          <a
            href={whatsappLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-caption font-semibold text-primary-foreground no-underline"
          >
            <MessageCircle aria-hidden className="h-4 w-4" />
            WhatsApp us ({instructions.activationWindow} activation)
          </a>
        )}
        <a
          href={`mailto:${instructions.contactEmail}?subject=Motormila%20${encodeURIComponent(plan)}%20plan%20upgrade`}
          className="inline-flex h-10 items-center rounded-full border border-border bg-card px-5 text-caption font-semibold text-foreground no-underline"
        >
          Email {instructions.contactEmail}
        </a>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 items-center rounded-full border border-border bg-card px-5 text-caption font-semibold text-muted-foreground"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

const COMPARE_ROW_DEFS = [
  { label: ["shell.pricing.row.search", "Search every source"], free: ["pricing.val.yes", "Yes"], pro: ["pricing.val.yes", "Yes"] },
  { label: ["shell.pricing.row.results", "Results per search"], free: ["shell.pricing.val.all", "All"], pro: ["shell.pricing.val.all", "All"] },
  { label: ["shell.pricing.row.dealScore", "Deal score on listings"], free: ["", "—"], pro: ["pricing.val.yes", "Yes"] },
  { label: ["shell.pricing.row.history", "Price trends"], free: ["shell.pricing.val.6months", "6 months"], pro: ["shell.pricing.val.fullHistory", "Full history"] },
  { label: ["shell.pricing.row.updates", "Tax & customs updates"], free: ["shell.pricing.val.latest6", "Latest 6"], pro: ["shell.pricing.val.all", "All"] },
  { label: ["shell.pricing.row.alerts", "Price-drop alerts"], free: ["shell.pricing.val.one", "1"], pro: ["shell.pricing.val.more", "More, incl. WhatsApp"] },
  { label: ["shell.pricing.row.exports", "CSV / PDF exports"], free: ["", "—"], pro: ["pricing.val.yes", "Yes"] },
] as const;

const CTA_CLASS = (highlight?: boolean) =>
  `mt-6 inline-flex h-10 items-center justify-center rounded-full px-4 text-caption font-semibold no-underline transition-ui active:scale-[0.98] ${
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
        {sandbox ? <span className="rounded-full border border-deal-caution/30 bg-deal-caution/10 px-2 py-0.5 text-caption text-deal-caution-text">Test mode</span> : null}
      </p>
      <p className="text-footnote text-foreground/85">
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
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-caption font-semibold text-foreground">
          Mobile number (PayHere needs it for the receipt)
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            placeholder="077 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-11 rounded-xl border border-border bg-card px-3.5 text-footnote font-normal text-foreground focus:border-primary/50 focus:outline-none"
          />
        </label>
        {recurringAvailable && (
          <label className="flex items-center gap-2 text-caption text-foreground/85">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
            Renew automatically (cancel any time)
          </label>
        )}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-footnote font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
          Continue to PayHere
        </button>
      </form>
      {error && <p role="alert" className="mt-3 text-caption font-semibold text-destructive">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onManual} className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-caption font-semibold text-foreground">
          Pay by bank transfer / KOKO instead
        </button>
        <button type="button" onClick={onClose} className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-caption font-semibold text-muted-foreground">
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
          <p className="mt-2 text-footnote text-muted-foreground">{ANNUAL_SAVE_NUDGE.dealer}. Market comparisons are shown as medians and ranges, never copies of other sellers' ads.</p>
        </div>
        <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border border-border bg-card p-1">
          {(["monthly", "yearly"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={period === p}
              onClick={() => setPeriod(p)}
              className={`h-9 rounded-full px-4 text-caption font-semibold ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {p === "monthly" ? "Monthly" : "Yearly (2 months free)"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {DEALER_TIERS.map((tier) => (
          <div key={tier.code} className={`flex flex-col rounded-2xl border p-6 ${tier.highlight ? "border-primary/40 bg-primary/[0.07] shadow-soft" : "border-border bg-card/50"}`}>
            <p className="text-caption font-semibold text-muted-foreground">Dealer {tier.name}</p>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="num text-title2 font-bold text-foreground">{formatLkr(PLAN_PRICES[tier.code][period])}</span>
              <span className="text-caption text-muted-foreground">/{period === "yearly" ? "yr" : "mo"}</span>
            </div>
            <p className="mt-1 text-caption font-medium text-muted-foreground">{tier.stock}</p>
            <ul className="mt-5 flex-1 space-y-2.5 border-t border-border pt-5">
              {tier.features.map((f) => (
                <li key={f} className="flex gap-2 text-caption leading-snug text-foreground/85">
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
      <p className="mt-4 text-caption text-muted-foreground">
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

/** Scroll-triggered section reveal (once); breaks the PageCanvas mount stagger. */
const onScrollReveal = {
  inherit: false,
  initial: "hidden",
  whileInView: "show",
  viewport: { once: true, amount: 0.12 },
} as const;

export default function Pricing() {
  const { t } = useAppPreferences();
  const motionStill = useReducedMotionOrLowData();
  const [dealersOpen, setDealersOpen] = useState(
    () => typeof window !== "undefined" && window.location.hash === "#for-dealers",
  );
  const cell = ([key, fb]: readonly [string, string]) => (key ? t(key, fb) : fb);
  const COMPARE_ROWS = COMPARE_ROW_DEFS.map((row) => ({
    label: cell(row.label),
    free: cell(row.free),
    pro: cell(row.pro),
  }));
  // Free + one honest Pro card. Dealer plans live in their own section below.
  const tiers = PRICING_TIERS.filter((tier) => tier.id === "free" || tier.id === "pro");
  return (
    <PageCanvas>
      <PageHero
        variant="marketing"
        theme="default"
        eyebrow={t("pricing.eyebrow", "Plans")}
        eyebrowIcon={Sparkles}
        watermarkIcon={Users}
        title={<>{t("shell.pricing.title", "Free while we're in beta")}<span className="text-sheen">.</span></>}
        description={t("shell.pricing.body", "Search, price ranges, price history and the import tax calculator are free. Pro is coming soon — leave your email and we'll tell you before it launches.")}
        media={visuals.alt2PagePricingBg}
        mediaPosition="center 40%"
        mediaTone="brand"
        highlights={[
          { label: t("common.free", "Free"), value: "LKR 0", hint: t("shell.pro.freeBeta", "Free during beta") },
          { label: t("common.pro", "Pro"), value: t("shell.pricing.soon", "Soon"), hint: t("shell.pricing.soonHint", "We'll email you first") },
        ]}
        actions={
          <>
            <TrialCta />
            <Link
              to="/pro-preview"
              className="inline-flex h-11 items-center rounded-full border border-border bg-card px-6 text-footnote font-semibold text-foreground no-underline transition-ui hover:border-primary/40 hover:bg-surface active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t("shell.pricing.whatPro", "What Pro will include")}
            </Link>
          </>
        }
      />

      <PageBody className="space-y-16 lg:space-y-20">
        <motion.section {...onScrollReveal} variants={revealItem} aria-labelledby="tiers-heading">
          <p className="section-eyebrow mb-3">{t("pricing.plansEyebrow", "Plans")}</p>
          <h2 id="tiers-heading" className="display-2 mb-8 text-foreground">
            {t("shell.pricing.tiersTitle", "Two plans. One is free.")}
          </h2>
          <div className="grid gap-5 md:grid-cols-2 lg:max-w-4xl">
            {tiers.map((tier) => (
              <div
                key={tier.id}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  tier.id === "free" ? "border-primary/40 bg-primary/[0.07] shadow-soft" : "border-border bg-card/50"
                }`}
              >
                <p className="text-caption font-semibold text-muted-foreground">{tier.name}</p>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="num text-title2 font-bold text-foreground">{tier.priceLkr}</span>
                  {tier.priceNote ? <span className="text-caption text-muted-foreground">{tier.priceNote}</span> : null}
                </div>
                {tier.id === "free" ? (
                  <p className="mt-1 text-caption font-medium text-muted-foreground">{t("shell.pro.freeBeta", "Free during beta")}</p>
                ) : tier.annualNote ? (
                  <p className="mt-1 text-caption font-medium text-muted-foreground">{tier.annualNote}</p>
                ) : null}
                <p className="mt-3 text-caption leading-relaxed text-muted-foreground">{tier.audience}</p>
                <ul className="mt-5 flex-1 space-y-2.5 border-t border-border pt-5">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex gap-2 text-caption leading-snug text-foreground/85">
                      <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                {tier.id === "pro" ? (
                  <div className="mt-6">
                    <TrialCta />
                  </div>
                ) : (
                  <Link to={tier.ctaTo} className={CTA_CLASS(true)}>
                    {tier.ctaLabel}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section {...onScrollReveal} variants={revealItem} aria-labelledby="compare-heading">
          <p className="section-eyebrow mb-3">{t("pricing.compare", "Compare")}</p>
          <h2 id="compare-heading" className="display-2 mb-6 text-foreground">
            {t("shell.pricing.compareTitle", "Free and Pro side by side.")}
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border lg:max-w-4xl">
            <table className="w-full min-w-[420px] text-left text-caption">
              <thead>
                <tr className="bg-surface">
                  <th className="px-4 py-3 font-semibold tracking-tight text-muted-foreground">{t("pricing.capability", "Capability")}</th>
                  <th className="px-4 py-3 font-semibold tracking-tight text-primary-bright">{t("common.free", "Free")}</th>
                  <th className="px-4 py-3 font-semibold tracking-tight text-muted-foreground">
                    {t("common.pro", "Pro")} <span className="font-normal">· {t("shell.pricing.soon", "Soon")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.label} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold text-foreground">{row.label}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{row.free}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.section>

        <motion.section {...onScrollReveal} variants={revealItem} aria-labelledby="faq-heading">
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
                <h3 className="text-body font-bold text-foreground">{item.q}</h3>
                <p className="mt-2 text-footnote leading-relaxed text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Dealers: real, sellable plans — kept off the main plan grid, one tap away. */}
        {/* Accordion: height change via `layout` (no height tween); content
            stays in the DOM (hidden) so dealer prices remain indexable. */}
        <motion.div
          {...onScrollReveal}
          variants={revealItem}
          layout={!motionStill}
          transition={spring.smooth}
          id="for-dealers"
          style={{ borderRadius: 16 }}
          className="scroll-mt-24 border border-border bg-card/40 p-5 sm:p-6"
        >
          <motion.button
            layout={!motionStill ? "position" : false}
            type="button"
            aria-expanded={dealersOpen}
            aria-controls="for-dealers-panel"
            onClick={() => setDealersOpen((o) => !o)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 text-left text-body font-bold text-foreground"
          >
            <span className="inline-flex items-center gap-2">
              <Users aria-hidden className="h-4 w-4 text-primary" />
              {t("shell.pricing.forDealers", "For dealers")}
            </span>
            <span className="inline-flex items-center gap-2">
              {!dealersOpen ? (
                <span className="text-caption font-medium text-muted-foreground">
                  {t("shell.pricing.forDealersHint", "Plans priced by stock size, from LKR 2,990/mo")}
                </span>
              ) : null}
              <motion.span
                aria-hidden
                animate={{ rotate: dealersOpen ? 180 : 0 }}
                transition={motionStill ? { duration: 0 } : spring.snappy}
                className="inline-flex"
              >
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </motion.span>
            </span>
          </motion.button>
          <motion.div
            id="for-dealers-panel"
            hidden={!dealersOpen}
            initial={false}
            animate={dealersOpen ? { opacity: 1, y: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: duration.medium, ease: dealersOpen ? ease.decelerate : ease.accelerate }}
            className="mt-6 space-y-8"
          >
            <DealerPlans />
            <div className="grid gap-4 md:grid-cols-3">
              {DEALER_FAQ.map((item) => (
                <div key={item.q} className="rounded-2xl border border-border bg-card/40 p-5">
                  <h3 className="text-body font-bold text-foreground">{item.q}</h3>
                  <p className="mt-2 text-footnote leading-relaxed text-muted-foreground">{item.a}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          id="get-started"
          {...onScrollReveal}
          layout={!motionStill ? "position" : false}
          variants={revealItem}
          className="flex scroll-mt-24 flex-col gap-4 rounded-2xl border border-primary/25 bg-primary/[0.06] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
        >
          <div>
            <p className="section-eyebrow mb-2">{t("common.pro", "Pro")}</p>
            <h3 className="text-callout font-bold text-foreground">{t("shell.pricing.ctaTitle", "Get an email when Pro launches.")}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <TrialCta className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-caption font-semibold text-primary-foreground no-underline transition-ui hover:bg-primary/90" />
            <a
              href={BRAND.contactMailto}
              className="inline-flex h-10 items-center rounded-full border border-border bg-card px-5 text-caption font-semibold text-foreground no-underline"
            >
              {t("common.messageUs", "Message us")}
            </a>
          </div>
        </motion.div>
      </PageBody>
    </PageCanvas>
  );
}
