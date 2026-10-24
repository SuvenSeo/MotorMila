import { useEffect, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Check, Eye, EyeOff, Mail, ShieldCheck } from "lucide-react";
import { AtmosphericImage } from "@/components/AtmosphericImage";
import { BrandLogo } from "@/components/BrandLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/authContext";
import { authErrorText } from "@/lib/authErrorText";
import { useAppPreferences } from "@/lib/appPreferences";
import { API_BASE, resolveFetchCredentials } from "@/services/api";
import { fadeIn, revealContainer, scaleIn } from "@/lib/motion";
import { visuals } from "@/lib/visualAssets";
import { cn } from "@/lib/utils";

type FormValues = { name: string; password: string; confirm: string };

type InvitePreview = {
  email: string;
  plan: string;
  expiresAt?: string;
};

function FieldError({ message }: { message?: string }) {
  return (
    <AnimatePresence initial={false}>
      {message ? (
        <m.p key="err" variants={fadeIn} initial="hidden" animate="show" exit="exit" className="text-footnote font-medium text-deal-high-text">
          {message}
        </m.p>
      ) : null}
    </AnimatePresence>
  );
}

function RevealToggle({ shown, onToggle, labels }: { shown: boolean; onToggle: () => void; labels: [string, string] }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onToggle}
      className="absolute right-2 top-1/2 -translate-y-1/2 text-label-2 active:scale-95"
      aria-label={shown ? labels[0] : labels[1]}
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.span key={shown ? "off" : "on"} variants={scaleIn} initial="hidden" animate="show" exit="exit" className="inline-flex">
          {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </m.span>
      </AnimatePresence>
    </Button>
  );
}

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
          // 5xx (e.g. the database is down) is not "invite not found".
          const detail =
            response.status === 410
              ? t("signup.expired", "This invite has expired or was already used.")
              : response.status >= 500 || response.status === 429
                ? t("signup.verifyFailed", "Could not verify invite. Try again shortly.")
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
    setServerError(authErrorText(result, t("signup.failed", "Sign-up failed"), t));
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
    setServerError(authErrorText(result, t("signup.failed", "Sign-up failed"), t));
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
      detail: t("shell.copy.signupFree", "Search every listing, price ranges and the import tax calculator. Free during beta."),
    },
    pro: {
      title: t("signup.plan.pro.title", "Pro access"),
      detail: t("shell.copy.signupPro", "Coming soon: deal scores on every listing, full price history and exports."),
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

  const pwLabels: [string, string] = [t("signup.hidePassword", "Hide password"), t("signup.showPassword", "Show password")];
  const serverAlert = (
    <AnimatePresence initial={false}>
      {serverError ? (
        <m.p
          key="server"
          role="alert"
          variants={fadeIn}
          initial="hidden"
          animate="show"
          exit="exit"
          className="rounded-control border border-deal-high/30 bg-deal-high/10 px-3 py-2 text-footnote font-medium text-deal-high-text"
        >
          {serverError}
        </m.p>
      ) : null}
    </AnimatePresence>
  );

  return (
    <m.div
      initial="hidden"
      animate="show"
      variants={revealContainer}
      className="relative grid min-h-screen bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
    >
      {/* Same split as Sign in: photo panel on desktop, form follows the theme. */}
      <div aria-hidden className="pointer-events-none relative order-2 hidden p-3 lg:block">
        <div className="relative h-full overflow-hidden rounded-sheet">
          <AtmosphericImage
            src={visuals.darkGarageSilhouette.src}
            srcSm={visuals.darkGarageSilhouette.srcSm}
            className="h-full w-full object-cover object-[62%_center]"
            priority
            sizes="55vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/20" />
          <div className="absolute inset-x-8 bottom-8 max-w-md">
            <p className="font-display text-title2 font-semibold text-white">{t("signup.heroTitle", "Activate your Motormila seat.")}</p>
            <ul className="mt-4 space-y-2">
              {bullets.map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-footnote text-white/85">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="relative z-10 order-1 flex min-h-screen items-center justify-center px-5 py-12 sm:px-8">
        <m.div variants={scaleIn} className="w-full max-w-[25rem]">
          <Link
            to="/sign-in"
            className="mb-10 flex w-fit rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Motormila"
          >
            <BrandLogo size="nav" showTagline={false} />
          </Link>

          <Badge variant="info" className="mb-4">
            <ShieldCheck aria-hidden />
            {selfServeEnabled && !token
              ? t("signup.freeTrial", `${selfServeTrialDays}-day free trial`)
              : t("signup.inviteOnly", "Invite only")}
          </Badge>
          <h1 className="font-display text-title1 font-semibold text-foreground">{t("signup.createAccount", "Create your account")}</h1>
          <p className="mt-2 text-body text-label-2">
            {selfServeEnabled && !token
              ? t("signup.selfServeSubtitle", `Start your ${selfServeTrialDays}-day Pro trial — no invite needed.`)
              : t("signup.subtitle", "Motormila is closed to the public. Complete signup with the invite your admin sent you.")}
          </p>

          {(inviteLoading || selfServeChecking) && (
            <div className="mt-7 space-y-3" role="status" aria-label={token ? t("signup.verifying", "Verifying invite…") : t("signup.checkingSignup", "Checking signup options…")}>
              <Skeleton className="h-12 w-full rounded-control" />
              <Skeleton className="h-12 w-full rounded-control" />
              <p className="text-footnote text-label-2">
                {token ? t("signup.verifying", "Verifying invite…") : t("signup.checkingSignup", "Checking signup options…")}
              </p>
            </div>
          )}

          {inviteError && (
            // No token at all (someone just opened /sign-up) is not an error: neutral, not red.
            <div
              role={token ? "alert" : "status"}
              className={cn(
                "content-in mt-7 rounded-card border p-4 text-footnote font-medium",
                token ? "border-deal-high/30 bg-deal-high/10 text-deal-high-text" : "border-border bg-surface-2 text-foreground",
              )}
            >
              {inviteError}
              <p className="mt-3 font-normal text-label-2">
                {t("signup.alreadyRegistered", "Already registered?")}{" "}
                <Link to="/sign-in" className="font-semibold text-primary underline-offset-4 hover:underline">
                  {t("common.signIn", "Sign in")}
                </Link>
              </p>
            </div>
          )}

          {selfServeEnabled && !token && !inviteError && !selfServeChecking && (
            <form onSubmit={handleSubmit(onSelfServeSubmit)} className="content-in mt-7 space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="self-email">{t("signup.email", "Email")}</Label>
                <Input
                  id="self-email"
                  type="email"
                  autoComplete="email"
                  value={selfServeEmail}
                  onChange={(event) => setSelfServeEmail(event.target.value)}
                  aria-invalid={selfServeEmailError ? true : undefined}
                  className="h-12"
                />
                <FieldError message={selfServeEmailError} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="self-name">{t("signup.fullName", "Full name")}</Label>
                <Input id="self-name" autoComplete="name" {...register("name")} aria-invalid={errors.name ? true : undefined} className="h-12" />
                <FieldError message={errors.name?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="self-password">{t("signup.password", "Password")}</Label>
                <div className="relative">
                  <Input
                    id="self-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    {...register("password")}
                    aria-invalid={errors.password ? true : undefined}
                    className="h-12 pr-12"
                  />
                  <RevealToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} labels={pwLabels} />
                </div>
                <FieldError message={errors.password?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="self-confirm">{t("signup.confirmPassword", "Confirm password")}</Label>
                <Input id="self-confirm" type="password" autoComplete="new-password" {...register("confirm")} aria-invalid={errors.confirm ? true : undefined} className="h-12" />
                <FieldError message={errors.confirm?.message} />
              </div>
              {serverAlert}
              <Button type="submit" size="lg" className="w-full" loading={loading}>
                {t("signup.startTrial", `Start ${selfServeTrialDays}-day trial`)}
                <ArrowRight aria-hidden />
              </Button>
              <p className="text-center text-footnote text-label-2">
                {t("signup.alreadyRegistered", "Already registered?")}{" "}
                <Link to="/sign-in" className="font-semibold text-primary underline-offset-4 hover:underline">
                  {t("common.signIn", "Sign in")}
                </Link>
              </p>
            </form>
          )}

          {invite && !inviteError && (
            <div className="content-in">
              <Card padding="none" className="mt-7 overflow-hidden">
                <div className="flex items-center gap-3 border-b border-separator px-4 py-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
                    <Mail className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-caption text-label-2">{t("signup.invitedAs", "Invited as")}</p>
                    <p className="truncate text-body font-semibold text-foreground">{invite.email}</p>
                  </div>
                  <Badge variant="info">{invite.plan}</Badge>
                </div>
                <div className="px-4 py-3.5">
                  <p className="text-footnote font-semibold text-foreground">{planMeta.title}</p>
                  <p className="mt-1 text-footnote text-label-2">{planMeta.detail}</p>
                </div>
              </Card>

              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="name">{t("signup.fullName", "Full name")}</Label>
                  <Input id="name" autoComplete="name" {...register("name")} aria-invalid={errors.name ? true : undefined} className="h-12" />
                  <FieldError message={errors.name?.message} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t("signup.password", "Password")}</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      {...register("password")}
                      aria-invalid={errors.password ? true : undefined}
                      className="h-12 pr-12"
                    />
                    <RevealToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} labels={pwLabels} />
                  </div>
                  <FieldError message={errors.password?.message} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">{t("signup.confirmPassword", "Confirm password")}</Label>
                  <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} aria-invalid={errors.confirm ? true : undefined} className="h-12" />
                  <FieldError message={errors.confirm?.message} />
                </div>
                {serverAlert}
                <Button type="submit" size="lg" className="w-full" loading={loading}>
                  {t("signup.activate", "Activate account")}
                  <ArrowRight aria-hidden />
                </Button>
              </form>
            </div>
          )}
        </m.div>
      </div>
    </m.div>
  );
}
