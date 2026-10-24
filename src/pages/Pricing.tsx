import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { ArrowRight, ChevronDown, Check, CreditCard, MessageCircle, Sparkles, Timer, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BRAND } from "@/lib/brand";
import { DEALER_FAQ, DEALER_TIERS, PLAN_PRICES, PRICING_COMING_SOON, PRICING_FAQ, PRICING_TIERS, PRO_FREE_DURING_BETA, TRIAL_OFFER, formatLkr } from "@/lib/pricingContent";
import type { DealerTierCode } from "@/lib/pricingContent";
import { createPayhereCheckout, getPayhereConfig, submitPayhereForm, type PayhereConfig } from "@/lib/moneyApi";
import { PageCanvas } from "@/components/PageCanvas";
import { duration, fadeUp, listItem, listStagger, scaleIn, spring, useReducedMotionOrLowData } from "@/lib/motion";
import { useAppPreferences } from "@/lib/appPreferences";
import { friendlyApiError } from "@/lib/apiErrorText";
import { useAuth } from "@/lib/authContext";
import { API_BASE, resolveFetchCredentials, sendFeedback } from "@/services/api";
import { toast } from "sonner";
import { authHeaders } from "@/lib/authToken";
import { tx } from "@/lib/translate";

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
    credentials: resolveFetchCredentials(API_BASE),
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

  if (!PRICING_COMING_SOON) {
    return (
      <Button asChild className={className}>
        <Link to={TRIAL_OFFER.ctaTo}>
          {label ?? t("pricing.startTrial", TRIAL_OFFER.cta)}
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {done ? (
        <m.p
          key="done"
          role="status"
          variants={scaleIn}
          initial="hidden"
          animate="show"
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-deal-good/30 bg-deal-good/10 px-5 text-footnote font-semibold text-deal-good-text"
        >
          <Check aria-hidden className="h-4 w-4" />
          {t("shell.pricing.done", "Done — we'll email you when Pro launches.")}
        </m.p>
      ) : (
        <m.form
          key="form"
          exit={{ opacity: 0, transition: { duration: duration.short } }}
          className={className ?? "flex w-full max-w-sm flex-wrap items-center justify-center gap-2"}
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
              setDone(true);
            } catch {
              toast.error(t("shell.pricing.failed", "Couldn't save your email — try again."));
            } finally {
              setSending(false);
            }
          }}
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("shell.pricing.emailPlaceholder", "Your email")}
            aria-label={t("shell.pricing.emailAria", "Email for the Pro launch")}
            className="h-11 min-w-[12rem] flex-1 rounded-full px-4"
          />
          {/* Wraps under the field when the label is long (si/ta) instead of squeezing it to one letter. */}
          <Button type="submit" loading={sending} className="h-11 shrink-0 grow sm:grow-0">
            {t("shell.pro.notify", "Notify me")}
          </Button>
        </m.form>
      )}
    </AnimatePresence>
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
          credentials: resolveFetchCredentials(API_BASE),
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
        className="content-in flex flex-wrap items-center justify-between gap-3 rounded-card border border-primary/25 bg-primary/10 px-5 py-4"
      >
        <p className="flex items-center gap-2 text-footnote font-semibold text-foreground">
          <Timer aria-hidden className="h-4 w-4 shrink-0 text-primary" />
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
    <div className="content-in flex flex-wrap items-center justify-between gap-3 rounded-card border border-primary/25 bg-primary/10 px-5 py-4">
      <p className="flex items-center gap-2 text-footnote font-semibold text-foreground">
        <Sparkles aria-hidden className="h-4 w-4 shrink-0 text-primary" />
        {t("shell.pricing.notifyBanner", "MotorMila is free during beta. Pro is coming soon — get an email when it launches.")}
      </p>
      <TrialCta />
    </div>
  );
}

