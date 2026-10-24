import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, Receipt, XCircle } from "lucide-react";
import { m } from "motion/react";
import { PageCanvas } from "@/components/PageCanvas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getPayhereOrder } from "@/lib/moneyApi";
import { friendlyApiError } from "@/lib/apiErrorText";
import { useAppPreferences } from "@/lib/appPreferences";
import { fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** PayHere return_url. PayHere passes no status here, so we poll our own order record. */
export default function CheckoutReturn() {
  const { t } = useAppPreferences();
  const [params] = useSearchParams();
  const orderId = params.get("order_id") ?? "";
  const [status, setStatus] = useState<string>(orderId ? "checking" : "unknown");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!orderId) {
      setStatus("unknown");
      return;
    }
    let cancelled = false;
    let tries = 0;
    setError(null);
    setStatus("checking");
    const poll = async () => {
      tries += 1;
      try {
        const order = await getPayhereOrder(orderId);
        if (cancelled) return;
        setStatus(order.status);
        if ((order.status === "created" || order.status === "pending") && tries < 10) {
          window.setTimeout(poll, 3000);
        }
      } catch (err) {
        // Stop the "confirming" spinner: a lookup failure is not a failed payment.
        if (!cancelled) {
          setError(friendlyApiError(err, t("acct.checkout.checkFailed", "Couldn't check the payment."), t));
          setStatus("lookup_failed");
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [orderId, t, attempt]);

  const paid = status === "paid";
  const waiting = status === "checking" || status === "created" || status === "pending";
  // No order_id at all (direct visit, bookmark, stripped redirect) is not a
  // failure: show a neutral "nothing to confirm" state, never red.
  const noOrder = status === "unknown";
  const lookupFailed = status === "lookup_failed";
  const failed = !paid && !waiting && !noOrder && !lookupFailed;
  const Icon = paid ? CheckCircle2 : waiting ? Clock : noOrder || lookupFailed ? Receipt : XCircle;
  const title = paid
    ? t("acct.checkout.paidTitle", "Payment received")
    : waiting
      ? t("acct.checkout.waitingTitle", "Confirming your payment")
      : lookupFailed
        ? t("acct.checkout.checkFailed", "Couldn't check the payment.")
        : noOrder
        ? t("acct.checkout.noOrderTitle", "No payment to confirm")
        : t("acct.checkout.failedTitle", "Payment not completed");
  const body = paid
    ? t("acct.checkout.paidBody", "Your plan is active. Sign out and back in if you don't see it straight away.")
    : waiting
      ? t("acct.checkout.waitingBody", "PayHere is confirming the payment with us. This usually takes a few seconds.")
      : lookupFailed
        ? t("acct.checkout.lookupFailedBody", "Your payment may still have gone through. Check again in a minute, or open your account to see your plan.")
        : noOrder
        ? t("acct.checkout.noOrderBody", "This page confirms a PayHere checkout. Start from Pricing to choose a plan, or open your account to see an existing one.")
        : t("acct.checkout.failedBody", "No money was taken for this order, or it was cancelled. You can try again or pay by bank transfer or KOKO.");

  return (
    <PageCanvas ambient="none">
      <PageHeader size="compact" eyebrow={t("acct.checkout.eyebrow", "Checkout")} eyebrowIcon={Receipt} title={title} description={body} />
      <div className="layout-shell pb-20">
        <m.div variants={fadeUp} className="max-w-xl">
          <Card role="status" aria-live="polite" className="space-y-5">
            <div className="flex items-center gap-4">
              <span
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
                  paid && "bg-deal-good/10 text-deal-good-text",
                  waiting && "bg-primary/10 text-primary",
                  (noOrder || lookupFailed) && "bg-surface-2 text-label-2",
                  failed && "bg-deal-high/10 text-deal-high-text",
                )}
              >
                <Icon className={cn("h-6 w-6", waiting && "motion-safe:animate-pulse")} strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-callout font-semibold text-foreground">{title}</p>
                {orderId ? (
                  <p className="mt-0.5 truncate text-footnote text-label-2">
                    {t("acct.checkout.orderRef", "Order reference")}:{" "}
                    <span className="font-semibold tabular-nums text-foreground">{orderId}</span>
                  </p>
                ) : null}
              </div>
            </div>
            {waiting ? (
              <div className="space-y-2" aria-hidden>
                <Skeleton shape="text" className="w-3/4" />
                <Skeleton shape="text" className="w-1/2" />
              </div>
            ) : null}
            {error ? <p className="content-in text-footnote font-medium text-deal-high-text">{error}</p> : null}
            <div className="flex flex-wrap gap-2.5 border-t border-separator pt-5">
              <Button asChild>
                <Link to={paid ? "/dealer" : "/pricing"}>
                  {paid ? t("acct.checkout.openDealer", "Open dealer workspace") : t("acct.checkout.backToPricing", "Back to pricing")}
                </Link>
              </Button>
              {lookupFailed ? (
                <Button type="button" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
                  {t("acct.checkout.checkAgain", "Check again")}
                </Button>
              ) : null}
              {noOrder || failed || lookupFailed ? (
                <Button asChild variant="secondary">
                  <Link to="/profile">{t("acct.checkout.openAccount", "Open my account")}</Link>
                </Button>
              ) : null}
            </div>
          </Card>
        </m.div>
      </div>
    </PageCanvas>
  );
}
