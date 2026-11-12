import { englishT, type TranslateFn } from "@/lib/translate";

/**
 * Turns a failed API call into a sentence a person can act on. Raw
 * "API error 401: Authentication required." text never reaches the page.
 * Accepts an APIError, any Error, or an already-stringified message.
 */
export function friendlyApiError(err: unknown, fallback: string, t: TranslateFn = englishT): string {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const statusFromError =
    err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number"
      ? (err as { status: number }).status
      : null;
  const match = /^API error (\d{3})/.exec(message);
  const status = statusFromError ?? (match ? Number(match[1]) : null);

  if (status === 401) return t("apiError.session", "Your session has expired. Sign in again to continue.");
  if (status === 403) return t("apiError.forbidden", "Your account doesn't have access to this yet.");
  if (status === 429) return t("apiError.rateLimited", "Too many requests just now. Wait a moment and try again.");
  if (status !== null && status >= 500) {
    return t("apiError.unavailable", "Motormila's servers are busy right now. Try again in a minute.");
  }
  if (/failed to fetch|network|load failed|aborted/i.test(message)) {
    return t("apiError.network", "We couldn't reach Motormila. Check your connection and try again.");
  }
  if (!message || match) return fallback;
  return message;
}