function ManualPayPanel({ plan, instructions, onClose }: { plan: string; instructions: ManualPayInstructions; onClose: () => void }) {
  const { t } = useAppPreferences();
  const whatsappLink = instructions.whatsappNumber
    ? `https://wa.me/${instructions.whatsappNumber.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Motormila ${plan} upgrade — my account email is `)}`
    : null;
  return (
    <Card role="status" className="content-in border-primary/25">
      <p className="mb-2 inline-flex items-center gap-2 text-footnote font-semibold text-primary">
        <MessageCircle aria-hidden className="h-4 w-4" />
        {t("pricing.manual.title", "Manual pay — {plan}", { plan })}
      </p>
      <h3 className="text-callout font-semibold text-foreground">
        {t("pricing.manual.heading", "Bank transfer or KOKO · activated within {window}", { window: instructions.activationWindow })}
      </h3>
      <ol className="mt-4 space-y-2">
        {instructions.steps.map((step) => (
          <li key={step} className="flex gap-2.5 rounded-control bg-surface-2 p-3 text-footnote text-label-1">
            <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 grid gap-2 text-footnote text-label-2 sm:grid-cols-2">
        <p className="rounded-control bg-surface-2 p-3"><span className="font-semibold text-foreground">{t("pricing.manual.bank", "Bank:")} </span>{instructions.bankDetails}</p>
        <p className="rounded-control bg-surface-2 p-3"><span className="font-semibold text-foreground">KOKO: </span>{instructions.kokoNote}</p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {whatsappLink && (
          <Button asChild>
            <a href={whatsappLink} target="_blank" rel="noreferrer">
              <MessageCircle aria-hidden />
              {t("pricing.manual.whatsapp", "WhatsApp us ({window} activation)", { window: instructions.activationWindow })}
            </a>
          </Button>
        )}
        <Button asChild variant="secondary">
          <a href={`mailto:${instructions.contactEmail}?subject=Motormila%20${encodeURIComponent(plan)}%20plan%20upgrade`}>
            {t("pricing.manual.email", "Email {email}", { email: instructions.contactEmail })}
          </a>
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("pricing.manual.dismiss", "Dismiss")}
        </Button>
      </div>
    </Card>
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
  const { t } = useAppPreferences();
  const [phone, setPhone] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tier = DEALER_TIERS.find((d) => d.code === code);
  const amount = PLAN_PRICES[code][period];
  return (
    <Card role="dialog" aria-label={t("pricing.payhere.aria", "Pay with PayHere")} className="content-in border-primary/25">
      <p className="mb-2 flex flex-wrap items-center gap-2 text-footnote font-semibold text-primary">
        <CreditCard aria-hidden className="h-4 w-4" />
        {period === "yearly"
          ? t("pricing.payhere.summaryYear", "Dealer {plan} · {amount} / year", { plan: tier ? tx(t, tier.name) : "", amount: formatLkr(amount) })
          : t("pricing.payhere.summaryMonth", "Dealer {plan} · {amount} / month", { plan: tier ? tx(t, tier.name) : "", amount: formatLkr(amount) })}
        {sandbox ? <Badge variant="warning">{t("pricing.payhere.testMode", "Test mode")}</Badge> : null}
      </p>
      <p className="text-body text-label-1">
        {t("pricing.payhere.body", "You'll be sent to PayHere to pay by card, Genie, FriMi or eZcash. MotorMila never sees your card details.")}
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
            setError(friendlyApiError(err, t("pricing.payhere.failed", "Couldn't start the payment."), t));
            setBusy(false);
          }
        }}
      >
        <div className="flex min-w-[13.75rem] flex-1 flex-col gap-2">
          <Label htmlFor="payhere-phone">{t("pricing.payhere.phone", "Mobile number (PayHere needs it for the receipt)")}</Label>
          <Input
            id="payhere-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            placeholder="077 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        {recurringAvailable && (
          <div className="flex h-10 items-center gap-2">
            <Checkbox id="payhere-recurring" checked={recurring} onCheckedChange={(v) => setRecurring(v === true)} />
            <Label htmlFor="payhere-recurring" className="cursor-pointer text-footnote font-normal text-label-1">
              {t("pricing.payhere.recurring", "Renew automatically (cancel any time)")}
            </Label>
          </div>
        )}
        <Button type="submit" loading={busy}>
          {t("pricing.payhere.continue", "Continue to PayHere")}
        </Button>
      </form>
      {error && <p role="alert" className="content-in mt-3 text-footnote font-semibold text-deal-high-text">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onManual}>
          {t("pricing.payhere.manualInstead", "Pay by bank transfer / KOKO instead")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {t("common.cancel", "Cancel")}
        </Button>
      </div>
    </Card>
  );
}

/** "LKR 2,990" that rolls when the billing period changes; the plain text stays for screen readers and search. */
function PlanPrice({ amount }: { amount: number }) {
  return (
    <span className="relative">
      <span className="sr-only">{formatLkr(amount)}</span>
      <span aria-hidden>
        <AnimatedNumber value={amount} prefix="LKR " locales="en-US" format={{ maximumFractionDigits: 0, useGrouping: true }} />
      </span>
    </span>
  );
}

function DealerPlans() {
  const { t } = useAppPreferences();
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
          toast.message(t("pricing.signInFirst", "Sign in first so we know which account to upgrade."));
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
      toast.error(t("pricing.paymentOptionsFailed", "Couldn't load payment options. Email us and we'll set you up."));
    } finally {
      setLoading(null);
    }
  };

  const showManual = async (code: DealerTierCode) => {
    try {
      const res = await fetch(`${API_BASE}/billing/manual-pay?plan=${encodeURIComponent(code)}`, { headers: { Accept: "application/json" } });
      if (res.ok) setManualPay({ plan: code, instructions: (await res.json()) as ManualPayInstructions });
    } catch {
      toast.error(t("pricing.bankDetailsFailed", "Couldn't load bank transfer details."));
    }
    setPayhere(null);
  };

  return (
    <section id="dealer-plans" aria-labelledby="dealer-plans-heading" className="scroll-mt-24">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-footnote font-semibold text-primary">{t("acct.pricing.dealerEyebrow", "Dealer plans")}</p>
          <h2 id="dealer-plans-heading" className="font-display text-title2 font-semibold text-foreground">
            {t("acct.pricing.dealerTitle", "Priced by the size of your stock.")}
          </h2>
          <p className="mt-2 max-w-2xl text-footnote text-label-2">
            {t("acct.pricing.dealerNudge", "Dealer annual saves 2 months: from LKR 29,900/yr vs LKR 2,990/mo")}.{" "}
            {t("acct.pricing.dealerCompsNote", "Market comparisons are shown as medians and ranges, never copies of other sellers' ads.")}
          </p>
        </div>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList aria-label={t("acct.pricing.billingPeriod", "Billing period")}>
            <TabsTrigger value="monthly">{t("acct.pricing.monthly", "Monthly")}</TabsTrigger>
            <TabsTrigger value="yearly">{t("acct.pricing.yearly", "Yearly (2 months free)")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {DEALER_TIERS.map((tier) => (
          <Card key={tier.code} className={tier.highlight ? "flex flex-col border-primary/40 shadow-e2" : "flex flex-col"}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-footnote font-semibold text-label-2">{t("pricing.dealerPlanName", "Dealer {plan}", { plan: tx(t, tier.name) })}</p>
              {tier.highlight ? <Badge variant="info">{t("acct.pricing.popular", "Most popular")}</Badge> : null}
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-title2 font-semibold text-foreground">
                <PlanPrice amount={PLAN_PRICES[tier.code][period]} />
              </span>
              <span className="text-footnote text-label-2">{period === "yearly" ? t("pricing.perYear", "/yr") : t("pricing.perMonth", "/mo")}</span>
            </div>
            <p className="mt-1 text-footnote text-label-2">{tx(t, tier.stock)}</p>
            <ul className="mt-5 flex-1 space-y-2.5 border-t border-separator pt-5">
              {tier.features.map((f) => (
                <li key={f[0]} className="flex gap-2 text-footnote text-label-1">
                  <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{tx(t, f)}</span>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant={tier.highlight ? "primary" : "secondary"}
              className="mt-6 w-full"
              loading={loading === tier.code}
              onClick={() => void choose(tier.code)}
            >
              {t("pricing.choosePlan", "Choose {plan}", { plan: tx(t, tier.name) })}
            </Button>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-footnote text-label-2">
        {config?.enabled
          ? t("acct.pricing.dealerPayPayhere", "Card and wallet payments by PayHere.")
          : t("acct.pricing.dealerPayManual", "Pay by bank transfer or KOKO; card payments by PayHere are coming soon.")}{" "}
        {t("acct.pricing.dealerTerms", "Prices in LKR. Cancel any time; your plan runs to the end of the paid period.")}
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
    </section>
  );
}

/** Scroll-triggered section reveal (once); breaks the PageCanvas mount stagger. */
const onScrollReveal = {
  inherit: false,
  initial: "hidden",
  whileInView: "show",
  viewport: { once: true, amount: 0.12 },
} as const;

function SectionTitle({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-footnote font-semibold text-primary">{eyebrow}</p>
      <h2 id={id} className="font-display text-title1 font-semibold text-foreground">
        {title}
      </h2>
    </div>
  );
}

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
    <PageCanvas ambient="none">
      <PageHeader
        size="large"
        align="center"
        eyebrow={t("pricing.eyebrow", "Plans")}
        eyebrowIcon={Sparkles}
        title={t("shell.pricing.title", "Free while we're in beta")}
        description={t(
          "shell.pricing.body",
          "Search, price ranges, price history and the import tax calculator are free. Pro is coming soon — leave your email and we'll tell you before it launches.",
        )}
        actions={
          <div className="flex w-full flex-col items-center gap-3">
            <TrialCta />
            <Button asChild variant="tertiary">
              <Link to="/pro-preview">
                {t("shell.pricing.whatPro", "What Pro will include")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        }
      />

      <div className="layout-shell space-y-16 pb-20 lg:space-y-24 lg:pb-28">
        <m.section {...onScrollReveal} variants={listStagger} aria-labelledby="tiers-heading" className="mx-auto max-w-4xl">
          <SectionTitle id="tiers-heading" eyebrow={t("pricing.plansEyebrow", "Plans")} title={t("shell.pricing.tiersTitle", "Two plans. One is free.")} />
          <div className="grid gap-4 md:grid-cols-2">
            {tiers.map((tier, i) => (
              <m.div key={tier.id} variants={listItem} custom={i}>
                <Card padding="lg" className={tier.id === "free" ? "flex h-full flex-col border-primary/40 shadow-e2" : "flex h-full flex-col"}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-footnote font-semibold text-label-2">{tx(t, tier.name)}</p>
                    {tier.id === "free" ? (
                      <Badge variant="success">{t("shell.pro.freeBeta", "Free during beta")}</Badge>
                    ) : (
                      <Badge variant="neutral">{t("shell.pro.badge", "Pro · coming soon")}</Badge>
                    )}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="font-display text-title1 font-semibold tabular-nums text-foreground">{tx(t, tier.priceLkr)}</span>
                    {tier.priceNote ? <span className="text-footnote text-label-2">{tx(t, tier.priceNote)}</span> : null}
                  </div>
                  {tier.id !== "free" && tier.annualNote ? <p className="mt-1 text-footnote text-label-2">{tx(t, tier.annualNote)}</p> : null}
                  <p className="mt-3 text-footnote text-label-2">{tx(t, tier.audience)}</p>
                  <ul className="mt-5 flex-1 space-y-2.5 border-t border-separator pt-5">
                    {tier.features.map((feature) => (
                      <li key={feature[0]} className="flex gap-2 text-footnote text-label-1">
                        <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{tx(t, feature)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6">
                    {tier.id === "pro" ? (
                      <TrialCta />
                    ) : (
                      <Button asChild className="w-full">
                        <Link to={tier.ctaTo}>{tx(t, tier.ctaLabel)}</Link>
                      </Button>
                    )}
                  </div>
                </Card>
              </m.div>
            ))}
          </div>
        </m.section>

        <m.section {...onScrollReveal} variants={fadeUp} aria-labelledby="compare-heading" className="mx-auto max-w-4xl">
          <SectionTitle id="compare-heading" eyebrow={t("pricing.compare", "Compare")} title={t("shell.pricing.compareTitle", "Free and Pro side by side.")} />
          <TableContainer className="shadow-e1">
            <Table className="min-w-[20rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("pricing.capability", "Capability")}</TableHead>
                  <TableHead className="text-primary">{t("common.free", "Free")}</TableHead>
                  <TableHead>
                    {t("common.pro", "Pro")} · {t("shell.pricing.soon", "Soon")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {COMPARE_ROWS.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell>
                      {row.free === "—" ? <span className="text-label-3">—</span> : row.free}
                    </TableCell>
                    <TableCell className="text-label-2">{row.pro}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </m.section>

        <m.section {...onScrollReveal} variants={listStagger} aria-labelledby="faq-heading" className="mx-auto max-w-4xl">
          <SectionTitle id="faq-heading" eyebrow={t("pricing.faq", "FAQ")} title={t("pricing.faqTitle", "Common questions.")} />
          <div className="grid gap-4 md:grid-cols-2">
            {PRICING_FAQ.map((item, i) => (
              <m.div key={item.q[0]} variants={listItem} custom={i}>
                <Card className="h-full">
                  <h3 className="text-body font-semibold text-foreground">{tx(t, item.q)}</h3>
                  <p className="mt-2 text-footnote text-label-2">{tx(t, item.a)}</p>
                </Card>
              </m.div>
            ))}
          </div>
        </m.section>

        {/* Dealers: real, sellable plans — kept off the main plan grid, one tap away. */}
        {/* Accordion: content stays in the DOM (hidden) so dealer prices remain indexable. */}
        <m.div {...onScrollReveal} variants={fadeUp} id="for-dealers" className="mx-auto max-w-4xl scroll-mt-24">
          <Card padding="none">
            <button
              type="button"
              aria-expanded={dealersOpen}
              aria-controls="for-dealers-panel"
              onClick={() => setDealersOpen((o) => !o)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-card p-5 text-left transition-colors duration-short ease-standard hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
            >
              <span className="inline-flex items-center gap-2 text-callout font-semibold text-foreground">
                <Users aria-hidden className="h-5 w-5 text-primary" />
                {t("shell.pricing.forDealers", "For dealers")}
              </span>
              <span className="inline-flex items-center gap-2">
                {!dealersOpen ? (
                  <span className="hidden text-footnote text-label-2 sm:inline">
                    {t("shell.pricing.forDealersHint", "Plans priced by stock size, from LKR 2,990/mo")}
                  </span>
                ) : null}
                <m.span
                  aria-hidden
                  animate={{ rotate: dealersOpen ? 180 : 0 }}
                  transition={motionStill ? { duration: 0 } : spring.snappy}
                  className="inline-flex"
                >
                  <ChevronDown className="h-5 w-5 text-label-2" />
                </m.span>
              </span>
            </button>
            <Collapse id="for-dealers-panel" open={dealersOpen} innerClassName="space-y-8 border-t border-separator p-5 sm:p-6">
              <DealerPlans />
              <div className="grid gap-4 md:grid-cols-3">
                {DEALER_FAQ.map((item) => (
                  <div key={item.q[0]} className="rounded-card bg-surface-2 p-5">
                    <h3 className="text-body font-semibold text-foreground">{tx(t, item.q)}</h3>
                    <p className="mt-2 text-footnote text-label-2">{tx(t, item.a)}</p>
                  </div>
                ))}
              </div>
            </Collapse>
          </Card>
        </m.div>

        <m.div id="get-started" {...onScrollReveal} variants={fadeUp} className="mx-auto max-w-4xl scroll-mt-24">
          <Card padding="lg" className="flex flex-col gap-5 border-primary/25 bg-primary/5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="mb-1 text-footnote font-semibold text-primary">{t("common.pro", "Pro")}</p>
              <h3 className="text-title3 font-semibold text-foreground">{t("shell.pricing.ctaTitle", "Get an email when Pro launches.")}</h3>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <TrialCta />
              <Button asChild variant="tertiary" size="sm">
                <a href={BRAND.contactMailto}>{t("common.messageUs", "Message us")}</a>
              </Button>
            </div>
          </Card>
        </m.div>
      </div>
    </PageCanvas>
  );
}
