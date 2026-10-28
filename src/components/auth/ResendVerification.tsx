import { useState } from "react";
import { MailCheck, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppPreferences } from "@/lib/appPreferences";
import { APIError, resendVerificationEmail } from "@/services/api";

type Status = "idle" | "sending" | "sent" | "error" | "rate_limited";

/**
 * "Resend verification email" control shared by sign-in (403 email_unverified)
 * and the post-signup "check your inbox" state. The API answers the same way
 * for every address, so this never reveals whether an account exists.
 */
export function ResendVerification({ email, className }: { email: string; className?: string }) {
  const { t } = useAppPreferences();
  const [status, setStatus] = useState<Status>("idle");

  const resend = async () => {
    if (!email || status === "sending") return;
    setStatus("sending");
    try {
      await resendVerificationEmail(email);
      setStatus("sent");
    } catch (error) {
      setStatus(error instanceof APIError && error.status === 429 ? "rate_limited" : "error");
    }
  };

  return (
    <div className={className ?? "rounded-control border border-border bg-surface-2 px-3.5 py-3"}>
      <p className="text-footnote text-label-2">
        {t("auth.verify.resendPrompt", "Didn't get the email? Check your spam folder or send a new link.")}
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-2.5 w-full"
        loading={status === "sending"}
        disabled={status === "sent"}
        onClick={resend}
      >
        {status === "sent" ? <MailCheck aria-hidden /> : <RotateCw aria-hidden />}
        {status === "sent"
          ? t("auth.verify.resent", "New link sent — check your inbox")
          : t("auth.verify.resend", "Resend verification email")}
      </Button>
      {(status === "error" || status === "rate_limited") && (
        <p role="alert" className="mt-2 text-footnote font-medium text-deal-high-text">
          {status === "rate_limited"
            ? t("auth.error.rateLimited", "Too many attempts. Wait a few minutes and try again.")
            : t("auth.verify.resendFailed", "Couldn't send a new link. Try again in a moment.")}
        </p>
      )}
    </div>
  );
}
