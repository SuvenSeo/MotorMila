import { useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, KeyRound, MailCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppPreferences } from "@/lib/appPreferences";
import { APIError, requestPasswordReset } from "@/services/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `/forgot-password` — request a single-use reset link by email. */
export default function ForgotPassword() {
  const { t } = useAppPreferences();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) {
      setError(t("signin.resetInvalid", "Enter a valid email address."));
      return;
    }
    setError("");
    setSending(true);
    try {
      await requestPasswordReset(address);
      setSent(true);
    } catch (err) {
      setError(
        err instanceof APIError && err.status === 429
          ? t("auth.error.rateLimited", "Too many attempts. Wait a few minutes and try again.")
          : t("auth.reset.requestFailed", "Couldn't send the reset email. Try again in a moment."),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthShell logoTo="/sign-in">
      <p className="cine-overline cine-in text-caption font-semibold text-primary" style={{ "--i": 1, "--cine-t0": "0.25s" } as CSSProperties}>
        <KeyRound aria-hidden className="h-3.5 w-3.5" />
        {t("auth.reset.eyebrow", "Account recovery")}
      </p>
      <h1 className="cine-auth-heading cine-in mt-4 text-foreground" style={{ "--i": 2, "--cine-t0": "0.25s" } as CSSProperties}>
        {t("signin.resetTitle", "Reset your password")}
      </h1>
      <p className="cine-in mt-3 text-body text-label-2" style={{ "--i": 2, "--cine-t0": "0.3s" } as CSSProperties}>
        {t("auth.reset.forgotSubtitle", "Enter your account email and we'll send you a link to choose a new password.")}
      </p>

      {sent ? (
        <div className="content-in mt-7 space-y-5">
          <div role="status" className="flex items-start gap-2.5 rounded-control border border-border bg-surface-2 px-3.5 py-3">
            <MailCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-footnote text-foreground">
              {t(
                "auth.reset.sent",
                "If an account matches that address, a reset link is on its way. It expires in 1 hour and works once.",
              )}
            </p>
          </div>
          <Button asChild variant="secondary" size="lg" className="w-full">
            <Link to="/sign-in">{t("auth.verify.backToSignIn", "Back to sign in")}</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="cine-in mt-8 space-y-4" style={{ "--i": 3, "--cine-t0": "0.25s" } as CSSProperties} noValidate>
          <div className="space-y-2">
            <Label htmlFor="forgot-email">{t("signin.email", "Email")}</Label>
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("shell.copy.emailPlaceholder", "you@example.com")}
              aria-invalid={error ? true : undefined}
              className="h-12"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-control border border-deal-high/30 bg-deal-high/10 px-3 py-2 text-footnote font-medium text-deal-high-text">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={sending}>
            {t("auth.reset.sendLink", "Send reset link")}
            <ArrowRight aria-hidden />
          </Button>
          <Button asChild variant="tertiary" size="sm" className="-ml-3">
            <Link to="/sign-in">
              <ArrowLeft aria-hidden />
              {t("auth.verify.backToSignIn", "Back to sign in")}
            </Link>
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
