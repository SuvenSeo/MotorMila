import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, Loader2, Trash2 } from "lucide-react";
import { INPUT_CLASS, LABEL_CLASS } from "@/components/money/formStyles";
import { deleteMyAccount, DeleteAccountError } from "@/lib/accountApi";
import { useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";

type Phase = "idle" | "confirm" | "deleting" | "done";

/**
 * Signed-in account deletion: explain → confirm (type DELETE, optional
 * password re-check) → DELETE /auth/me → signed out + success state.
 */
export function SelfServeDeletion({ onDeleted }: { onDeleted?: () => void }) {
  const uid = useId();
  const { user, logout } = useAuth();
  const { t } = useAppPreferences();
  const [phase, setPhase] = useState<Phase>("idle");
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<{ message: string; signIn?: boolean } | null>(null);
  const [deletedEmail, setDeletedEmail] = useState<string | null>(null);

  const confirmWord = t("deleteAcct.confirmWord", "DELETE");
  const canDelete = typed.trim().toUpperCase() === confirmWord.toUpperCase();

  const messageFor = (err: unknown): { message: string; signIn?: boolean } => {
    if (err instanceof DeleteAccountError) {
      switch (err.code) {
        case "unauthenticated":
          return { message: t("deleteAcct.err.auth", "Your session has expired. Sign in again, then delete your account."), signIn: true };
        case "wrong_password":
          return { message: t("deleteAcct.err.password", "That password is incorrect. Nothing was deleted.") };
        case "managed_account":
          return { message: t("deleteAcct.err.managed", "This account is managed by MotorMila staff and can't be deleted here. Email us and we'll handle it.") };
        case "not_found":
          return { message: t("deleteAcct.err.notFound", "We couldn't find this account. It may already be deleted.") };
        case "rate_limited":
          return { message: t("deleteAcct.err.rate", "Too many attempts. Please wait a few minutes and try again.") };
        case "unavailable":
        case "network":
          return { message: t("deleteAcct.err.unavailable", "We couldn't reach the server, so nothing was deleted. Check your connection and try again.") };
        default:
          return { message: t("deleteAcct.err.unknown", "Account deletion failed and nothing was deleted. Please try again or email us.") };
      }
    }
    return { message: t("deleteAcct.err.unknown", "Account deletion failed and nothing was deleted. Please try again or email us.") };
  };

  const onDelete = async () => {
    if (!canDelete) return;
    setPhase("deleting");
    setError(null);
    try {
      const res = await deleteMyAccount(password || undefined);
      setDeletedEmail(res.email ?? user?.email ?? null);
      setPhase("done");
      onDeleted?.();
      logout();
    } catch (err) {
      setError(messageFor(err));
      setPhase("confirm");
    }
  };

  if (phase === "done") {
    return (
      <div role="status" className="rounded-2xl border border-deal-good/25 bg-deal-good/10 p-5">
        <p className="flex items-center gap-2 text-body font-semibold text-deal-good-text">
          <Check aria-hidden className="h-4 w-4" /> {t("deleteAcct.doneTitle", "Your account has been deleted")}
        </p>
        <p className="mt-2 text-footnote text-foreground/80">
          {deletedEmail
            ? t("deleteAcct.doneBodyEmail", "{email} and its saved searches, alerts and watchlist are gone. You've been signed out.", { email: deletedEmail })
            : t("deleteAcct.doneBody", "Your saved searches, alerts and watchlist are gone. You've been signed out.")}
        </p>
        <Link to="/" className="mt-3 inline-flex min-h-11 items-center rounded-full border border-border bg-card px-5 text-footnote font-semibold text-foreground no-underline">
          {t("deleteAcct.home", "Back to MotorMila")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-[1.75rem] border border-border bg-card p-6 shadow-soft">
      <p className="text-footnote text-foreground/85">
        {t("deleteAcct.signedInAs", "Signed in as {email}.", { email: user?.email ?? "" })}
      </p>

      {phase === "idle" && (
        <button
          type="button"
          onClick={() => setPhase("confirm")}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-5 text-footnote font-semibold text-destructive hover:bg-destructive/15"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          {t("deleteAcct.start", "Delete my account now")}
        </button>
      )}

      {(phase === "confirm" || phase === "deleting") && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void onDelete();
          }}
          className="space-y-4"
          aria-describedby={`${uid}-warn`}
        >
          <p id={`${uid}-warn`} className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-footnote text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            {t("deleteAcct.warn", "This can't be undone. Any paid plan ends without a refund for unused time.")}
          </p>
          <div>
            <label className={LABEL_CLASS} htmlFor={`${uid}-typed`}>
              {t("deleteAcct.typeLabel", "Type {word} to confirm", { word: confirmWord })}
            </label>
            <input
              id={`${uid}-typed`}
              className={INPUT_CLASS}
              autoComplete="off"
              autoCapitalize="characters"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor={`${uid}-pw`}>
              {t("deleteAcct.passwordLabel", "Password")}{" "}
              <span className="font-normal text-muted-foreground">{t("deleteAcct.optional", "(optional extra check)")}</span>
            </label>
            <input
              id={`${uid}-pw`}
              className={INPUT_CLASS}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-footnote font-semibold text-destructive">
              {error.message}{" "}
              {error.signIn ? (
                <Link to="/sign-in" state={{ from: { pathname: "/delete-account" } }} className="underline">
                  {t("deleteAcct.signIn", "Sign in")}
                </Link>
              ) : null}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!canDelete || phase === "deleting"}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-destructive px-5 text-footnote font-semibold text-destructive-foreground disabled:opacity-40"
            >
              {phase === "deleting" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
              {phase === "deleting" ? t("deleteAcct.deleting", "Deleting…") : t("deleteAcct.confirm", "Permanently delete")}
            </button>
            <button
              type="button"
              disabled={phase === "deleting"}
              onClick={() => {
                setPhase("idle");
                setTyped("");
                setPassword("");
                setError(null);
              }}
              className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-5 text-footnote font-semibold text-foreground"
            >
              {t("deleteAcct.cancel", "Cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
