import { useEffect, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CircleAlert, CircleCheck, MailCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppPreferences } from "@/lib/appPreferences";
import { APIError, verifyEmail } from "@/services/api";

type State =
  | { status: "verifying" }
  | { status: "success"; email?: string }
  | { status: "error"; reason: "missing" | "invalid" | "expired" | "failed" };

/** Tokens already redeemed this page load (StrictMode runs effects twice; tokens are single-use). */
const redeemed = new Map<string, Promise<{ email?: string }>>();

function redeemOnce(token: string) {
  let pending = redeemed.get(token);
  if (!pending) {
    pending = verifyEmail(token);
    redeemed.set(token, pending);
  }
  return pending;
}

/** `/verify-email?token=…` — redeems the emailed link automatically. */
export default function VerifyEmail() {
  const { t } = useAppPreferences();
  const [params] = useSearchParams();
  const token = (params.get("token") || "").trim();
  const [state, setState] = useState<State>(() => (token ? { status: "verifying" } : { status: "error", reason: "missing" }));
  useEffect(() => {
    // redeemOnce dedupes the request, so StrictMode's second effect run just
    // re-subscribes to the same in-flight promise.
    if (!token) return;
    let active = true;
    redeemOnce(token)
      .then((data) => {
        if (active) setState({ status: "success", email: data?.email });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const code = error instanceof APIError ? error.code : undefined;
        setState({
          status: "error",
          reason: code === "token_expired" ? "expired" : code === "invalid_token" ? "invalid" : "failed",
        });
      });
    return () => {
      active = false;
    };
  }, [token]);

  const errorText = (reason: Extract<State, { status: "error" }>["reason"]) => {
    switch (reason) {
      case "missing":
        return t("auth.verify.missing", "This verification link is incomplete. Open the link from your email again.");
      case "expired":
        return t("auth.verify.expired", "This verification link has expired. Sign in to request a new one.");
      case "invalid":
        return t("auth.verify.invalid", "This verification link is invalid or has already been used.");
      default:
        return t("auth.verify.failed", "We couldn't verify your email right now. Try again in a moment.");
    }
  };

  return (
    <AuthShell logoTo="/sign-in">
      <p className="cine-overline cine-in text-caption font-semibold text-primary" style={{ "--i": 1, "--cine-t0": "0.25s" } as CSSProperties}>
        <MailCheck aria-hidden className="h-3.5 w-3.5" />
        {t("auth.verify.eyebrow", "Email verification")}
      </p>
      <h1 className="cine-auth-heading cine-in mt-4 text-foreground" style={{ "--i": 2, "--cine-t0": "0.25s" } as CSSProperties}>
        {state.status === "success"
          ? t("auth.verify.successTitle", "Email verified")
          : state.status === "error"
            ? t("auth.verify.errorTitle", "Link not valid")
            : t("auth.verify.verifyingTitle", "Verifying your email…")}
      </h1>

      {state.status === "verifying" && (
        <div className="mt-7 space-y-3" role="status" aria-label={t("auth.verify.verifyingTitle", "Verifying your email…")}>
          <Skeleton className="h-12 w-full rounded-control" />
        </div>
      )}

      {state.status === "success" && (
        <div className="content-in mt-7 space-y-5">
          <div role="status" className="flex items-start gap-2.5 rounded-control border border-border bg-surface-2 px-3.5 py-3">
            <CircleCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-footnote text-foreground">
              {t("auth.verify.successBody", "Your email is confirmed and your account is active. Sign in to start your trial.")}
            </p>
          </div>
          <Button asChild size="lg" className="w-full">
            <Link to="/sign-in">
              {t("common.signIn", "Sign in")}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      )}

      {state.status === "error" && (
        <div className="content-in mt-7 space-y-5">
          <div role="alert" className="flex items-start gap-2.5 rounded-control border border-deal-high/30 bg-deal-high/10 px-3.5 py-3">
            <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-deal-high-text" />
            <p className="text-footnote font-medium text-deal-high-text">{errorText(state.reason)}</p>
          </div>
          <Button asChild variant="secondary" size="lg" className="w-full">
            <Link to="/sign-in">{t("auth.verify.backToSignIn", "Back to sign in")}</Link>
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
