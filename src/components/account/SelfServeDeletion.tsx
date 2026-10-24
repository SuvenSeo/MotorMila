import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      <div role="status" className="content-in rounded-card border border-deal-good/30 bg-deal-good/10 p-5">
        <p className="flex items-center gap-2 text-body font-semibold text-deal-good-text">
          <Check aria-hidden className="h-4 w-4" /> {t("deleteAcct.doneTitle", "Your account has been deleted")}
        </p>
        <p className="mt-2 text-footnote text-label-1">
          {deletedEmail
            ? t("deleteAcct.doneBodyEmail", "{email} and its saved searches, alerts and watchlist are gone. You've been signed out.", { email: deletedEmail })
            : t("deleteAcct.doneBody", "Your saved searches, alerts and watchlist are gone. You've been signed out.")}
        </p>
        <Button asChild variant="secondary" className="mt-4 !no-underline">
          <Link to="/">{t("deleteAcct.home", "Back to MotorMila")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <Card className="space-y-4">
      <p className="text-footnote text-label-2">
        {t("deleteAcct.signedInAs", "Signed in as {email}.", { email: user?.email ?? "" })}
      </p>

      {phase === "idle" && (
        <Button type="button" variant="secondary" onClick={() => setPhase("confirm")} className="text-destructive">
          <Trash2 aria-hidden />
          {t("deleteAcct.start", "Delete my account now")}
        </Button>
      )}

      {(phase === "confirm" || phase === "deleting") && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void onDelete();
          }}
          className="content-in space-y-4"
          aria-describedby={`${uid}-warn`}
        >
          <p id={`${uid}-warn`} className="flex items-start gap-2 rounded-control border border-deal-high/30 bg-deal-high/10 p-3 text-footnote text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-deal-high-text" aria-hidden />
            {t("deleteAcct.warn", "This can't be undone. Any paid plan ends without a refund for unused time.")}
          </p>
          <div>
            <Label className="mb-2 block" htmlFor={`${uid}-typed`}>
              {t("deleteAcct.typeLabel", "Type {word} to confirm", { word: confirmWord })}
            </Label>
            <Input
              id={`${uid}-typed`}
              
              autoComplete="off"
              autoCapitalize="characters"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-2 block" htmlFor={`${uid}-pw`}>
              {t("deleteAcct.passwordLabel", "Password")}{" "}
              <span className="font-normal text-label-2">{t("deleteAcct.optional", "(optional extra check)")}</span>
            </Label>
            <Input
              id={`${uid}-pw`}
              
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="content-in text-footnote font-semibold text-deal-high-text">
              {error.message}{" "}
              {error.signIn ? (
                <Link to="/sign-in" state={{ from: { pathname: "/delete-account" } }} className="underline">
                  {t("deleteAcct.signIn", "Sign in")}
                </Link>
              ) : null}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="destructive" disabled={!canDelete} loading={phase === "deleting"}>
              <Trash2 aria-hidden />
              {t("deleteAcct.confirm", "Permanently delete")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={phase === "deleting"}
              onClick={() => {
                setPhase("idle");
                setTyped("");
                setPassword("");
                setError(null);
              }}
            >
              {t("deleteAcct.cancel", "Cancel")}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
