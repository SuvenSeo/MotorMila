import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Eye, EyeOff, KeyRound, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";
import { API_BASE, resolveFetchCredentials } from "@/services/api";
import { revealContainer, revealItem, springSoft } from "@/lib/motion";
import { BRAND } from "@/lib/brand";

type FormValues = { name: string; password: string; confirm: string };

type InvitePreview = {
  email: string;
  plan: string;
  expiresAt?: string;
};

export default function SignUp() {
  const { signup, selfSignup, isAuthenticated, authReady } = useAuth();
  const { t } = useAppPreferences();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = (params.get("token") || "").trim();

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [inviteLoading, setInviteLoading] = useState(Boolean(token));
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  // Self-serve trial (B2-A): when no invite token, check the public flag.
  const [selfServeEnabled, setSelfServeEnabled] = useState(false);
  const [selfServeTrialDays, setSelfServeTrialDays] = useState(7);
  const [selfServeChecking, setSelfServeChecking] = useState(!token);
  const [selfServeEmail, setSelfServeEmail] = useState("");
  const [selfServeEmailError, setSelfServeEmailError] = useState("");

  const schema = z
    .object({
      name: z.string().min(1, t("signup.nameRequired", "Name is required")).max(120),
      password: z.string().min(8, t("signup.passwordMin", "Password must be at least 8 characters")),
      confirm: z.string().min(1, t("signup.confirmRequired", "Confirm your password")),
    })
    .refine((values) => values.password === values.confirm, {
      message: t("signup.passwordMismatch", "Passwords do not match"),
      path: ["confirm"],
    });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!token) {
      setInviteLoading(false);
      // No token: fall back to self-serve trial when the backend enables it.
      let cancelled = false;
      void (async () => {
        setSelfServeChecking(true);
        try {
          const response = await fetch(
            new URL(`${API_BASE}/auth/self-signup/status`, window.location.origin).toString(),
            { credentials: resolveFetchCredentials(API_BASE), headers: { Accept: "application/json" } },
          );
          if (cancelled) return;
          if (response.ok) {
            const data = (await response.json()) as { enabled?: boolean; trialDays?: number };
            if (data.enabled) {
              setSelfServeEnabled(true);
              if (typeof data.trialDays === "number" && data.trialDays >= 1) setSelfServeTrialDays(data.trialDays);
              setInviteError("");
              return;
            }
          }
          setInviteError(t("signup.missingToken", "This sign-up link is missing an invite token. Ask your Motormila admin for a new invite."));
        } catch {
          if (!cancelled) setInviteError(t("signup.missingToken", "This sign-up link is missing an invite token. Ask your Motormila admin for a new invite."));
        } finally {
          if (!cancelled) setSelfServeChecking(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    void (async () => {
      setInviteLoading(true);
      setInviteError("");
      try {
        const response = await fetch(
          new URL(`${API_BASE}/auth/invite/${encodeURIComponent(token)}`, window.location.origin).toString(),
          {
            credentials: resolveFetchCredentials(API_BASE),
            headers: { Accept: "application/json" },
          },
        );
        if (cancelled) return;
        if (!response.ok) {
          const detail =
            response.status === 410
              ? t("signup.expired", "This invite has expired or was already used.")
              : t("signup.notFound", "Invite not found. Ask your admin to send a new one.");
          setInviteError(detail);
          setInvite(null);
          return;
        }
        const data = (await response.json()) as InvitePreview;
        setInvite(data);
      } catch {
        if (!cancelled) setInviteError(t("signup.verifyFailed", "Could not verify invite. Try again shortly."));
      } finally {
        if (!cancelled) setInviteLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const onSubmit = async (values: FormValues) => {
    if (!token) return;
    setLoading(true);
    setServerError("");
    const result = await signup({ token, name: values.name, password: values.password });
    setLoading(false);
    if (result.success) {
      navigate("/", { replace: true });
      return;
    }
    setServerError(result.error || t("signup.failed", "Sign-up failed"));
  };

  const onSelfServeSubmit = async (values: FormValues) => {
    const email = selfServeEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setSelfServeEmailError(t("signup.emailRequired", "Enter a valid email address"));
      return;
    }
    setSelfServeEmailError("");
    setLoading(true);
    setServerError("");
    const result = await selfSignup({ email, name: values.name, password: values.password });
    setLoading(false);
    if (result.success) {
      navigate("/", { replace: true });
      return;
    }
    setServerError(result.error || t("signup.failed", "Sign-up failed"));
  };

  if (authReady && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const planKey =
    invite?.plan === "pro" || invite?.plan === "enterprise" || invite?.plan === "dealer"
      ? invite.plan
      : "free";
  const planMeta = {
    free: {
      title: t("signup.plan.free.title", "Free access"),
      detail: t("signup.plan.free.detail", "Browse every page with soft limits. Scores, full history, and deep tools unlock on Pro."),
    },
    pro: {
      title: t("signup.plan.pro.title", "Pro access"),
      detail: t("signup.plan.pro.detail", "Full terminal — lane intelligence, district depth, and export packs."),
    },
    dealer: {
      title: t("signup.plan.dealer.title", "Dealer access"),
      detail: t("signup.plan.dealer.detail", "Everything in Pro plus the full dealer workspace, URL benchmark, and yard tools."),
    },
    enterprise: {
      title: t("signup.plan.enterprise.title", "Enterprise access"),
      detail: t("signup.plan.enterprise.detail", "Operator-grade access with admin capabilities where provisioned."),
    },
  }[planKey];

  const bullets = [
    t("signup.bullet1", "Closed platform — no public self-serve signup"),
    t("signup.bullet2", "Your plan is set by the Motormila admin"),
    t("signup.bullet3", "Credentials stay private to your organisation"),
  ];

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={revealContainer}
      className="relative min-h-screen overflow-hidden bg-background"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_70%_-8%,hsl(var(--primary)/0.14),transparent_55%)]" />
        <div className="absolute left-[-10%] bottom-[10%] h-[420px] w-[420px] rounded-full bg-primary/[0.05] blur-[110px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1080px] items-center px-5 py-14 sm:px-8">
        <div className="grid w-full gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-14">
          <motion.div variants={revealItem} className="hidden lg:block">
            <p className="section-eyebrow mb-4 inline-flex items-center gap-2">
              <KeyRound className="h-3.5 w-3.5" aria-hidden />
              {t("signup.invitation", "Invitation")}
            </p>
            <h1 className="display-1 max-w-[12ch] text-foreground">
              {t("signup.heroTitle", "Activate your Motormila seat.")}
            </h1>
            <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-muted-foreground">
              {BRAND.vision}
            </p>
            <div className="mt-8 space-y-3">
              {bullets.map((line) => (
                <div key={line} className="flex items-start gap-3 rounded-3xl border border-border bg-card/50 px-4 py-3">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  <p className="text-[13px] font-medium text-foreground/90">{line}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div variants={revealItem} className="premium-surface mx-auto w-full max-w-md p-7 shadow-soft-lg sm:p-9 lg:mx-0 lg:max-w-none">
            <Link to="/sign-in" className="mb-8 inline-flex items-center gap-2.5 no-underline group">
              <div className="h-9 w-9 overflow-hidden rounded-full ring-1 ring-border transition-all group-hover:ring-primary/40">
                <img src="/logo.png" alt="Motormila" className="h-full w-full object-cover" />
              </div>
              <span className="font-display text-sm font-bold text-foreground">{BRAND.name}</span>
            </Link>

            <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
              <ShieldCheck className="h-3 w-3 text-primary" aria-hidden />
              <span className="text-[12px] font-semibold text-primary-bright">
                {selfServeEnabled && !token
                  ? t("signup.freeTrial", `${selfServeTrialDays}-day free trial`)
                  : t("signup.inviteOnly", "Invite only")}
              </span>
            </div>
            <h2 className="font-display text-[1.85rem] font-semibold tracking-tight text-foreground sm:text-[2.1rem]">
              {t("signup.createAccount", "Create your account")}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {selfServeEnabled && !token
                ? t("signup.selfServeSubtitle", `Start your ${selfServeTrialDays}-day Pro trial — no invite needed.`)
                : t("signup.subtitle", "Motormila is closed to the public. Complete signup with the invite your admin sent you.")}
            </p>

            {(inviteLoading || selfServeChecking) && (
              <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground" role="status">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                {token ? t("signup.verifying", "Verifying invite…") : t("signup.checkingSignup", "Checking signup options…")}
              </div>
            )}

            {inviteError && (
              <div className="mt-7 rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-4 text-[13px] font-medium text-rose-600 dark:text-rose-300">
                {inviteError}
                <p className="mt-3 text-muted-foreground">
                  {t("signup.alreadyRegistered", "Already registered?")}{" "}
                  <Link to="/sign-in" className="font-semibold text-foreground underline underline-offset-4">
                    {t("common.signIn", "Sign in")}
                  </Link>
                </p>
              </div>
            )}

            {selfServeEnabled && !token && !inviteError && !selfServeChecking && (
              <form onSubmit={handleSubmit(onSelfServeSubmit)} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="self-email" className="field-label">{t("signup.email", "Email")}</Label>
                  <Input
                    id="self-email"
                    type="email"
                    autoComplete="email"
                    value={selfServeEmail}
                    onChange={(event) => setSelfServeEmail(event.target.value)}
                    className="h-12 rounded-full bg-surface"
                  />
                  {selfServeEmailError && <p className="text-[11px] font-semibold text-rose-600">{selfServeEmailError}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="self-name" className="field-label">{t("signup.fullName", "Full name")}</Label>
                  <Input id="self-name" autoComplete="name" {...register("name")} className="h-12 rounded-full bg-surface" />
                  {errors.name && <p className="text-[11px] font-semibold text-rose-600">{errors.name.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="self-password" className="field-label">{t("signup.password", "Password")}</Label>
                  <div className="relative">
                    <Input
                      id="self-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      {...register("password")}
                      className="h-12 rounded-full bg-surface pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                      aria-label={showPassword ? t("signup.hidePassword", "Hide password") : t("signup.showPassword", "Show password")}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-[11px] font-semibold text-rose-600">{errors.password.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="self-confirm" className="field-label">{t("signup.confirmPassword", "Confirm password")}</Label>
                  <Input id="self-confirm" type="password" autoComplete="new-password" {...register("confirm")} className="h-12 rounded-full bg-surface" />
                  {errors.confirm && <p className="text-[11px] font-semibold text-rose-600">{errors.confirm.message}</p>}
                </div>
                {serverError && (
                  <p className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3.5 py-2.5 text-[12px] font-medium text-rose-600">
                    {serverError}
                  </p>
                )}
                <motion.button
                  type="submit"
                  disabled={loading}
                  whileTap={{ scale: 0.98 }}
                  transition={springSoft}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[12px] font-semibold tracking-tight text-primary-foreground shadow-soft disabled:opacity-50"
                >
                  {loading ? t("signup.creating", "Creating account…") : (
                    <>
                      <span>{t("signup.startTrial", `Start ${selfServeTrialDays}-day trial`)}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </>
                  )}
                </motion.button>
                <p className="text-center text-[12px] text-muted-foreground">
                  {t("signup.alreadyRegistered", "Already registered?")}{" "}
                  <Link to="/sign-in" className="font-semibold text-foreground underline underline-offset-4">
                    {t("common.signIn", "Sign in")}
                  </Link>
                </p>
              </form>
            )}

            {invite && !inviteError && (
              <>
                <div className="mt-7 overflow-hidden rounded-2xl border border-border bg-surface">
                  <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/15 bg-primary/10">
                      <Mail className="h-4 w-4 text-primary" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-muted-foreground">{t("signup.invitedAs", "Invited as")}</p>
                      <p className="truncate text-[14px] font-semibold text-foreground">{invite.email}</p>
                    </div>
                    <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary-bright">
                      {invite.plan}
                    </span>
                  </div>
                  <div className="px-4 py-3.5">
                    <p className="text-[13px] font-semibold text-foreground">{planMeta.title}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{planMeta.detail}</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="field-label">{t("signup.fullName", "Full name")}</Label>
                    <Input id="name" autoComplete="name" {...register("name")} className="h-12 rounded-full bg-surface" />
                    {errors.name && <p className="text-[11px] font-semibold text-rose-600">{errors.name.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="field-label">{t("signup.password", "Password")}</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        {...register("password")}
                        className="h-12 rounded-full bg-surface pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                        aria-label={showPassword ? t("signup.hidePassword", "Hide password") : t("signup.showPassword", "Show password")}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-[11px] font-semibold text-rose-600">{errors.password.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirm" className="field-label">{t("signup.confirmPassword", "Confirm password")}</Label>
                    <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} className="h-12 rounded-full bg-surface" />
                    {errors.confirm && <p className="text-[11px] font-semibold text-rose-600">{errors.confirm.message}</p>}
                  </div>
                  {serverError && (
                    <p className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3.5 py-2.5 text-[12px] font-medium text-rose-600">
                      {serverError}
                    </p>
                  )}
                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileTap={{ scale: 0.98 }}
                    transition={springSoft}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[12px] font-semibold tracking-tight text-primary-foreground shadow-soft disabled:opacity-50"
                  >
                    {loading ? t("signup.creating", "Creating account…") : (
                      <>
                        <span>{t("signup.activate", "Activate account")}</span>
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </>
                    )}
                  </motion.button>
                </form>
              </>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
