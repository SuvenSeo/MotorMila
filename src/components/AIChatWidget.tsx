import { scrollBehavior } from "@/lib/motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bot,
  Car,
  Check,
  ChevronDown,
  Copy,
  Database,
  ExternalLink,
  Gauge,
  Globe,
  Loader2,
  MessageCircle,
  Search,
  Send,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { type ChatListingResult, type ChatWebSource, sendChatMessage, formatPrice } from "@/services/api";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import { hasFullPlatformAccess } from "@/lib/planLimits";
import { safeExternalUrl } from "@/lib/safeExternalUrl";

const STORAGE_KEY = "motormila_chat_v2";
const TOOLTIP_KEY = "motormila_chat_tooltip_seen";
const genId = () => Math.random().toString(36).slice(2, 10);

type Message = {
  role: "user" | "assistant";
  content: string;
  id: string;
  listings?: ChatListingResult[];
  web_sources?: ChatWebSource[];
};

type PromptAction = {
  label: string;
  value: string;
};

type PageContext = {
  label: string;
  summary: string;
  prompts: PromptAction[];
};

const DEFAULT_PROMPTS: PromptAction[] = [
  { label: "Find a car", value: "Find practical cars under Rs. 8 million with strong value retention." },
  { label: "Best deals", value: "Show me the best deal opportunities right now." },
  { label: "Market snapshot", value: "Give me a live market snapshot and explain what changed." },
  { label: "Budget shortlist", value: "Build a shortlist for a family buyer with a realistic Sri Lanka budget." },
];

const CAPABILITIES = [
  { icon: Search, title: "Find", copy: "Shortlist cars by budget, model, fuel, year, district, and source." },
  { icon: Gauge, title: "Value", copy: "Explain fair price, confidence, comps, and negotiation room." },
  { icon: Database, title: "Operate", copy: "Read source freshness, pipeline status, and data gaps." },
];

function pageContextFor(pathname: string, search: string): PageContext {
  if (pathname.startsWith("/estimate")) {
    return {
      label: "Valuation studio",
      summary: "The user is on the valuation page and may need help choosing inputs, interpreting confidence, or negotiating from a price range.",
      prompts: [
        { label: "Explain inputs", value: "Help me choose valuation inputs and avoid bad assumptions." },
        { label: "Negotiation angle", value: "If the estimate comes back high or low, how should I negotiate?" },
        { label: "Confidence", value: "Explain valuation confidence and comparable depth in plain English." },
      ],
    };
  }

  if (pathname.startsWith("/calculator")) {
    return {
      label: "Finance desk",
      summary: "The user is using lease, duty, and tax planning tools and may need ownership-cost guidance.",
      prompts: [
        { label: "Lease plan", value: "Help me plan a lease around a realistic Sri Lankan vehicle budget." },
        { label: "Duty risk", value: "Explain how engine capacity and duty assumptions can change my decision." },
        { label: "Monthly cost", value: "Help me estimate total monthly ownership cost beyond the listing price." },
      ],
    };
  }

  if (pathname.startsWith("/trends")) {
    return {
      label: "Trend studio",
      summary: "The user is studying make/model price movement and may need help reading trends, sample size, and district effects.",
      prompts: [
        { label: "Read trend", value: "Explain how to read this make/model trend before buying." },
        { label: "Depreciation", value: "Which signals suggest a model is holding value or weakening?" },
        { label: "District effect", value: "How should I compare national and district-level movement?" },
      ],
    };
  }

  if (pathname.startsWith("/dealer")) {
    return {
      label: "Dealer command center",
      summary: "The user is in dealer mode and may need help with lead quality, stock pricing, arbitrage, and district demand.",
      prompts: [
        { label: "Price stock", value: "Help a dealer price inventory using demand and competitor gaps." },
        { label: "Lead priority", value: "Which lead and demand signals should I prioritize today?" },
        { label: "Arbitrage", value: "Explain current arbitrage opportunities by district and model." },
      ],
    };
  }

  if (pathname.startsWith("/pro")) {
    return {
      label: "Pro intelligence",
      summary: "The user is in the protected Pro dashboard reviewing KPI, district, segment, source, trend, and deal-score analytics.",
      prompts: [
        { label: "Read dashboard", value: "Explain the Pro dashboard and call out the most important market signals." },
        { label: "Find risk", value: "Where could this market data be misleading, and what should I verify first?" },
        { label: "Export brief", value: "Turn the current Pro analytics into a concise dealer or investor brief." },
      ],
    };
  }

  if (pathname.startsWith("/best-picks")) {
    return {
      label: "Best picks",
      summary: "The user is reviewing deal-score filtered listings and may need help comparing picks or spotting weak signals.",
      prompts: [
        { label: "Rank picks", value: "Rank the current best-pick style options by buyer usefulness." },
        { label: "Avoid traps", value: "What pricing traps should I watch for before contacting a seller?" },
        { label: "Shortlist", value: "Build a 3-car shortlist from strong value signals." },
      ],
    };
  }

  if (pathname.startsWith("/listing/")) {
    return {
      label: "Listing detail",
      summary: "The user is inspecting one listing and may need seller, price, finance, and comparable checks.",
      prompts: [
        { label: "Check this listing", value: "Help me inspect this listing for price, seller, mileage, and hidden risk." },
        { label: "Negotiate", value: "Give me a negotiation script for this vehicle." },
        { label: "Compare peers", value: "Compare this listing against similar market peers." },
      ],
    };
  }

  if (pathname.startsWith("/settings")) {
    return {
      label: "Preferences",
      summary: "The user is adjusting language and theme preferences.",
      prompts: [
        { label: "Set up workflow", value: "Suggest the best Motormila workflow for a buyer this week." },
        { label: "What can you do?", value: "Explain what you can help me do across this platform." },
        { label: "Start search", value: "Start a vehicle search from my budget and priorities." },
      ],
    };
  }

  return {
    label: search ? "Filtered dashboard" : "Market cockpit",
    summary: search
      ? `The user is on the main dashboard with URL filters: ${search}.`
      : "The user is on the main dashboard, browsing live inventory, market concentration, trends, and priced listings.",
    prompts: DEFAULT_PROMPTS,
  };
}

