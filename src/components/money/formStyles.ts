import type { CSSProperties } from "react";

export const INPUT_CLASS =
  "h-11 w-full rounded-xl border border-border bg-card px-3.5 text-footnote text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";
export const TEXTAREA_CLASS =
  "min-h-[88px] w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-footnote text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";
export const LABEL_CLASS = "mb-1.5 block text-caption font-semibold text-foreground";
export const PRIMARY_BUTTON_CLASS =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-footnote font-semibold text-primary-foreground transition-ui hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60";
/** Visually hidden honeypot: off-screen, not display:none, so naive bots still fill it. */
export const HONEYPOT_STYLE: CSSProperties = {
  position: "absolute",
  left: "-10000px",
  width: "1px",
  height: "1px",
  overflow: "hidden",
};
