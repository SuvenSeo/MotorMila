import { useState, type CSSProperties, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CircleCheck, Eye, EyeOff, KeyRound } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppPreferences } from "@/lib/appPreferences";
import { APIError, resetPassword } from "@/services/api";

const MIN_PASSWORD = 8;

/** `/reset-password?token=…` — choose a new password from an emailed link. */
export default function ResetPassword() {
  const { t } = useAppPreferences();
  const [params] = useSearchParams();
  const token = (params.get("token") || "").trim();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [linkProblem, setLinkProblem] = useState(!token);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(t("auth.reset.tooShort", "Use at least 8 characters."));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.reset.mismatch", "Passwords don't match."));
      return;
    }
    setError("");
    setSaving(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      if (err instanceof APIError && (err.code === "invalid_token" || err.code === "token_expired")) {
        setLinkProblem(true);
        setError(
          err.code === "token_expired"
            ? t("auth.reset.expired", "This reset link has expired. Request a new one.")
            : t("auth.reset.invalid", "This reset link is invalid or has already been used."),
        );
      } else if (err instanceof APIError && err.status === 429) {
        setError(t("auth.error.rateLimited", "Too many attempts. Wait a few minutes and try again."));
      } else {
        setError(t("auth.reset.failed", "Couldn't update your password. Try again in a moment."));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell logoTo="/sign-in">
      <p className="cine-overline cine-in text-caption font-semibold text-primary" style={{ "--i": 1, "--cine-t0": "0.25s" } as CSSProperties}>
        <KeyRound aria-hidden className="h-3.5 w-3.5" />
        {t("auth.reset.eyebrow", "Account recovery")}
      </p>
      <h1 className="cine-auth-heading cine-in mt-4 text-foreground" style={{ "--i": 2, "--cine-t0": "0.25s" } as CSSProperties}>
        {done ? t("auth.reset.doneTitle", "Password updated") : t("auth.reset.newTitle", "Choose a new password")}
      </h1>

      {done ? (
        <div className="content-in mt-7 space-y-5">
          <div role="status" className="flex items-start gap-2.5 rounded-control border border-border bg-surface-2 px-3.5 py-3">
            <CircleCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-footnote text-foreground">
              {t("auth.reset.doneBody", "Your password has been changed and you've been signed out on every device. Sign in with the new password.")}
            </p>
          </div>
          <Button asChild size="lg" className="w-full">
            <Link to="/sign-in">
              {t("common.signIn", "Sign in")}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      ) : !token ? (
        <div className="content-in mt-7 space-y-5">
          <p role="alert" className="rounded-control border border-deal-high/30 bg-deal-high/10 px-3 py-2 text-footnote font-medium text-deal-high-text">
            {t("auth.reset.missing", "This reset link is incomplete. Open the link from your email again.")}
          </p>
          <Button asChild variant="secondary" size="lg" className="w-full">
            <Link to="/forgot-password">{t("auth.reset.requestNew", "Request a new link")}</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="cine-in mt-8 space-y-4" style={{ "--i": 3, "--cine-t0": "0.25s" } as CSSProperties} noValidate>
          <div className="space-y-2">
            <Label htmlFor="reset-password">{t("auth.reset.newPassword", "New password")}</Label>
            <div className="relative">
              <Input
                id="reset-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 pr-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-label-2 active:scale-95"
                aria-label={showPassword ? t("signin.hidePassword", "Hide password") : t("signin.showPassword", "Show password")}
              >
                {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-confirm">{t("signup.confirmPassword", "Confirm password")}</Label>
            <Input
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="h-12"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-control border border-deal-high/30 bg-deal-high/10 px-3 py-2 text-footnote font-medium text-deal-high-text">
              {error}
            </p>
          )}
          {linkProblem ? (
            <Button asChild variant="secondary" size="lg" className="w-full">
              <Link to="/forgot-password">{t("auth.reset.requestNew", "Request a new link")}</Link>
            </Button>
          ) : (
            <Button type="submit" size="lg" className="w-full" loading={saving}>
              {t("auth.reset.submit", "Update password")}
              <ArrowRight aria-hidden />
            </Button>
          )}
        </form>
      )}
    </AuthShell>
  );
}
