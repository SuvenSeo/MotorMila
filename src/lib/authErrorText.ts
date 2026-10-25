import type { AuthErrorCode, AuthResult } from "@/lib/authContext";
import { englishT, type TranslateFn } from "@/lib/translate";

/** Translated sentence for a failed sign-in / sign-up; falls back to the API's own text. */
export function authErrorText(result: Pick<AuthResult, "error" | "code">, fallback: string, t: TranslateFn = englishT): string {
  const byCode: Record<AuthErrorCode, string> = {
    invalid: t("auth.error.invalid", "Invalid email or password."),
    unavailable: t("auth.error.unavailable", "Sign-in is temporarily unavailable. Please try again in a few minutes."),
    network: t("auth.error.network", "We couldn't reach Motormila. Check your connection and try again."),
    rate_limited: t("auth.error.rateLimited", "Too many attempts. Wait a few minutes and try again."),
  };
  if (result.code) return byCode[result.code];
  return result.error || fallback;
}