function formatMessage(content: string) {
  const lines = content.split("\n").filter((line) => line.trim() !== "");
  const elements: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flush = (key: string) => {
    if (!bullets.length) return;
    elements.push(
      <ul key={key} className="mt-2 list-disc space-y-1 pl-4">
        {bullets.map((bullet, index) => (
          <li key={index}>{bullet}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
      bullets.push(trimmed.replace(/^(-|\*|•)\s*/, ""));
      return;
    }

    flush(`b-${index}`);
    elements.push(
      <p key={`p-${index}`} className="mb-2 last:mb-0">
        {line}
      </p>,
    );
  });

  flush("b-final");
  return <div>{elements}</div>;
}

function ListingResults({ messageId, listings }: { messageId: string; listings?: ChatListingResult[] }) {
  const { t } = useAppPreferences();
  const { hasProAccess, isAdmin } = useAuth();
  const showScores = hasFullPlatformAccess({ hasProAccess, isAdmin });
  if (!Array.isArray(listings) || listings.length === 0) return null;

  return (
    <div className="grid w-full max-w-[330px] gap-2">
      {listings.slice(0, 3).map((item) => {
        const sourceUrl = safeExternalUrl(item.external_url);
        return (
          <div key={`${messageId}-${item.id}`} className="rounded-2xl border border-border bg-surface p-3 transition-colors hover:border-primary/40">
            <p className="line-clamp-2 text-xs font-bold leading-snug text-foreground">{item.title}</p>
            <p className="mt-1 ui-caption num text-muted-foreground">
              {item.price_lkr ? formatPrice(item.price_lkr) : t("chat.card.priceUnavailable", "Price unavailable")}
              {item.district ? ` · ${item.district}` : ""}
              {showScores && typeof item.deal_score === "number" ? ` · ${item.deal_score.toFixed(0)} score` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.detail_url && (
                <Link
                  to={item.detail_url}
                  className="tech-label font-bold text-primary no-underline hover:text-primary"
                >
                  {t("chat.card.openListing", "Open Listing")}
                </Link>
              )}
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 tech-label font-bold text-muted-foreground no-underline hover:text-foreground"
                >
                  {t("chat.card.source", "Source")}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WebSourcesPanel({ sources }: { sources: ChatWebSource[] }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div className="w-full max-w-[330px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 tech-label font-bold text-muted-foreground transition-colors hover:text-foreground"
      >
        <Globe className="h-3 w-3 text-primary" />
        {sources.length} web {sources.length === 1 ? "source" : "sources"}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-1.5 grid gap-1.5">
          {sources.map((src, i) => (
            <a
              key={`${i}-${src.url}`}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col gap-0.5 rounded-2xl border border-border bg-surface p-2.5 no-underline transition-colors hover:border-primary/30"
            >
              <span className="line-clamp-1 text-xs font-semibold text-foreground">{src.title}</span>
              <span className="line-clamp-2 ui-caption leading-snug text-muted-foreground">{src.snippet}</span>
              <span className="mt-0.5 inline-flex items-center gap-1 tech-label text-primary">
                <ExternalLink className="h-2.5 w-2.5" />
                {new URL(src.url).hostname.replace(/^www\./, "")}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function AIChatWidget() {
  const { t } = useAppPreferences();
  const { pathname, search } = useLocation();
  const pageContext = useMemo(
    () => pageContextFor(pathname, search),
    [pathname, search],
  );

  const [open, setOpen] = useState(false);
  const fabRef = useRef<HTMLButtonElement | null>(null);
  const [animOut, setAnimOut] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipOut, setTooltipOut] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const dismissTooltip = useCallback(() => {
    setTooltipOut(true);
    window.setTimeout(() => {
      setShowTooltip(false);
      setTooltipOut(false);
    }, 200);
    try {
      localStorage.setItem(TOOLTIP_KEY, "1");
    } catch {
      // Ignore storage write failures.
    }
  }, []);

  const closePanel = useCallback(() => {
    setAnimOut(true);
    window.setTimeout(() => {
      setOpen(false);
      setAnimOut(false);
      setLoading(false);
      setShowGuide(false);
    }, 220);
  }, []);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setMessages(parsed.slice(-24));
      }
    } catch {
      // Ignore storage read failures.
    }

    const seen = localStorage.getItem(TOOLTIP_KEY);
    if (!seen) {
      const timer = window.setTimeout(() => setShowTooltip(true), 2000);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (!showTooltip) return;
    const timer = window.setTimeout(() => dismissTooltip(), 8000);
    return () => window.clearTimeout(timer);
  }, [showTooltip, dismissTooltip]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-24)));
    } catch {
      // Ignore storage write failures.
    }
  }, [messages, mounted]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: scrollBehavior() });
  }, [messages, loading]);

  // The open panel blocks the page behind a backdrop — behave like a dialog:
  // Escape closes and focus returns to the launcher button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closePanel();
        fabRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closePanel]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [open]);

  const clearChat = () => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage write failures.
    }
  };

  const copyMessage = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1200);
    } catch {
      // Ignore clipboard errors.
    }
  };

  const sendPrompt = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: "user", content: trimmed, id: genId() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const history = next.map((message) => ({ role: message.role, content: message.content }));
      const response = await sendChatMessage(trimmed, history, {
        pageContext: {
          route: `${location.pathname}${location.search}`,
          page: pageContext.label,
          summary: pageContext.summary,
        },
      });
      setMessages([
        ...next,
        { role: "assistant", content: response.response, id: genId(), listings: response.listings || [], web_sources: response.web_sources || [] },
      ]);
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : "";
      const fallback =
        errMessage.includes("API error")
          ? t("chat.error.serviceUnavailable", "The assistant service is temporarily unavailable. Please try again in a moment.")
          : t("chat.error.connection", "Connection issue. Please try again.");
      setMessages([...next, { role: "assistant", content: fallback, id: genId() }]);
    } finally {
      setLoading(false);
    }
  };

  const promptActions = pageContext.prompts.length ? pageContext.prompts : DEFAULT_PROMPTS;

  return (
    <div className="aw">
      {open && <div className="aw-backdrop" />}

      {showTooltip && !open && (
        <div
          className={`${tooltipOut ? "aw-tooltip-out" : "aw-tooltip-in"} fixed bottom-7 right-[92px] z-[9998] hidden max-w-[250px] items-center gap-3 rounded-2xl border border-primary/25 bg-popover/95 px-3 py-3 shadow-soft-lg backdrop-blur-2xl sm:flex`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/12 text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <p className="m-0 text-xs font-bold text-foreground">{t("chat.tooltip.title", "Ask Motormila Copilot")}</p>
            <p className="m-0 mt-1 ui-caption leading-snug text-muted-foreground">
              {t("chat.tooltip.subtitle", "Find, value, compare, and inspect cars")}
            </p>
          </div>
        </div>
      )}

      <button
        ref={fabRef}
        type="button"
        aria-label={open ? t("chat.close", "Close Motormila Copilot") : t("chat.open", "Open Motormila Copilot")}
        aria-expanded={open}
        onClick={() => {
          if (showTooltip) dismissTooltip();
          if (open) closePanel();
          else setOpen(true);
        }}
        className="aw-fab aw-fab-wrapper group flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-card text-primary shadow-soft-lg transition-transform active:scale-95"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {open && (
        <section
          role="dialog"
          aria-modal="false"
          className={`aw-panel-wrapper ${animOut ? "aw-panel-out" : "aw-panel-in"} flex flex-col overflow-hidden rounded-3xl border border-border/80 bg-card/90 text-foreground shadow-soft-xl backdrop-blur-2xl dark:border-white/12`}
          aria-label={t("chat.header.title", "Motormila Copilot")}
        >
          <header className="border-b border-border px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/12 text-primary">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold tracking-tight">{t("chat.header.title", "Motormila Copilot")}</p>
                  <p className="mt-0.5 truncate tech-label font-bold text-muted-foreground">
                    {t("chat.header.status", "Live market assistant")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowGuide((value) => !value)}
                  className={`aw-ctrl flex h-9 w-9 items-center justify-center rounded-2xl border transition-colors ${
                    showGuide
                      ? "border-primary/35 bg-primary/12 text-primary"
                      : "border-border bg-surface text-muted-foreground hover:text-foreground"
                  }`}
                  aria-label={t("chat.header.title", "Motormila Copilot")}
                >
                  <Settings2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={closePanel}
                  className="aw-ctrl flex h-9 w-9 items-center justify-center rounded-2xl border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={t("chat.close", "Close Motormila Copilot")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {showGuide && (
              <div className="mt-4 grid gap-2 rounded-2xl border border-border bg-surface p-3">
                {CAPABILITIES.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="flex gap-3 rounded-2xl bg-card p-2.5">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-xs font-bold text-foreground">{item.title}</p>
                        <p className="mt-0.5 ui-caption leading-snug text-muted-foreground">{item.copy}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </header>

          <div className="aw-scroll flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="aw-msg rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 tech-label font-bold text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  {pageContext.label}
                </div>
                <h2 className="mt-3 text-xl font-bold tracking-tight text-foreground">
                  {t("chat.intro", "Ask the market copilot before you decide.")}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(
                    "chat.introBody",
                    "I can search live listings, explain fair value, compare options, surface deal risk, and read pipeline freshness.",
                  )}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {promptActions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => sendPrompt(action.value)}
                      className="aw-chip rounded-2xl border border-border bg-surface px-3 py-2 text-left text-label font-mono font-bold text-foreground transition-colors hover:border-primary/40"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 space-y-4">
              {messages.map((message) => {
                const assistant = message.role === "assistant";
                return (
                  <div
                    key={message.id}
                    className={`flex flex-col gap-2 ${assistant ? "items-start" : "items-end"}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
                        assistant
                          ? "border-border bg-card text-foreground"
                          : "border-primary/25 bg-primary/12 text-primary-bright dark:text-primary font-medium"
                      }`}
                    >
                      {assistant ? formatMessage(message.content) : message.content}
                    </div>

                    {assistant && <ListingResults messageId={message.id} listings={message.listings} />}

                    {assistant && <WebSourcesPanel sources={message.web_sources ?? []} />}

                    {assistant && (
                      <button
                        type="button"
                        onClick={() => copyMessage(message.id, message.content)}
                        className="inline-flex items-center gap-1 tech-label font-bold text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {copiedId === message.id ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                        {copiedId === message.id ? t("chat.copied", "Copied") : t("chat.copy", "Copy")}
                      </button>
                    )}
                  </div>
                );
              })}

              {loading && (
                <div className="inline-flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary-bright">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("chat.thinking", "Reading live market context...")}
                </div>
              )}
            </div>
            <div ref={bottomRef} />
          </div>

          <footer className="border-t border-border p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {promptActions.slice(0, 2).map((action) => (
                <button
                  key={`footer-${action.label}`}
                  type="button"
                  onClick={() => sendPrompt(action.value)}
                  className="aw-chip rounded-2xl border border-border bg-card px-2.5 py-1.5 tech-label font-bold text-muted-foreground transition-colors hover:text-foreground"
                >
                  {action.label}
                </button>
              ))}
              <button
                type="button"
                onClick={clearChat}
                className="aw-chip rounded-2xl border border-border bg-surface px-2.5 py-1.5 tech-label font-bold text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("chat.quick.clear", "Clear")}
              </button>
            </div>

            <div className={`aw-input-wrap flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 ${focused ? "focused" : ""}`}>
              <Car className="mb-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendPrompt(input);
                  }
                }}
                placeholder={t("chat.placeholder", "Ask about budget, value, listings, or seller risk...")}
                rows={1}
                className="min-h-10 flex-1 resize-none bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => sendPrompt(input)}
                disabled={!input.trim() || loading}
                className="aw-send flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground transition-transform active:scale-95 disabled:bg-surface disabled:text-muted-foreground disabled:active:scale-100"
                aria-label={t("chat.send", "Send message")}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 tech-label font-bold text-muted-foreground">
              {t("chat.enterHint", "Enter to send · Shift+Enter for new line")}
            </p>
          </footer>
        </section>
      )}
    </div>
  );
}
