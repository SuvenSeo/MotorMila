import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, Loader2, Receipt, XCircle } from "lucide-react";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { getPayhereOrder } from "@/lib/moneyApi";

/** PayHere return_url. PayHere passes no status here, so we poll our own order record. */
export default function CheckoutReturn() {
  const [params] = useSearchParams();
  const orderId = params.get("order_id") ?? "";
  const [status, setStatus] = useState<string>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setStatus("unknown");
      return;
    }
    let cancelled = false;
    let tries = 0;
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
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't check the payment.");
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const paid = status === "paid";
  const waiting = status === "checking" || status === "created" || status === "pending";
  // No order_id at all (direct visit, bookmark, stripped redirect) is not a
  // failure: show a neutral "nothing to confirm" state, never red.
  const noOrder = status === "unknown";
  const Icon = paid ? CheckCircle2 : waiting ? Clock : noOrder ? Receipt : XCircle;
  const title = paid
    ? "Payment received"
    : waiting
      ? "Confirming your payment"
      : noOrder
        ? "No payment to confirm"
        : "Payment not completed";
  const body = paid
    ? "Your plan is active. Sign out and back in if you don't see it straight away."
    : waiting
      ? "PayHere is confirming the payment with us. This usually takes a few seconds."
      : noOrder
        ? "This page confirms a PayHere checkout. Start from Pricing to choose a plan, or open your account to see an existing one."
        : "No money was taken for this order, or it was cancelled. You can try again or pay by bank transfer or KOKO.";

  return (
    <PageCanvas>
      <PageHero theme="default" eyebrow="Checkout" eyebrowIcon={Icon} watermarkIcon={Icon} title={<>{title}<span className="text-sheen">.</span></>} description={body} />
      <PageBody>
        <div role="status" className="max-w-xl space-y-4 rounded-[1.75rem] border border-border bg-card p-6 text-footnote">
          {waiting && <p className="flex items-center gap-2"><Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Checking order {orderId || "…"}</p>}
          {error && <p className="text-destructive">{error}</p>}
          {orderId && <p className="text-muted-foreground">Order reference: <span className="num font-semibold text-foreground">{orderId}</span></p>}
          <div className="flex flex-wrap gap-2">
            <Link to={paid ? "/dealer" : "/pricing"} className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-caption font-semibold text-primary-foreground no-underline">
              {paid ? "Open dealer workspace" : "Back to pricing"}
            </Link>
          </div>
        </div>
      </PageBody>
    </PageCanvas>
  );
}
