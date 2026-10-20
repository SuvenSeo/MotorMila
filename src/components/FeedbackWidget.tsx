import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bug, Lightbulb, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { sendFeedback, type FeedbackInput } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAppPreferences } from "@/lib/appPreferences";

import { OPEN_FEEDBACK_EVENT } from "@/lib/feedbackEvents";

const LOCAL_FEEDBACK_KEY = "motormila.feedback.offline.v1";

function storeOfflineFeedback(payload: FeedbackInput) {
  if (typeof window === "undefined") return;
  try {
    const existing = JSON.parse(window.localStorage.getItem(LOCAL_FEEDBACK_KEY) || "[]");
    const rows = Array.isArray(existing) ? existing : [];
    window.localStorage.setItem(
      LOCAL_FEEDBACK_KEY,
      JSON.stringify([{ ...payload, saved_at: new Date().toISOString() }, ...rows].slice(0, 20)),
    );
  } catch {
    window.localStorage.setItem(LOCAL_FEEDBACK_KEY, JSON.stringify([{ ...payload, saved_at: new Date().toISOString() }]));
  }
}

export function FeedbackWidget() {
  const location = useLocation();
  const { t } = useAppPreferences();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackInput["category"]>("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(OPEN_FEEDBACK_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, handleOpen);
  }, []);

  const categoryOptions = useMemo(
    () =>
      [
        { value: "bug" as const, label: t("feedback.bug", "Bug"), icon: Bug },
        { value: "idea" as const, label: t("feedback.idea", "Idea"), icon: Lightbulb },
        { value: "data" as const, label: t("feedback.data", "Data issue"), icon: MessageSquare },
        { value: "ux" as const, label: t("feedback.ux", "UX"), icon: MessageSquare },
        { value: "general" as const, label: t("feedback.general", "General"), icon: MessageSquare },
      ] as const,
    [t],
  );

  const canSubmit = message.trim().length >= 8 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    const payload: FeedbackInput = {
      category,
      message: message.trim(),
      email: email.trim() || undefined,
      route: `${location.pathname}${location.search}`,
    };

    setSubmitting(true);
    try {
      await sendFeedback(payload);
      toast.success(t("feedback.sent", "Feedback sent"));
    } catch {
      storeOfflineFeedback(payload);
      toast.info(t("feedback.savedLocal", "Feedback saved locally and can be resent later"));
    } finally {
      setSubmitting(false);
      setMessage("");
      setEmail("");
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="floating-action-menu-item floating-control fixed bottom-20 left-5 z-40 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-card/90 text-muted-foreground shadow-soft-lg backdrop-blur transition-all duration-200 hover:border-primary/40 hover:text-primary active:scale-95 max-sm:hidden"
        aria-label={t("feedback.sendAria", "Send feedback")}
        title={t("feedback.title", "Send Feedback")}
      >
        <MessageSquare className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl tracking-tight">{t("feedback.title", "Send Feedback")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("feedback.description", "Send a bug, idea, data, user experience, or general note to the Motormila team.")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {categoryOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCategory(option.value)}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition-colors duration-200 active:scale-95 ${
                      category === option.value
                        ? "border-primary/35 bg-primary/12 text-primary"
                        : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {option.label}
                  </button>
                );
              })}
            </div>

            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t("feedback.placeholder", "What should Motormila fix or improve?")}
              className="min-h-[130px] rounded-xl border-border bg-surface text-sm text-foreground placeholder:text-muted-foreground"
            />

            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder={t("feedback.emailOptional", "Email optional")}
              className="h-10 rounded-xl border-border bg-surface text-sm text-foreground"
            />

            <div className="flex items-center justify-between gap-3">
              <p className="ui-caption font-semibold text-muted-foreground">
                {t("feedback.route", "Route:")} {location.pathname || "/"}
              </p>
              <Button
                disabled={!canSubmit}
                onClick={submit}
              className="h-10 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition-transform duration-200 hover:bg-primary active:scale-95 disabled:opacity-50 disabled:active:scale-100"
              >
                <Send className="mr-2 h-3.5 w-3.5" />
                {submitting ? t("feedback.sending", "Sending") : t("feedback.send", "Send")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
